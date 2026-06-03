---
order: 20
slug: "l20-matrix-multiplexing"
title: "Matrix Multiplexing — Many LEDs, Few Pins"
title_en: "Matrix Multiplexing"
icon: "i-lucide-grid-3x3"
track: "bonus"
level: "advanced"
minutes: 45
tags: ["matrix", "multiplexing", "pov", "led"]
---

# Lesson 20: Matrix Multiplexing — Many LEDs, Few Pins 🪩

> **Hardware:** CH32V003 + 9 ordinary LEDs (for the 3×3 example) + 9 × 220Ω resistors.
> **Prerequisite:** [L06 SysTick](/en/lessons/l06-systick) — we'll build the scan loop on top of it.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example from this lesson. The examples below assume these definitions are present.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_APB2PCENR   (*(volatile u32*)(RCC_BASE + 0x18))

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_CFGLR     (*(volatile u32*)(GPIOC_BASE + 0x00))
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── GPIOD ──────────────────────────────────────────────
#define GPIOD_BASE    0x40011400
#define GPIOD_CFGLR     (*(volatile u32*)(GPIOD_BASE + 0x00))
#define GPIOD_BSHR      (*(volatile u32*)(GPIOD_BASE + 0x10))
#define GPIOD_BCR       (*(volatile u32*)(GPIOD_BASE + 0x14))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// ── SysTick ──────────────────────────────────────────────
#define SysTick_BASE    0xE000F000
#define STK_CTLR        (*(volatile u32*)(SysTick_BASE + 0x00))
#define STK_SR          (*(volatile u32*)(SysTick_BASE + 0x04))
#define STK_CNT         (*(volatile u32*)(SysTick_BASE + 0x08))
#define STK_CMP         (*(volatile u32*)(SysTick_BASE + 0x10))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. The problem

You want to build an 8×8 LED display (64 LEDs) but the MCU only has 18 pins on the J4M6. How? The answer is **multiplexing**: divide the LEDs into a grid of rows and columns. Instead of 64 pins, you need 8+8 = **just 16 pins**.

---

## 1. The core idea

```
        Col0   Col1   Col2
         │      │      │
Row0 ────●──────●──────●──── LED 0,1,2
         │      │      │
Row1 ────●──────●──────●──── LED 3,4,5
         │      │      │
Row2 ────●──────●──────●──── LED 6,7,8
```

- **3 rows + 3 columns = 6 pins for 9 LEDs** (instead of 9 pins)
- 8×8 = 16 pins for 64 LEDs
- 16×16 = 32 pins for 256 LEDs

> 💡 But the trick: we don't light all the LEDs at once — we light **one row at a time**.

---

## 2. The Persistence-of-Vision (POV) technique

The human eye can't distinguish blinks faster than **~60 Hz**. If we switch the active row faster than that, the viewer perceives all rows as continuously lit.

```
time
 t=0    Row0 ON, Cols (on/off per the pattern)
 t=1ms  Row0 OFF → Row1 ON, Cols
 t=2ms  Row1 OFF → Row2 ON, Cols
 t=3ms  Row2 OFF → Row0 ON …
```

- 3 rows × 1 ms per row = full frame every 3 ms = **333 Hz** ⇒ far above any flicker
- 8 rows × 1 ms = 125 Hz ⇒ safe
- 16 rows × 1 ms = 62.5 Hz ⇒ borderline — shorten the per-row time

> 🎯 **Rule**: refresh rate = 1 / (number of rows × time per row). Aim for ≥ 100 Hz to be safe.

---

## 3. Wiring

### Simple version (common cathode)

```
           VCC
            │
           [R]   ← 220Ω resistor per column
            │
    ●───────●─── Col0
    │       │
   LED     LED
    │       │
   Row0   Row1   ← rows connect directly to GPIO
```

- **Row** = Output. At `HIGH` the row becomes "active" (the source).
- **Col** = Output. At `LOW` the path completes → the LED lights.

### Rule:
- To light an LED at position `(row, col)`: set row `row = HIGH` and column `col = LOW`.
- All other rows and columns: `Z` (high-impedance) or inverted.

---

## 4. 3×3 code — a static pattern

We want to display an **X**:

```
pattern[0] = 1 0 1
pattern[1] = 0 1 0
pattern[2] = 1 0 1
```

> 💡 The `GPIOC_*`, `GPIOD_*`, and `RCC_APB2PCENR` definitions are in the **📋 Register definitions** block above.

```c
// PC0..PC2 = rows (3 pins)
// PD0..PD2 = columns (3 pins)

// Frame pattern: each row = 3 bits (the upper 5 bits are ignored)
const uint8_t frame[3] = {
    0b101,   // ⬛⬜⬛
    0b010,   // ⬜⬛⬜
    0b101    // ⬛⬜⬛
};

void matrix_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 5)  /* IOPDEN */;

    // PC0..PC2 = Output Push-Pull
    for (int p = 0; p <= 2; p++) {
        GPIOC_CFGLR &= ~(0xF << (4 * p));
        GPIOC_CFGLR |=  (0x3 << (4 * p));
    }
    // PD0..PD2 = Output Push-Pull
    for (int p = 0; p <= 2; p++) {
        GPIOD_CFGLR &= ~(0xF << (4 * p));
        GPIOD_CFGLR |=  (0x3 << (4 * p));
    }

    // Start everything off: rows LOW, columns HIGH
    GPIOC_BCR  = 0b111;
    GPIOD_BSHR = 0b111;
}

static uint8_t current_row = 0;

void matrix_scan_step(void) {
    // 1) Turn off the previous row (BCR over all row bits)
    GPIOC_BCR = 0b111;

    // 2) Drive the columns from the new row's pattern (LOW = LED ON)
    uint8_t cols = frame[current_row];
    GPIOD_BSHR = (~cols & 0b111);  // BSHR = bits to set HIGH (= LED OFF)
    GPIOD_BCR  = (cols  & 0b111);  // BCR  = bits to set LOW  (= LED ON)

    // 3) Energize the new row
    GPIOC_BSHR = (1 << current_row);

    // 4) Prepare the next row for the next tick
    current_row = (current_row + 1) % 3;
}
```

---

## 5. Driving the scan from SysTick

```c
volatile uint32_t ticks = 0;

void SysTick_Handler(void) __attribute__((interrupt));
void SysTick_Handler(void) {
    STK_SR = 0;
    ticks++;
    matrix_scan_step();   // every 1ms = 333Hz refresh
}

void systick_init(void) {
    STK_CTLR = 0;
    STK_CNT  = 0;
    STK_CMP  = 48000 - 1;   // 1ms @ 48MHz
    STK_CTLR = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
    PFIC_IENR1 |= (1u << 12); /* SysTicK_IRQn = 12 */
}

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    matrix_init();
    systick_init();
    while (1) {
        __asm__ volatile ("wfi");   // sleep until the next tick
    }
}
```

---

## 6. Double Buffering — to avoid tearing

When you update the frame from the main loop, if SysTick fires in the middle of the write → the first rows show the old data and the rest show the new data → **tearing**.

The fix: two copies of the frame.

```c
volatile uint8_t frame_front[3];   // what SysTick displays
volatile uint8_t frame_back[3];    // what the main loop writes to
volatile uint8_t swap_request = 0;

void SysTick_Handler(void) __attribute__((interrupt));
void SysTick_Handler(void) {
    STK_SR = 0;

    // At the start of a new frame (current_row == 0), swap if requested
    if (current_row == 0 && swap_request) {
        for (int r = 0; r < 3; r++) frame_front[r] = frame_back[r];
        swap_request = 0;
    }
    matrix_scan_step_from(frame_front);
}

void matrix_show(const uint8_t *new_frame) {
    for (int r = 0; r < 3; r++) frame_back[r] = new_frame[r];
    swap_request = 1;
    // The swap happens on the next tick — no edits during display
}
```

> 🧠 **Rule**: don't touch what the ISR is reading without a synchronization mechanism. Double-buffer + flag = a common, safe pattern.

---

## 7. Brightness control (soft PWM)

You can dim the LEDs by turning them on for only part of the row's time:

```c
// Row time 1ms = 48000 cycles. Show the LED for 50% of it:
matrix_scan_step();
delay(24000 / 3);
GPIOD_BSHR = 0b111;   // turn off every column before the tick ends
```

Cleaner: a higher SysTick rate (e.g. 10kHz) + an internal counter that decides when to turn off.

---

## 8. Common mistakes

| Symptom | Cause | Fix |
|---------|------|-------|
| All LEDs always on | Didn't turn off the previous row before energizing the new one | Do `GPIOC_BCR = ...` first |
| Visible flicker | Scan rate < 60 Hz | Shorten the per-row time or reduce row count |
| Crossed LEDs lighting (ghosting) | Pull-ups or leakage paths | Use push-pull, verify your grounds |
| Uneven brightness | Some rows on for longer | Use a steady SysTick instead of Delay |
| Matrix dies after minutes | Excess current on a single pin | Add per-column resistors |
| Tearing during updates | Editing the frame during scan | Use double buffering |

---

## 9. Current budget — a warning

Each GPIO on the CH32V003 can **sink/source** up to **8 mA** (the recommended limit). On a 3×3:

- one active row × 3 columns × 5 mA (per LED) = 15 mA on the row pin. **Out of spec!**

**Fix**: use a **transistor** (like a 2N2222) as a row switch, or a dedicated IC like a **74HC595** or **TPIC6B595** to drive the columns.

> 🔑 On 8×8 grids (8 LEDs per row) you **must** use an external driver — don't run the LEDs straight off MCU pins.

---

## 10. Exercises

1. **3×3 X-pattern**: implement the code above and verify the X appears.
2. **Animation**: alternate between X and O every second.
3. **Brightness control**: a button cycles brightness (high/medium/low) by tweaking the duty cycle.
4. **8×8 character display**: lay out 8 rows + 8 columns, display a character from an 8×8 font.
5. **Scrolling text**: scroll the string `"SHAKIR"` horizontally.

---

## 11. Next step

In [Lesson 21: Final Project](/en/lessons/l21-final-project) you'll glue everything together: Matrix + UART for commands + Flash for saving the last pattern + Watchdog for safety.

---

## 📖 References

- **bitluni/Mdot2Matrix** — one of the cleanest multiplexing implementations on the CH32V003.
- *AVR Multiplexing Tutorial* (Sparkfun) — general concept, portable to any MCU.
- *TPIC6B595 datasheet* — the preferred driver for columns on big matrices.
