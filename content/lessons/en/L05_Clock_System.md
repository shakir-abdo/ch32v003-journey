---
order: 5
slug: "l05-clock-system"
title: "The Clock System"
title_en: "Clock System (RCC)"
icon: "i-lucide-clock"
track: "io"
level: "beginner"
minutes: 30
tags: ["rcc", "clock", "pll"]
---

# Lesson 05: The Clock System on the CH32V003

> All information is sourced from *CH32V003 Reference Manual*, Chapter 3 (RCC).

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example in this lesson. The samples below assume these definitions are in place.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_CTLR        (*(volatile u32*)(RCC_BASE + 0x00))
#define RCC_CFGR0       (*(volatile u32*)(RCC_BASE + 0x04))
#define RCC_APB2PCENR   (*(volatile u32*)(RCC_BASE + 0x18))

// ── FLASH ──────────────────────────────────────────────
#define FLASH_BASE    0x40022000
#define FLASH_ACTLR     (*(volatile u32*)(FLASH_BASE + 0x00))

// simple busy-loop delay (enough for the basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 Every address comes from *CH32V003 RM v1.9*, the chapter dedicated to each peripheral. The table is ordered by the sequence we use them in the lesson.

---


## Intro

The clock system is the beating heart of any MCU. It dictates how fast instructions run and directly affects performance and power consumption. On the `CH32V003`, understanding this system means understanding three layers:

1. **Generation sources** — where does the clock signal come from?
2. **Distribution (Bus & Prescalers)** — how is it routed to the peripherals?
3. **Switching and supervision (Switching & CSS)** — how do we change the source safely?

---

## 1. Clock sources

The `CH32V003` has **four** sources/circuits for generating the clock:

| Source | Frequency | Origin | Use case |
|--------|--------|--------|-----------|
| **HSI** (High-Speed Internal) | **24 MHz** ±1% | Internal RC | Default source after reset |
| **HSE** (High-Speed External) | **4–25 MHz** | External crystal | Applications needing high precision |
| **LSI** (Low-Speed Internal) | **128 kHz** | Low-speed internal RC | **IWDG only** + Low-Power wake-up |
| **PLL** | Multiplies the input ×2 | Multiplier circuit | Reaches 48 MHz |

### Important details for each source

- **HSI = 24 MHz** (not 8 MHz). Runs automatically at reset and is what runs `main()` before any setup. Control: `HSION` bit and `HSIRDY` flag in `RCC_CTLR`.

- **HSE**: requires connecting a crystal to OSC_IN/OSC_OUT. The biggest advantage: precision and stability, plus a safety system (CSS) that detects crystal failure.

- **LSI = 128 kHz** (not 30 kHz). **Very important**: cannot be used as the source for the main system clock (SYSCLK). Its only destinations are:
  - The Independent Watchdog (IWDG)
  - The PWR module as a low-power source for units in Standby mode

- **PLL**: not a standalone source. It takes HSI or HSE and multiplies the frequency **×2 (fixed — not adjustable on CH32V003)**. Source selection via the `PLLSRC` bit in `RCC_CFGR0`, enabling via `PLLON` in `RCC_CTLR`.

> ⚠️ **The official system speed limit (SYSCLK) is 48 MHz**. Only achievable via `PLL × HSI(24) = 48 MHz` or via `HSE 24MHz × PLL`.

---

## 2. The clock tree

```
 HSI (24 MHz) ──┐
                ├──► [PLL ×2] ──► PLLCLK (48 MHz max)
 HSE (4-25 MHz)─┘                      │
                                       ▼
 HSI ──────────────────────► [SW MUX] ──► SYSCLK
 HSE ──────────────────────►    ▲
 PLL ──────────────────────►    │
                           SW[1:0] = 00/01/10
                                │
                                ▼
                             [HPRE] ──► HCLK ──► CPU + AHB
                                            ├──► APB1 (PCLK1)
                                            ├──► APB2 (PCLK2)
                                            └──► SysTick

 LSI (128 kHz) ──► IWDG + PWR (doesn't enter the system MUX)
```

---

## 3. Setting up 48 MHz — the correct sequence

The idea: at boot we're on HSI (24 MHz). We want to switch to `PLL = HSI×2 = 48 MHz`. The sequence that guarantees system stability:

### Step 1: confirm HSI is stable

HSI is enabled by default, but for safety we set the bits ourselves:

```c
// Enable HSI (default on, but for clarity)
RCC_CTLR |= (1u << 0)  /* HSI on */;

// Wait until it stabilises
while ((RCC_CTLR & (1u << 1)  /* HSI ready */) == 0);
```

### Step 2: pick the PLL source **before** enabling it

On the `CH32V003` the multiplier is fixed (×2), but the source is selected via `PLLSRC`:

```c
// Clear the PLLSRC bit, then set HSI as the PLL source
RCC_CFGR0 &= ~(1u << 16) /* PLL src bit */;     // 0 = HSI as PLL source
// If you want HSE: RCC_CFGR0 |= (1u << 16) /* PLL src bit */;
```

> 💡 Note about HSI/2: on other WCH families (CH32V103, CH32V20x) there's an `HSIPRE` bit that divides HSI/2 before the PLL.
> On the **CH32V003 there's no pre-PLL division**. The input enters as-is and is multiplied ×2.

### Step 3: turn PLL on and wait for it to stabilise

```c
RCC_CTLR |= (1u << 24) /* PLL on */;
while ((RCC_CTLR & (1u << 25) /* PLL ready */) == 0);
```

### Step 4: configure flash memory latency

> ⚠️ A step often forgotten, and then the system crashes when moving to 48 MHz.

At 48 MHz you must add a wait-state to flash access:

```c
FLASH_ACTLR = (FLASH_ACTLR & ~(0x3u << 0)) | (0x1u << 0);
// LATENCY = 1 → one wait state for speeds > 24 MHz
```

### Step 5: switch the system clock to PLL

```c
// Clear the SW field, then select PLL
RCC_CFGR0 = (RCC_CFGR0 & ~(0x3u << 0)  /* SW field */) | (0x2u << 0)  /* SW=PLL */;

// Wait for hardware confirmation via SWS (read-only)
while ((RCC_CFGR0 & (0x3u << 2)  /* SWS field */) != (0x2u << 2)  /* SWS=PLL */);
```

> 🔍 The difference between `SW` and `SWS`:
> - `SW[1:0]` — we write what we want (a request).
> - `SWS[1:0]` — the hardware writes here when the switch succeeds (confirmation).

---

## 4. The SW field in RCC_CFGR0 — all possible values

| `SW[1:0]` | Selected source | Note |
|-----------|-----------------|--------|
| `00` | HSI | Default after reset |
| `01` | HSE | HSE must be ready |
| `10` | PLL | PLL must be ready |
| `11` | — | Not available |

> ❌ **There is no LSI option in SW**. Any attempt to make LSI the system source via `RCC_CFGR0` will fail (the `while` on `SWS` will spin forever).

---

## 5. Prescalers — the gearbox

After SYSCLK is selected, the signal passes through prescalers that reduce the speed before distribution:

```
SYSCLK ──► HPRE ──► HCLK (CPU + AHB)
                       │
                       └──► APB peripherals
```

### `HPRE[3:0]` field in `RCC_CFGR0` (bits 7:4)

| `HPRE` | Divisor | At SYSCLK = 48 MHz | Use case |
|--------|---------|---------------------|------------|
| `0xxx` | ÷1 | 48 MHz | Maximum performance |
| `1000` | ÷2 | 24 MHz | Mild slow-down |
| `1001` | ÷4 | 12 MHz | — |
| `1010` | ÷8 | 6 MHz | — |
| `1011` | ÷16 | 3 MHz | — |
| `1100` | ÷64 | 750 kHz | Power saving |
| `1101` | ÷128 | 375 kHz | Very low |
| `1110` | ÷256 | 187.5 kHz | — |
| `1111` | ÷512 | 93.75 kHz | Slowest — lowest consumption |

> 💡 If your goal is "run the CPU at the lowest possible frequency", the right path is HSI + HPRE÷512, not LSI (because LSI never reaches SYSCLK in the first place).

---

## 6. Peripheral clocks

Every peripheral is disabled by default to save power. Enabling happens via three registers, depending on the bus:

| Register | Bus | Example peripherals |
|------|---------|--------------------|
| `RCC_AHBPCENR` | AHB | DMA1, SRAM |
| `RCC_APB1PCENR` | APB1 | TIM2, USART2 (if present), I2C1, WWDG |
| `RCC_APB2PCENR` | APB2 | GPIOA/C/D, ADC1, TIM1, USART1, SPI1, AFIO |

Example: enabling the GPIOC clock (for the LED):

```c
RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */;
```

---

## 7. CSS (Clock Security System)

An important feature for anyone using HSE: if the crystal fails (breaks, loses connection…), the system automatically switches to HSI and `CSSF` is raised:

```c
RCC_CTLR |= (1u << 19);   // enable monitoring (after HSE is ready)
```

---

## 8. The MCO output (for oscilloscope verification)

You can output the clock signal on pin `PC4` to confirm you actually got the right frequency:

```c
RCC_CFGR0 = (RCC_CFGR0 & ~RCC_CFGR0_MCO) | RCC_CFGR0_MCO_SYSCLK;
// 100: SYSCLK | 101: HSI | 110: HSE | 111: PLL
```

Then configure PC4 as Alternate Function Push-Pull to see the signal.

---

## 9. Overclocking — the reality

Before discussing overclocking, let's pin down the hardware facts on the `CH32V003`:

- The multiplier is fixed at ×2 and can't be changed.
- The highest allowed HSE input is 25 MHz. If you push HSE to that max, you get `25 × 2 = 50 MHz` only.
- The official limit remains 48 MHz, and any minor overshoot stays within manufacturing tolerance but **is not guaranteed across chips**.

### Potential risks (same as any overclock)

- Instability in arithmetic and logic operations.
- Higher CPU temperature and shorter chip lifetime.
- Failure of timing-sensitive peripherals (UART, SPI, ADC).

> ⚠️ Experiment at your own risk. Don't use in a commercial product.

---

## 10. Complete example: from HSI to 48 MHz

```c
void SystemClock_48MHz_Init(void) {
    // 1) HSI ON + ready
    RCC_CTLR |= (1u << 0)  /* HSI on */;
    while (!(RCC_CTLR & (1u << 1)  /* HSI ready */));

    // 2) Pick PLL source = HSI
    RCC_CFGR0 &= ~(1u << 16) /* PLL src bit */;

    // 3) PLL ON + ready
    RCC_CTLR |= (1u << 24) /* PLL on */;
    while (!(RCC_CTLR & (1u << 25) /* PLL ready */));

    // 4) Flash latency = 1 wait state for speeds > 24 MHz
    FLASH_ACTLR = (FLASH_ACTLR & ~(0x3u << 0)) | (0x1u << 0);

    // 5) HPRE = ÷1 (full performance)
    RCC_CFGR0 &= ~(0xFu << 4)  /* HPRE field */;

    // 6) Switch SYSCLK to PLL
    RCC_CFGR0 = (RCC_CFGR0 & ~(0x3u << 0)  /* SW field */) | (0x2u << 0)  /* SW=PLL */;
    while ((RCC_CFGR0 & (0x3u << 2)  /* SWS field */) != (0x2u << 2)  /* SWS=PLL */);
}
```

---

## Facts summary

| Item | Value (from the Reference Manual) |
|------|------------------------------|
| HSI | **24 MHz** (not 8 MHz like on some STM32 chips) |
| LSI | **128 kHz** (not 30 or 40 kHz) |
| PLL | Multiplies **×2 fixed** — not adjustable |
| HSI division before PLL | Doesn't exist on CH32V003 |
| Official max speed | 48 MHz |
| LSI as SYSCLK source | ❌ Hardware-impossible — SW field is only 2 bits (HSI/HSE/PLL) |

> 📖 **Reference**: CH32V003 Reference Manual v1.9 — Chapter 3 (RCC), tables 3.4.x and figures 3-3 and 3-4.
