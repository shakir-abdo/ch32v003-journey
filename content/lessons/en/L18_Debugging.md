---
order: 18
slug: "l18-debugging"
title: "Debugging — Diagnosing Without printf"
title_en: "Debugging Workflows"
icon: "i-lucide-bug"
track: "pro"
level: "advanced"
minutes: 40
tags: ["debug", "minichlink"]
---

# Lesson 18: Debugging — Tracking Down Bugs Without printf

> **Hardware:** CH32V003 + WCH-LinkE (programmer/debugger) + USB-UART.

---

## 0. Why is debugging important?

Because `printf` isn't always available (no UART, or the bug is in early init before UART is up, or the bug is inside an ISR). We need other tools:

1. **WCH-LinkE + minichlink**: flashing, debug via GDB, semihosting.
2. **LED breadcrumbs**: toggling an LED at specific points.
3. **GPIO toggle + oscilloscope/LA**: precise timing measurements.
4. **MCO on a pin**: monitor the clock.
5. **Hard-Fault analysis**: read core registers.
6. **Static analysis**: the compiler itself finds bugs.

---

## 1. The golden tool: WCH-LinkE

WCH-LinkE is a programmer + SWD/SDI debugger for WCH chips. It supports:

- ✅ Flash new firmware.
- ✅ Reset the chip.
- ✅ Halt/Run/Step via GDB.
- ✅ Live memory read/write.
- ✅ Breakpoints.

### The basic commands

```bash
# Flash + reset
minichlink -w firmware.bin flash -b

# Read full memory
minichlink -r dump.bin

# Unbrick (if the chip got locked)
minichlink -u
```

> 💡 On PlatformIO: `pio run -t upload` uses minichlink automatically.

---

## 2. Semihosting — `printf` over the debugger

Instead of UART, the chip prints messages via WCH-LinkE → the Linux/Windows host. No UART required at all.

In PlatformIO:

```ini
[env:dev]
upload_flags = -b
monitor_speed = 115200
build_flags = -DUSE_PRINTF_VIA_DEBUG
```

Then in code:

```c
extern int SDI_Printf_Enable(void);
extern int printf(const char *fmt, ...);

int main(void) {
    SDI_Printf_Enable();
    printf("Booted!\n");
    while (1) {
        printf("Counter: %u\n", millis());
        delay(1000 * 8000);
    }
}
```

Watch the output in the Serial Monitor.

> ⚠️ Semihosting is slow — don't use it inside fast loops.

---

## 3. LED Breadcrumbs — the simplest method

When the system hangs, you don't know **where** it stopped. Solution: toggle an LED at different points:

```c
#define BREAD(N) do { GPIOC_OUTDR = (N); } while (0)

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    led_init_4bits();   // 4 LEDs on PC0-PC3

    BREAD(1); init_uart();
    BREAD(2); init_i2c();
    BREAD(3); init_sensor();   // ← if it hangs here, the LEDs display "3"
    BREAD(4); loop();
}
```

When the crash happens, the LED pattern tells you the last point you reached.

---

## 4. GPIO Toggle + Logic Analyzer

The most accurate way to measure timing:

```c
#define DBG_HIGH()  GPIOC_BSHR = (1 << 0)
#define DBG_LOW()   GPIOC_BCR  = (1 << 0)

void critical_function(void) {
    DBG_HIGH();
    // The code we want to measure
    DBG_LOW();
}
```

Then on the logic analyzer, view PC0 and measure the pulse width = execution time.

> ⏱️ On a CH32V003 at 48MHz: each cycle = 20.83ns. You can measure precisely.

---

## 5. MCO — watching the clock on a scope

To confirm the clock system is working correctly:

```c
// Output SYSCLK on PC4
RCC_CFGR0 = (RCC_CFGR0 & ~RCC_CFGR0_MCO) | (0b100 << 24);

// PC4 = AF Push-Pull
GPIOC_CFGLR &= ~(0xF << (4*4));
GPIOC_CFGLR |=  (0b1011 << (4*4));
```

Hook an oscilloscope to PC4 and measure the frequency:
- If you see 24MHz → you're on HSI.
- If you see 48MHz → PLL is running.
- If you see an unexpected frequency → an RCC setup mistake.

> 📖 *RM, §3.3.5.4 — page 15.*

---

## 6. Hard-Fault Handler — dealing with crashes

Every crash in RISC-V (mret from a corrupted context, store to an invalid address, …) jumps to `Default_Handler`. Improve on it:

```c
__attribute__((interrupt))
void HardFault_Handler(void) {
    // Light all LEDs to alert the user about the crash
    GPIOC_BSHR = 0xFF;
    while (1);
}
```

Or save the CPU context to a known location:

```c
volatile uint32_t mcause, mepc, mtval;

__attribute__((interrupt))
void HardFault_Handler(void) {
    mcause = __read_csr(0x342);   // mcause
    mepc   = __read_csr(0x341);   // address of the offending instruction
    mtval  = __read_csr(0x343);
    while (1);
}
```

After the reset, read them out via debugger:

```bash
minichlink -m | grep mepc
```

---

## 7. Compiler warnings = your friends

```bash
-Wall -Wextra -Werror -Wshadow -Wundef
```

Examples of bugs they catch:

```c
int x;
if (x = 5) { ... }   // ⚠️ assignment in if (you meant ==)

uint8_t a = 256;     // ⚠️ overflow

void foo(int n) {
    int arr[n];      // ⚠️ VLA (Variable Length Array) — may blow the stack
}
```

---

## 8. Common memory bugs

### Stack Overflow

```c
void deep_recursion(int n) {
    char buf[256];   // ← every call eats 256 bytes
    deep_recursion(n + 1);  // ← BOOM (RAM=2KB!)
}
```

Discover it via:

```c
extern uint32_t _my_top_stack;
extern uint32_t _bss_end;

uint32_t stack_used(void) {
    uint32_t sp;
    __asm__("mv %0, sp" : "=r"(sp));
    return _my_top_stack - sp;
}
```

### NULL Pointer

```c
char *p = NULL;
*p = 0;     // ⚠️ writes to 0x00 → the vector table!
```

### Out-of-bounds

```c
uint8_t buf[10];
buf[10] = 0;   // ⚠️ out of bounds → overwrites the next variable
```

---

## 9. Recommended debug workflow

```
1. Write the code
   ↓
2. Build with -Wall -Wextra (don't ignore warnings)
   ↓
3. Run on hardware
   ↓
4. If it doesn't work:
   a. LED breadcrumbs (trace the flow)
   b. printf via UART/semihosting (inspect values)
   c. GPIO toggle + LA (timing)
   d. GDB step-through (last resort)
   ↓
5. If it crashes:
   a. Hard-Fault Handler (record mepc)
   b. Inspect the stack
```

---

## 10. Useful Linux tools

```bash
# objdump - the assembly
riscv-none-elf-objdump -d firmware.elf | less

# nm - symbols
riscv-none-elf-nm --size-sort firmware.elf

# size - section sizes
riscv-none-elf-size firmware.elf

# readelf - ELF details
riscv-none-elf-readelf -a firmware.elf
```

---

## 11. Exercises

1. **Hard-Fault demo**: write through a NULL pointer, catch the crash, print `mepc`.
2. **LED breadcrumb**: add breadcrumbs to each init step.
3. **MCO check**: measure SYSCLK on a scope.
4. **Stack peak**: measure max stack usage in a complex program.
5. **Semihosting**: use `printf` through WCH-LinkE and view the output.
6. **Assembly view**: open `firmware.objdump` and analyze `main()`.

---

## 📖 References

- **minichlink** — https://github.com/cnlohr/ch32v003fun/tree/master/minichlink
- **WCH-LinkE Manual** — on the WCH website.
- **QingKe V2 Manual** — for CSR details.
- **CH32V003 RM v1.9, §3.3.5.4 (MCO)** — page 15.
