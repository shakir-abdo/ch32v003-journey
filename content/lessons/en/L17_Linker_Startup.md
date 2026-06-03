---
order: 17
slug: "l17-linker-startup"
title: "Linker Script + Startup"
title_en: "Linker + Startup"
icon: "i-lucide-file-code"
track: "pro"
level: "advanced"
minutes: 40
tags: ["linker", "startup"]
---

# Lesson 17: Linker Script + Startup, In Depth

> **Reference:** GNU ld manual + CH32V003 RM v1.9 §1.2 (Memory Map).
> **Practical example:** the `link.ld` and `startup.c` files that ship with this project.

---

## 0. Why does this lesson matter?

Every time the chip is `Reset`, code starts executing before `main()`. That code is called **Startup**. It decides:

- ✅ Where the Stack Pointer begins.
- ✅ How initialized variables are copied from Flash to RAM.
- ✅ How the BSS gets zeroed.
- ✅ How we jump into `main()`.

And the **Linker Script** is what tells the linker:

- ✅ Where memory lives (Flash and RAM).
- ✅ Where each piece of code goes (`.text`, `.data`, `.bss`).
- ✅ How we mint symbols (`_data_start`, `_bss_end`, …).

Without understanding these two, you're building on quicksand.

---

## 1. Memory map of the CH32V003

> 📖 *RM, §1.2 "Memory Image" — pages 2-3.*

```
0x00000000  ┌────────────────────────┐
            │   Flash 16 KB          │ ← code + read-only data
0x00003FFF  └────────────────────────┘

0x20000000  ┌────────────────────────┐
            │   SRAM 2 KB            │ ← stack + heap + data + bss
0x200007FF  └────────────────────────┘

0x40000000  ┌────────────────────────┐
            │   Peripheral Registers │
            └────────────────────────┘

0xE0000000  ┌──────────────────────────────────┐
            │   Core Private (PFIC,SysTick)    │
            └──────────────────────────────────┘
```

---

## 2. The Linker Script — dissecting `link.ld`

```ld
MEMORY
{
    FLASH (rx) : ORIGIN = 0x00000000, LENGTH = 16K
    RAM   (rw) : ORIGIN = 0x20000000, LENGTH = 2K
}
```

We define two regions:
- **FLASH**: `(rx)` means read + execute (code).
- **RAM**: `(rw)` means read + write (variables).

### Entry point

```ld
ENTRY(Reset_Handler)
```

Tells the linker that `Reset_Handler` is the start. It's written into the ELF header as the entry point.

### The `.vectors` section

```ld
SECTIONS
{
    .vectors :
    {
        KEEP(*(.vectors))
    } > FLASH
```

- `KEEP` stops the linker from dropping this section even if it "appears" unused.
- It must be the **first thing in Flash** (at 0x00000000) because the processor reads the Vector Table from this address on reset.

### The `.text` section

```ld
    .text :
    {
        *(.text*)
    } > FLASH
```

- Gathers every `.text` section from all object files.
- Placed in FLASH.

### The `.rodata` section — read-only data

```ld
    .rodata :
    {
        *(.rodata*)
    } > FLASH
```

Things like `const char *msg = "hello";` land here.

### The `.data` section — initialized variables

```ld
    _data_load = LOADADDR(.data);
    .data :
    {
        _data_start = .;
        *(.data*)
        _data_end = .;
    } > RAM AT> FLASH
```

**The tricky breakdown**:

- `> RAM AT> FLASH` means: "executes from RAM, but the stored image is in FLASH".
- `_data_load` captures the address in FLASH (the LOAD address).
- `_data_start` and `_data_end` mark the data boundaries in RAM.

> 🧠 **Why the complexity?** Initialized variables (`int counter = 5;`) need their value to survive power loss → stored in FLASH. But we also need to modify them → so we copy them to RAM at boot.

### The `.bss` section — uninitialized variables

```ld
    .bss :
    {
        _bss_start = .;
        *(.bss*)
        _bss_end = .;
    } > RAM
```

Every `int x;` (without an initializer) lives here. The ABI says: its initial value must be 0.

### Stack Pointer

```ld
    _my_top_stack = ORIGIN(RAM) + LENGTH(RAM);
    /* = 0x20000000 + 0x800 = 0x20000800 */
}
```

Sets the stack to start at the **top** of RAM and grow **downward** (the convention on every processor).

---

## 3. The Startup — dissecting `startup.c`

### Vector Table

```c
__attribute__((section(".vectors"), used))
const u32 vector_table[] = {
    (u32)&_my_top_stack,    // [0] = Initial SP
    (u32)&Reset_Handler,    // [1] = Entry point
    ...
};
```

- `section(".vectors")` places the array into the section we defined in `link.ld`.
- `used` stops the compiler from dropping it if there's no direct reference.

> 🔑 **Note**: the first entry is the SP value (not an address), and from the second onward they are handler addresses.

### Reset Handler

```c
void Reset_Handler(void) {
    u32 *src, *dst;

    // 1. Copy .data from Flash to RAM
    src = &_data_load;
    dst = &_data_start;
    while (dst < &_data_end)
        *dst++ = *src++;

    // 2. Zero .bss
    for (dst = &_bss_start; dst < &_bss_end; dst++)
        *dst = 0;

    // 3. Enter main
    main();

    // 4. Never return
    while (1);
}
```

---

## 4. Scenario: what happens at boot (step by step)

```
1. NRST pin = HIGH or POR
   ↓
2. Processor reads the word at 0x00000000 → loads it into SP
   ↓
3. Processor reads the word at 0x00000004 → jumps to it (= Reset_Handler)
   ↓
4. Reset_Handler copies .data, zeroes .bss
   ↓
5. Reset_Handler calls main()
   ↓
6. main() initializes peripherals and enters while(1)
```

---

## 5. Improving the Startup — Init Arrays (for C++ or constructors)

In C++, for example, you may need to run constructors before `main()`:

```ld
.init_array :
{
    __init_array_start = .;
    KEEP(*(.init_array))
    __init_array_end = .;
} > FLASH
```

```c
extern void (*__init_array_start)(void);
extern void (*__init_array_end)(void);

void Reset_Handler(void) {
    // ... data/bss copy

    for (void (**fn)(void) = &__init_array_start; fn < &__init_array_end; fn++)
        (*fn)();    // executes constructors

    main();
}
```

---

## 6. Reserving a custom section (like a large buffer at a specific location)

Sometimes you want a buffer at the end of RAM:

```c
__attribute__((section(".big_buf")))
uint8_t big_buffer[512];
```

```ld
.big_buf 0x20000600 :
{
    *(.big_buf)
} > RAM
```

> 💡 Useful for DMA buffers, double buffers, audio.

---

## 7. Inspecting the output map

After a build, use:

```bash
riscv-none-elf-size firmware.elf
# text  data  bss   total
# 1234   16   200   1450

riscv-none-elf-objdump -h firmware.elf | head
# lists every section with its address
```

Or the map file:

```bash
gcc ... -Wl,-Map=firmware.map
# then read firmware.map to see every symbol and where it landed
```

---

## 8. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| An initialized variable is 0 | `.data` wasn't copied in startup | Re-check the copy loop |
| Crash immediately at boot | Vector Table isn't at 0x00000000 | Check `> FLASH` and the `.vectors` placement |
| Global variable holds garbage | `.bss` wasn't zeroed | Re-check the zeroing loop |
| Stack overflow | RAM full + stack growing | Enlarge RAM or shrink variables |
| `Hard Fault` with no clear cause | Writing to FLASH via a pointer | Double-check the memory region |
| Linker error: undefined `_data_start` | Symbol name mismatch in startup | Match it with the linker script |

---

## 9. Exercises

1. **Read `firmware.map`**: locate the addresses of `main`, `vector_table`, and `_my_top_stack`.
2. **Reserve a big BSS**: place a 1KB buffer in BSS and verify it's 0 at boot.
3. **Reserve a big DATA**: place an initialized array + print its value.
4. **Custom section**: put a variable at the end of RAM via attribute.
5. **Read the Vector Table** through the debugger: read memory at 0x00000000 and compare.

---

## 📖 References

- **GNU ld manual** — `info ld`.
- **RISC-V ABI Specification** — for the standard behavior.
- **CH32V003 RM v1.9, §1.2** — Memory map pages 2-3.
- Your files in this project: `link.ld` and `src/startup.c`.
