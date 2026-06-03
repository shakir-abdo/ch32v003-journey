---
order: 6
slug: "l06-systick"
title: "SysTick — non-blocking timing"
title_en: "SysTick Timing"
icon: "i-lucide-timer"
track: "io"
level: "beginner"
minutes: 30
tags: ["systick", "timer"]
---

# Lesson 06: SysTick — precise timing without Delay_Ms

> **Reference:** CH32V003 Reference Manual v1.9
> - Chapter 6.5.4 "STK Register Description" — pages 47-50
> - Chapter 6.2 "System Timer" — page 32
>
> **Hardware:** CH32V003J4M6 + LED.
> **Important:** SysTick on CH32V003 is the **QingKe SysTick** and is unlike the ARM Cortex-M SysTick. The registers differ from STM32.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example in this lesson. The samples below assume these definitions are in place.

```c
typedef unsigned int u32;

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_OUTDR     (*(volatile u32*)(GPIOC_BASE + 0x0C))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// ── SysTick ──────────────────────────────────────────────
#define SysTick_BASE    0xE000F000
#define STK_CTLR        (*(volatile u32*)(SysTick_BASE + 0x00))
#define STK_SR          (*(volatile u32*)(SysTick_BASE + 0x04))
#define STK_CNT         (*(volatile u32*)(SysTick_BASE + 0x08))
#define STK_CMP         (*(volatile u32*)(SysTick_BASE + 0x10))

// simple busy-loop delay (enough for the basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 Every address comes from *CH32V003 RM v1.9*, the chapter dedicated to each peripheral. The table is ordered by the sequence we use them in the lesson.

---


## 0. Quick refresher

> **Register** = a 32-bit box inside the chip with a numeric address.
> **Memory-Mapped I/O** = we control hardware by writing to specific addresses.

In this lesson the registers live in a special region called **Core Private Peripherals** at `0xE0000000`. This isn't in the `0x40xxxxxx` region because it's part of the processor core itself (QingKe Core), not a regular peripheral.

---

## 1. What is SysTick? And why do we need it?

Picture a small digital counter inside the processor that automatically increments on every clock tick. **That's SysTick.**

### The problem with `Delay_Ms`

```c
delay(500 * 8000);   // the CPU is "in a coma" for 500ms — doing nothing!
```

During that time:
- ❌ You can't read a button.
- ❌ You can't update UART.
- ❌ You can't save power.

### The solution: SysTick

A counter that runs **in the background** at the hardware level. It fires an **interrupt** every fixed interval (e.g. every 1ms). The CPU stays free to do other work while time is counted automatically.

---

## 2. SysTick architecture

A **32-bit** counter that counts up. A **CMP** (compare) register sets when we want the event.

```
   ┌──────────────────────┐
   │  Counter (CNT)       │ ← increments by +1 on every clock tick
   │     0, 1, 2, 3 …     │
   └──────────────────────┘
              │
              ▼ (compare)
   ┌──────────────────────┐
   │  CMP = 47999         │ ← target value
   └──────────────────────┘
              │
   When CNT == CMP:
       1. CNTIF flag = 1
       2. interrupt (if STIE=1)
       3. (if STRE=1) restart counting from 0
```

---

## 3. The four registers

| Register | Address | Description | RM reference |
|-------|---------|--------|---------------|
| `STK_CTLR` | `0xE000F000` | Control (Enable, IRQ, Source, Auto-reload) | §6.5.4.1, p.47 |
| `STK_SR` | `0xE000F004` | Event flag `CNTIF` | §6.5.4.2, p.48 |
| `STK_CNTL` | `0xE000F008` | Current counter value (32-bit) | §6.5.4.3, p.48 |
| `STK_CMPLR` | `0xE000F010` | Compare value (32-bit) | §6.5.4.4, p.49 |

> 📝 Note the jump from `0x008` to `0x010` (skipping `0x00C`) — that's how WCH designed it.

### Dissecting STK_CTLR (the most important register)

> 📖 *RM, §6.5.4.1 — page 47.*

| Bit | Name | Function |
|------|-------|---------|
| 0 | **STE** | System Counter Enable — `1` turns the counter on |
| 1 | **STIE** | System Counter Interrupt Enable — `1` enables the interrupt when `CNT == CMP` |
| 2 | **STCLK** | Source Select — `1`=HCLK, `0`=HCLK/8 |
| 3 | **STRE** | Auto-Reload — `1` restarts the count from 0 when CMP is reached |
| 31 | SWIE | Software trigger, for testing |

---

## 4. Computing the CMP value for a 1ms tick

### The base formula

```
CMP = (source frequency × desired time) - 1
```

### At 48 MHz (PLL) with STCLK=1 (HCLK direct):

```
CMP for 1ms = (48,000,000 × 0.001) - 1 = 47,999
```

### At 24 MHz (HSI default):

```
CMP for 1ms = (24,000,000 × 0.001) - 1 = 23,999
```

> 💡 The `-1` because counting starts at 0. If CMP=0, the interrupt fires after one tick.

### Handy ready-made values (at 48 MHz, STCLK=1)

| Time | CMP |
|-------|-----|
| 1 µs | 47 |
| 100 µs | 4,799 |
| 1 ms | 47,999 |
| 10 ms | 479,999 |
| 1 s | 47,999,999 |

---

## 5. Bitwise walkthrough for CTLR setup

We want: `STE=1, STIE=1, STCLK=1, STRE=1`.

```c
STK_CTLR = (1 << 0)  | (1 << 1) | (1 << 2) | (1 << 3);
//              ─STE──     ─STIE─    ─STCLK─    ─STRE──
//                ↓         ↓         ↓          ↓
//              0b0001 | 0b0010 | 0b0100 | 0b1000  =  0b1111  =  0xF
```

**Result**: `CTLR = 0xF`.

### Why write `=` directly instead of `|=`?

Because after reset the register is 0. We want every other bit to also be 0 (they're reserved). Direct assignment is clearer.

---

## 6. The complete code — interrupt every 1ms

```c
volatile uint32_t ticks_ms = 0;

void systick_init(void) {
    // clear everything first
    STK_CTLR = 0;
    STK_CNT  = 0;
    STK_SR   = 0;

    // 1ms at 48 MHz
    STK_CMP  = 48000 - 1;

    // STE=1, STIE=1, STCLK=1 (HCLK), STRE=1 (auto-reload)
    STK_CTLR = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);

    // Enable the interrupt in PFIC (NVIC)
    PFIC_IENR1 |= (1u << 12); /* SysTick_IRQn = 12 */
}

__attribute__((interrupt))
void SysTick_Handler(void) {
    STK_SR = 0;       // clear the CNTIF flag (write 0)
    ticks_ms++;
}
```

> ⚠️ **Clearing CNTIF**: the documentation is ambiguous and says "write 0 to clear, write 1 to invalidate" — we write `0` (the practical reality).

---

## 7. The golden functions: `millis()` and `delay_ms()`

```c
static inline uint32_t millis(void) {
    return ticks_ms;
}

void delay_blocking_ms(uint32_t ms) {
    uint32_t start = ticks_ms;
    while ((ticks_ms - start) < ms) {
        __asm__ volatile ("wfi");   // sleep until the next interrupt
    }
}
```

### Why `wfi`?

`wfi` = **Wait For Interrupt** — a RISC-V instruction that halts the CPU until an interrupt arrives. During that time:
- The CPU is in a low-power state.
- It doesn't burn clock cycles.
- It wakes automatically on an interrupt.

> 💎 The big difference between `wfi` and `for(i=0;i<N;i++)`:
> - `for` burns power for nothing.
> - `wfi` puts the CPU in "light sleep".

### Why `(ticks_ms - start) < ms` instead of `ticks_ms < start + ms`?

To avoid 32-bit overflow bugs. Subtraction works correctly even on overflow thanks to `unsigned` modular arithmetic.

---

## 8. Simple multi-tasking pattern (cooperative scheduler)

```c
uint32_t last_blink = 0, last_button = 0;

int main(void) {
    // HSI = 24 MHz by default at boot — no setup needed here
    led_init();
    button_init();
    systick_init();

    while (1) {
        uint32_t now = millis();

        if (now - last_blink >= 500) {       // every 500ms
            last_blink = now;
            GPIOC_OUTDR ^= (1 << 1);        // toggle LED
        }

        if (now - last_button >= 10) {       // every 10ms
            last_button = now;
            // poll button + debouncing
        }

        __asm__ volatile ("wfi");
    }
}
```

> 💎 This pattern (state machine + millis) is **the foundation** of every professional firmware. Later when you learn an RTOS, you'll understand why this pattern opens doors.

---

## 9. Microsecond timing (for WS2812B and similar)

For precise timing below 1ms, read `CNT` directly:

```c
void delay_us_busy(uint32_t us) {
    uint32_t start = STK_CNT;
    uint32_t cycles = us * (SYSTEM_CORE_CLOCK / 1000000);   // 48 at 48MHz
    while ((STK_CNT - start) < cycles);
}
```

> ⚡ **Busy-wait** but very precise and useful for bit-banging.

---

## 10. Bitwise walkthrough for clearing CNTIF

```c
STK_SR = 0;
```

We write 0 to the whole register. But in `SR` only bit 0 is writable (CNTIF). Bits 1-31 are reserved and writing anything to them is ignored.

> ✏️ Writing `0` = clear. Writing `1` = "invalidate" (write 1 to invalidate — rarely used).

---

## 11. Differences from ARM Cortex-M SysTick (for STM32 refugees)

| Difference | ARM SysTick | CH32V003 SysTick |
|-------|-------------|-------------------|
| Counter | 24-bit | **32-bit** |
| Direction | Down (from LOAD → 0) | **Up** (from 0 → CMP) |
| Registers | `LOAD/VAL/CTRL` | `CMP/CNT/CTLR` |
| Clearing | Automatic on read | Manual (write 0 to SR) |
| IRQ position | NVIC #15 | PFIC #12 |

> 📖 *RM, §6.3 Table 6-3 — page 32.*

---

## 12. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Interrupt never fires | Forgot to enable in `PFIC_IENR1` | `PFIC_IENR1 |= (1u << 12); /* SysTick_IRQn = 12 */` |
| `millis()` grows oddly slowly | Accidentally picked STCLK=0 (HCLK/8) | Set `STCLK=1` |
| Counter doesn't start | `STE=0` | Enable `STE` |
| Interrupt fires only once | Forgot `STRE` | Enable auto-reload |
| `ticks_ms` flickers when read from main | 32-bit variable read partially while an IRQ updates it | Read into a local once |
| `wfi` never wakes | Interrupt disabled in PFIC | Check the bit in `PFIC_IENR1` |

---

## 13. Exercises

1. **3 LEDs at different rates**: PC1 blinks 1Hz, PC2 blinks 2Hz, PC4 blinks 5Hz — all from one SysTick.
2. **Stopwatch**: start counting on a button press, stop on the next, display the time over UART.
3. **Software PWM with SysTick**: drive an LED at variable brightness via duty-cycle.
4. **Heartbeat**: a `long-short-long` pattern every 1.5 seconds.
5. **Time-based debouncing**: use `millis()` like in lesson 04 to handle the button without delays.

---

## 📖 References (with page numbers)

- **CH32V003 RM v1.9**:
  - §6.2 "System Timer" — page 32
  - §6.5.4.1 STK_CTLR — page 47
  - §6.5.4.2 STK_SR — page 48
  - §6.5.4.3 STK_CNTL — page 48
  - §6.5.4.4 STK_CMPLR — page 49
  - §6.3 "Vector Table" (for IRQ #12) — page 32
- **QingKe V2 RISC-V Processor Manual** — for the core-side detail if you want depth.
- **ch32v003fun**: `ch32v003_systick.c` as a very simple model of usage.
