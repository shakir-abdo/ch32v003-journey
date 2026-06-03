---
order: 3
slug: "l03-gpio-output"
title: "GPIO as Output — your first Blinky"
title_en: "GPIO Output (Blinky)"
icon: "i-lucide-lightbulb"
track: "foundation"
level: "beginner"
minutes: 20
tags: ["gpio", "blinky"]
---

# Lesson 03: GPIO as Output — your first Blinky project

> **Revised edition** | All references go to Reference Manual v1.9 Chapter 7 (GPIO).
> Corrections: full explanation of the CFGLR field (CNF + MODE), clarification that MODE=`0b11` (50MHz) is the most common, and a reminder that enabling the clock before anything else is essential.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example in this lesson. The samples below assume these definitions are in place.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_APB2PCENR   (*(volatile u32*)(RCC_BASE + 0x18))

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_CFGLR     (*(volatile u32*)(GPIOC_BASE + 0x00))
#define GPIOC_OUTDR     (*(volatile u32*)(GPIOC_BASE + 0x0C))
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// simple busy-loop delay (enough for the basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 Every address comes from *CH32V003 RM v1.9*, the chapter dedicated to each peripheral. The table is ordered by the sequence we use them in the lesson.

---


## Intro

This lesson covers the basic steps to configure a general-purpose I/O pin (GPIO) as an **output**. The practical project is to control the on-board LED — the famous "Blinky" project.

> 🎯 **By the time you finish this lesson you'll understand**: why every pin needs 4 bits in `CFGLR`, the difference between `BSHR/BCR` and `OUTDR`, and when to pick `push-pull` over `open-drain`.

---

## The project: blinking the LED on PC1

On most `CH32V003J4M6` (SO8) dev boards the on-board LED is wired to **PC1** (pin 6 on the package).

### The three steps

| # | Step | Register |
|---|---------|--------|
| 1 | Enable the Port C clock | `RCC_APB2PCENR` |
| 2 | Configure PC1 as Output Push-Pull | `GPIOC_CFGLR` |
| 3 | Drive the state (HIGH/LOW) | `GPIOC_BSHR` / `GPIOC_BCR` |

---

## Step 1 — enable the clock for the port

### Why?

To save power, every peripheral on the chip is **disabled by default**. Only the CPU + Flash + RAM are running. Any other peripheral needs its clock enabled manually.

### The register in charge

`RCC_APB2PCENR` (APB2 Peripheral Clock Enable Register) — every APB2 peripheral is enabled from here.

```c
// Define the register (once at the top of the file):
typedef unsigned int u32;
#define RCC_BASE      0x40021000
#define RCC_APB2PCENR (*(volatile u32*)(RCC_BASE + 0x18))
#define RCC_IOPCEN    (1u << 4)   // bit 4 = enable the GPIOC clock

// Enable the GPIOC clock:
RCC_APB2PCENR |= RCC_IOPCEN;
```

> 💡 Note: we define the register as a pointer to `volatile u32` at its absolute address `0x40021018`. We don't use any external framework. This is real bare-metal.

> 🎯 **`IOPCEN` is bit 4** — read §3.4.7 in the RM to see the complete `APB2PCENR` bit layout.

### Common pitfall

❌ **Don't write** `RCC_APB2PCENR = RCC_IOPCEN;` (it wipes every other peripheral you enabled previously).

✅ **Always use** `|=` to add a bit without clearing the rest.

### Alternative: the shorthand `GPIO_TypeDef`

If you allow yourself a few shortcuts, you can define the GPIOC registers as a `struct` to shorten the writing:

```c
typedef struct {
    volatile u32 CFGLR;   // 0x00
    volatile u32 CFGHR;   // 0x04 (unused on CH32V003)
    volatile u32 INDR;    // 0x08
    volatile u32 OUTDR;   // 0x0C
    volatile u32 BSHR;    // 0x10
    volatile u32 BCR;     // 0x14
    volatile u32 LCKR;    // 0x18
} gpio_t;

#define GPIOC ((gpio_t*)0x40011000)

// then: GPIOC_CFGLR &= ~(0xFu << 4);
```

> 💎 In this curriculum we prefer the **direct `#define`** because it makes the address and offset explicit. The struct is a handy shortcut but it hides the offset.

---

## Step 2 — configure the pin mode

### The register in charge

`GPIOC_CFGLR` (Configuration Low Register) — controls pins 0 to 7. **Each pin takes 4 bits** (total 32 bits = 8 pins).

### Dissecting the 4 bits

```
 bit3   bit2 │ bit1   bit0
 ────────────┼───────────────
   CNF[1:0]  │   MODE[1:0]
```

- **MODE[1:0]** — sets the direction (Input/Output) and the max speed:

  | `MODE` | Meaning |
  |--------|--------|
  | `00` | Input |
  | `01` | Output, max **10 MHz** |
  | `10` | Output, max **2 MHz** |
  | `11` | Output, max **50 MHz** |

- **CNF[1:0]** — sets the electrical type:

  | `CNF` (with MODE != 00) | Meaning |
  |------------------------|---------|
  | `00` | Push-Pull (most common) |
  | `01` | Open-Drain |
  | `10` | Alternate Function Push-Pull |
  | `11` | Alternate Function Open-Drain |

### The value we want for PC1 = Output Push-Pull 50 MHz

```
CNF=00 | MODE=11  →  0b0011  =  0x3
```

### Writing the code ("clear then write" pattern)

```c
// Register definition:
#define GPIOC_BASE  0x40011000
#define GPIOC_CFGLR (*(volatile u32*)(GPIOC_BASE + 0x00))

// 1) Clear the 4 bits belonging to PC1 (bits 4-7):
GPIOC_CFGLR &= ~(0xFu << (4 * 1));

// 2) Write 0b0011 = Push-Pull, 50MHz:
GPIOC_CFGLR |=  (0x3u << (4 * 1));
```

> 💡 **Why 50 MHz and not 10 MHz?** Higher slew-rate = sharper signal edges, very useful for PWM and WS2812B. The power-consumption difference is negligible for hobby projects.

### The general formula (useful to memorize)

```
GPIOC_CFGLR &= ~(0xFu << (4 * PIN_NUMBER));
GPIOC_CFGLR |=  (VAL  << (4 * PIN_NUMBER));
```

> ✏️ Note: for pins PC8 and above (not present on CH32V003 but available on larger WCH chips) you use `CFGHR` with the same pattern but `(4 * (PIN_NUMBER - 8))`.

---

## Step 3 — driving the LED

### The register in charge

`GPIOC_BSHR` (Bit Set/Reset Register) at address `0x40011010` — the best way to change the state of a single pin:

- **Atomic**: one write that can't be interrupted.
- **Interrupt-safe**: no need for `cli()` around it.
- **Doesn't affect the other pins**.

### Layout of the 32 bits

```
 bit 31 ─────────────── bit 16 │ bit 15 ─────────────── bit 0
        RESET (upper half)     │       SET (lower half)
        write 1 → pin LOW      │       write 1 → pin HIGH
```

### Examples

```c
#define GPIOC_BSHR (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR  (*(volatile u32*)(GPIOC_BASE + 0x14))
#define GPIOC_OUTDR (*(volatile u32*)(GPIOC_BASE + 0x0C))

// PC1 = HIGH (LED on)
GPIOC_BSHR = (1u << 1);

// PC1 = LOW (LED off) — two equivalent options:
GPIOC_BSHR = (1u << (16 + 1));   // via BSHR (upper half = RESET)
GPIOC_BCR  = (1u << 1);          // via BCR (cleaner, more common)
```

### Quick comparison of the three approaches

| Approach | Atomic? | Affects the rest? | Use case |
|---------|--------|--------------------|------------|
| `GPIOC_BSHR` / `GPIOC_BCR` | ✅ | ❌ | Best for moving a single pin |
| `GPIOC_OUTDR ^= (1u<<n)` | ❌ | possible (read-modify-write) | for synchronous toggling |
| `GPIOC_OUTDR = value` | ✅ | wipes everything else | when writing a full value (e.g. a counter) |

---

## The complete code — pure register-level Blinky

> 💡 Start by copying the definitions block from the **📋 Register definitions for this lesson** section at the top of the page to the top of `main.c`. Then copy this part below it. That gives you one complete file with no external `#include`.

```c
#define RCC_IOPCEN  (1u << 4)              // GPIOC clock-enable bit

void main(void) {
    // 1) GPIOC clock (HSI = 24 MHz by default, no setup needed)
    RCC_APB2PCENR |= RCC_IOPCEN;

    // 2) PC1 = Output Push-Pull 50 MHz
    GPIOC_CFGLR &= ~(0xFu << (4 * 1));    // clear PC1's bits
    GPIOC_CFGLR |=  (0x3u << (4 * 1));    // CNF=00, MODE=11

    while (1) {
        GPIOC_BSHR = (1u << 1);            // ON
        delay(800000);
        GPIOC_BCR  = (1u << 1);            // OFF
        delay(800000);
    }
}
```

**Notes on this code:**

- **No `#include`** except for the basic definitions. Every address is explicit.
- **No `SystemInit()`** — HSI is enabled by default at reset, no need to call any function.
- **Manual `delay()`** — simple busy loop. Later in [L06 SysTick](/en/lessons/l06-systick) we'll learn precise timing.
- **`while(cycles--)`** — `cycles` is `volatile` so the compiler doesn't optimise it away.
- **`u32` instead of `uint32_t`** — shorthand. You can use `uint32_t` from `<stdint.h>` if you prefer the standard form.

> 🔑 **This is true bare-metal**: no framework, no HAL, no magic macros. You see every address and every bit.

---

## Common mistakes and fixes

| The mistake | The cause | The fix |
|-------|-------|-------|
| The LED never lights | You forgot to enable the GPIOC clock | Check `RCC_APB2PCENR` |
| The LED is always on | You wrote 1 into all 4 bits (`0xF`) | Use `0x3` only, for MODE=11, CNF=00 |
| The pin breaks after a while | You used `OUTDR \|=` inside an interrupt | Use `BSHR`/`BCR` (atomic) |
| Lights inverted | The LED is Active-Low | Swap ON/OFF between `BSHR` and `BCR` |

---

## Comprehension questions

1. If the LED were on PC4 instead of PC1, which numbers in the code would change?
2. Why did we use `|=` with `APB2PCENR` and not just `=`?
3. Why do we first clear `CFGLR` with `&= ~(...)` and then write with `|=`? (In two words: clean read-modify-write.)
4. What happens if you try to write `BSHR = (1 << 1) | (1 << 17);` (SET and RESET bits for the same pin)? (Hint: SET has priority.)

---

## 📖 References

- *CH32V003 Reference Manual* — Chapter 7 (GPIO and Alternate Function I/O).
- Table 7-2: MODE values.
- Table 7-3: CNF values.
- Chapter 3.4: RCC registers.
