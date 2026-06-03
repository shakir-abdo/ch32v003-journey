---
order: 14
slug: "l14-lowpower"
title: "Low-Power Modes"
title_en: "Low-Power Modes"
icon: "i-lucide-battery-low"
track: "pro"
level: "advanced"
minutes: 40
tags: ["power", "sleep", "standby"]
---

# Lesson 14: Low-Power Modes (Sleep, Standby, AWU)

> **Reference:** CH32V003 RM v1.9 — Chapter 2 "Power Control (PWR)" — pages 4–10.
>
> **Hardware:** CH32V003 + LED + push-button (for wake-up).

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example from this lesson. The examples below assume these definitions are present.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_APB2PCENR   (*(volatile u32*)(RCC_BASE + 0x18))
#define RCC_APB1PCENR   (*(volatile u32*)(RCC_BASE + 0x1C))
#define RCC_RSTSCKR     (*(volatile u32*)(RCC_BASE + 0x20))

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_CFGLR     (*(volatile u32*)(GPIOC_BASE + 0x00))
#define GPIOC_OUTDR     (*(volatile u32*)(GPIOC_BASE + 0x0C))
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── AFIO ──────────────────────────────────────────────
#define AFIO_BASE    0x40010000
#define AFIO_EXTICR     (*(volatile u32*)(AFIO_BASE + 0x08))

// ── EXTI ──────────────────────────────────────────────
#define EXTI_BASE    0x40010400
#define EXTI_INTENR     (*(volatile u32*)(EXTI_BASE + 0x00))
#define EXTI_FTENR      (*(volatile u32*)(EXTI_BASE + 0x0C))
#define EXTI_INTFR      (*(volatile u32*)(EXTI_BASE + 0x14))
#define EXTI_RTENR      (*(volatile u32*)(EXTI_BASE + 0x08))

// ── PWR ──────────────────────────────────────────────
#define PWR_BASE    0x40007000
#define PWR_CTLR        (*(volatile u32*)(PWR_BASE + 0x00))
#define PWR_CSR         (*(volatile u32*)(PWR_BASE + 0x04))
#define PWR_AWUCSR      (*(volatile u32*)(PWR_BASE + 0x08))
#define PWR_AWUWR       (*(volatile u32*)(PWR_BASE + 0x0C))
#define PWR_AWUPSC      (*(volatile u32*)(PWR_BASE + 0x10))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_SCTLR      (*(volatile u32*)(PFIC_BASE + 0x10))
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. Why low-power modes?

In battery-powered applications (sensor nodes, remote controls, IoT), the CPU is asleep 99% of the time. Every microamp you save extends battery life:

| Mode | Current | When to use |
|------|------------|------------|
| Run @ 48 MHz | ~10 mA | Active work |
| Sleep | ~3 mA | Waiting for a near-term event |
| Standby | **<10 µA** | Long waits (minutes to hours) |

---

## 1. The three modes

### Run Mode (normal)
Everything is on: CPU + Flash + RAM + Clock.

### Sleep Mode
- CPU is **halted** (no instructions execute).
- Flash + RAM + Peripherals **stay on**.
- Wakes on any interrupt.
- Wake-up time in nanoseconds.

### Standby Mode
- Everything is **off** except (LSI + IWDG + AWU + EXTI).
- RAM and registers are **lost**.
- Wakes via NRST, WKUP pin, AWU, IWDG reset.
- Wake-up time in µs after the event.

> 📖 *RM, §2.3 "Low-power Modes" — page 6.*

---

## 2. The registers

| Register | Address | Description | RM page |
|-------|---------|--------|--------|
| `PWR_CTLR` | `0x40007000` | General PWR config | 8 |
| `PWR_CSR` | `0x40007004` | Status (WUF, SBF) | 8 |
| `PWR_AWUCSR` | `0x40007008` | AWU control | 9 |
| `PWR_AWUWR` | `0x4000700C` | AWU compare value (6 bits) | 9 |
| `PWR_AWUPSC` | `0x40007010` | AWU prescaler | 10 |

### Important `PWR_CTLR` bits

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | LPDS | Low-power deep sleep |
| **1** | **PDDS** | Power-Down Deep Sleep — `1` = Standby, `0` = Sleep |
| 2 | CWUF | Clear wakeup flag |
| 3 | CSBF | Clear standby flag |
| 4 | PVDE | Programmable voltage detector |
| 7:5 | PLS | PVD level select |

### Core-private bit (`PFIC_SCTLR[2]`)

| Bit | Name | Meaning |
|------|-------|--------|
| 2 | **SLEEPDEEP** | `0` = Sleep, `1` = Standby |

> ⚠️ Behavior depends on **SLEEPDEEP + PDDS together** (see the table below).

| SLEEPDEEP | PDDS | Mode |
|-----------|------|--------|
| 0 | x | Sleep |
| 1 | 0 | Sleep-deep (rare) |
| 1 | 1 | **Standby** |

---

## 3. Sleep Mode — the simplest

```c
void enter_sleep(void) {
    // Clear SLEEPDEEP
    PFIC_SCTLR &= ~(1 << 2);
    __asm__ volatile ("wfi");
}
```

Result: the CPU stops. Any interrupt (SysTick, EXTI, UART RX, ...) wakes it immediately.

> 💎 **This is what we use in most projects**. Consumption drops from 10mA to ~3mA because the core is halted.

---

## 4. Standby Mode — for deep sleep

```c
void enter_standby(void) {
    // 1) Enable PDDS
    PWR_CTLR |= (1 << 1);         // PDDS = 1 → Standby
    PWR_CTLR |= (1 << 2);         // CWUF: clear wakeup flag

    // 2) SLEEPDEEP in the core
    PFIC_SCTLR |= (1 << 2);

    // 3) Sleep
    __asm__ volatile ("wfi");
}
```

> ⚠️ After waking from Standby, the **system starts as if from Reset**. RAM is gone.

### How to know wake-up was from Standby

```c
if (PWR_CSR & (1 << 1)) {      // SBF
    // We woke from Standby
    PWR_CTLR |= (1 << 3);       // CSBF
}
```

---

## 5. Waking with EXTI from a button

```c
// A button on PC2 wakes from Sleep (automatically) or Standby (only via AWU/WKUP)

void wakeup_button_init(void) {
    // PC2 = Input Pull-Up + EXTI Falling
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 0)  /* AFIOEN */;
    GPIOC_CFGLR &= ~(0xF << (4*2));
    GPIOC_CFGLR |=  (0x8 << (4*2));
    GPIOC_OUTDR |=  (1 << 2);

    AFIO_EXTICR = (AFIO_EXTICR & ~(0x3 << 4)) | (0x2 << 4);   // PC
    EXTI_INTENR |= (1 << 2);
    EXTI_FTENR  |= (1 << 2);
    PFIC_IENR1 |= (1u << 20); /* EXTI7_0_IRQn = 20 */
}

__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    EXTI_INTFR = (1 << 2);
    // The CPU woke automatically, we land here
}
```

---

## 6. AWU — Auto Wake-Up Timer

A signature feature of the CH32V003: a low-frequency clock (LSI 128 kHz) that wakes the CPU from Standby at a fixed interval.

> 📖 *RM, §2.3.4 "Auto-wakeup" — page 7.*

### The equation

```
T_wakeup = (AWUWR + 1) × prescaler / 128000 seconds
```

The prescaler sits in `PWR_AWUPSC[3:0]`:

| AWUPSC | Value |
|--------|--------|
| 0001 | /2 |
| 0010 | /4 |
| 0011 | /8 |
| 0100 | /16 |
| 0101 | /32 |
| 0110 | /64 |
| **0111** | **/64** (default) |
| 1000 | /128 |
| 1001 | /256 |
| 1010 | /512 |
| 1011 | /1024 |
| 1100 | /2048 |
| 1101 | /4096 |
| 1110 | /10240 |
| 1111 | /61440 |

### Example: wake roughly every second

```
prescaler = 1024 (0b1011)
AWUWR    = 124    →  (124+1) × 1024 / 128000 ≈ 1.0 s
```

```c
void awu_init_1s(void) {
    // Enable LSI (the AWU source)
    RCC_RSTSCKR |= (1 << 0);                 // LSION
    while (!(RCC_RSTSCKR & (1 << 1)));      // wait LSIRDY

    RCC_APB1PCENR |= (1 << 28);              // PWR clock

    // Enable AWU
    PWR_AWUPSC = 0b1011;                      // /1024
    PWR_AWUWR  = 124;                         // ≈ 1 s
    PWR_AWUCSR = (1 << 1);                    // AWUEN

    // EXTI Line 9 (internal to AWU)
    EXTI_INTENR |= (1 << 9);
    EXTI_RTENR  |= (1 << 9);

    PFIC_IENR1 |= (1u << 21); /* AWU_IRQn = 21 */    // or PWR_IRQn depending on the HAL
}

__attribute__((interrupt))
void AWU_IRQHandler(void) {
    EXTI_INTFR = (1 << 9);
    // Do your work, then go back to sleep
}
```

---

## 7. A typical "periodic operation" pattern

```c
int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    awu_init_1s();
    led_init();

    while (1) {
        // Quick burst of work
        GPIOC_BSHR = (1 << 1);
        delay(100 * 8);
        GPIOC_BCR  = (1 << 1);

        // Sleep until the next wake
        enter_standby();
        // After Standby wake-up, we start from main!
    }
}
```

> 💡 If you want to preserve RAM, use Sleep instead of Standby and just call `wfi`.

---

## 8. PVD — Programmable Voltage Detector

Tells you when VDD drops below a chosen threshold:

```c
PWR_CTLR &= ~(0x7 << 5);
PWR_CTLR |= (0b101 << 5);    // PLS = 2.8V threshold
PWR_CTLR |= (1 << 4);        // PVDE
EXTI_INTENR |= (1 << 16);    // EXTI line 16 = PVD
```

Useful for:
- Saving critical data before power loss.
- Warning the user about low battery.

> 📖 *RM, §2.2.2 — page 5.*

---

## 9. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| `wfi` never wakes | All interrupts are masked | Enable at least one |
| Enters Standby but never wakes | AWU/WKUP wasn't enabled | Check both |
| Wakes way too quickly | AWUWR/prescaler math is off | Re-derive the equation |
| Consumption still high | Left GPIOs floating | Set every unused pin to Analog or IPU |
| Wakes from Standby + Resets | This is normal — RAM was lost | Save what you need in Backup |
| LSI never becomes ready | Forgot `LSION` | Enable it and wait for `LSIRDY` |

---

## 10. Extra power savings

1. **Make every unused GPIO Input Pull-Up or Analog** (avoid floating).
2. **Disable the clock for any peripheral you don't use** (`RCC_APB...PCENR`).
3. **Use HSI instead of PLL** when you don't need the speed (24MHz instead of 48).
4. **Use `wfi` in every main loop** instead of busy-waiting.

---

## 11. Exercises

1. **Sleep Blink**: an LED blinks, the CPU sleeps between blinks.
2. **Wake by button**: sleep, wake on a button press, blink 5 times, sleep again.
3. **Battery sensor**: AWU wakes every 10 seconds, reads Vref, prints mV over UART.
4. **Standby + RAM**: confirm in practice that RAM is lost after Standby.
5. **Measure consumption** with a precise multimeter: before and after the optimizations.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §2.2 "Power Management" — page 4
  - §2.3 "Low-power Modes" — pages 6-7
  - §2.3.4 "Auto-wakeup (AWU)" — page 7
  - §2.4 "Register Description" — pages 8-10
- **CH32V003 Datasheet** — actual current-consumption tables.
