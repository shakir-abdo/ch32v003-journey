---
order: 0
slug: "l00-curriculum-overview"
title: "Curriculum Overview"
title_en: "Curriculum Overview"
icon: "i-lucide-map"
track: "foundation"
level: "beginner"
minutes: 15
tags: ["intro", "roadmap"]
---

# Lesson 00: The Roadmap 🗺

Welcome. This curriculum is a 22-lesson journey from your first `Blinky` to building production-grade firmware on the **CH32V003J4M6** — all at the register level, no HAL, no middleware libraries, with explicit page references to the Reference Manual at every step.

---

## ❓ Who is this for?

- **A developer** who knows C basics and wants to understand hardware from the ground up.
- **An electronics hobbyist** transitioning from Arduino to the world of registers and bit manipulation.
- **A computer-science student** looking for a hands-on RISC-V application.
- **Anyone tired of reading and ready to build**.

**The core goal**: move from *"I dictate to an AI to write registers for me"* to *"I write the registers myself and understand every bit"*.

---

## 🛠 Writing philosophy — pure bare-metal

Every code example in this curriculum follows one strict pattern:

- **No `#include "ch32v003fun.h"`** and no framework. We declare every register ourselves.
- **No `SystemInit()`, no `Delay_Ms()`, no `NVIC_EnableIRQ()`** — we write directly to registers.
- **Every address is visible**: e.g. `#define RCC_APB2PCENR (*(volatile u32*)(0x40021018))`, never `RCC->APB2PCENR` hidden inside a struct.
- **Every bit is named**: e.g. `(1u << 4)  /* IOPCEN */`, never an opaque `RCC_APB2Periph_GPIOC`.
- **Delays are manual** before [L06 SysTick](/en/lessons/l06-systick): `void delay(volatile u32 c) { while(c--); }`. After L06 we use the hardware counter.

> 🎯 **Why?** The goal of the curriculum is for you to understand the *hardware*, not master a particular framework. When you type `0x40021018` yourself, you know exactly what's happening. Structs and macros hide that.

---

## 📚 Before we start — download these

1. **CH32V003 Reference Manual (v1.9)** — the authority. Your reference for every question.
2. **CH32V003 Datasheet** — for electrical specs and the pinout.
3. **ch32v003fun** — a minimal library used as a clean reference (we won't call it directly, but its source is worth reading).
4. **WCH-LinkE** — the official programmer from WCH. With a breadboard-ready chip, the total cost is under $3. See [the resources page](/en/resources) for details.

> 💡 **Golden rule**: every time you hit a register you don't understand, open the RM and look it up immediately. Over time the registers will feel like old friends.

---

## 🛤 The seven tracks

The curriculum is split into seven tracks, each building on the previous.

---

### 🟢 Track 1: **Foundation** — the essentials

**Everything you need to know before writing a single bit on real silicon.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L00](/en/lessons/l00-curriculum-overview) | The roadmap | (you are here) | 15 min |
| [L01](/en/lessons/l01-bitwise-magic) | The wizard's handbook — bitwise ops | `<<`, `&`, `\|`, `~`, `^` with visual intuition | 20 min |
| [L02](/en/lessons/l02-registers-intro) | Registers and Bit Operations | The hardware concept, MMIO, RCC | 20 min |
| [L03](/en/lessons/l03-gpio-output) | GPIO as Output — the Blinky project | Light an LED on PC1 with raw registers | 20 min |

---

### 🔵 Track 2: **Core I/O** — making the chip come alive

**Everything that makes the MCU "alive" — interrupts, timing, timers, and reading buttons.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L04](/en/lessons/l04-gpio-input) | GPIO as Input + EXTI | Buttons, internal pull-ups, debouncing | 30 min |
| [L05](/en/lessons/l05-clock-system) | The clock system (RCC) | HSI / HSE / PLL, switching to 48 MHz | 30 min |
| [L06](/en/lessons/l06-systick) | SysTick — non-blocking timing | 32-bit counter + millis() + wfi | 30 min |
| [L07](/en/lessons/l07-nvic-pfic) | PFIC — the interrupt controller | Vector table, ISRs, priorities | 30 min |
| [L08](/en/lessons/l08-timers-pwm) | TIM1 / TIM2 — PWM + Input Capture | Output Compare, Encoder mode | 30 min |

---

### 🟣 Track 3: **Comms** — communication protocols

**Connecting the MCU to the outside world.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L09](/en/lessons/l09-uart-deep) | UART, deep dive | Interrupts + ring buffer + custom printf | 35 min |
| [L10](/en/lessons/l10-spi) | SPI — Master mode | Fast sensors, EEPROM memories | 35 min |
| [L11](/en/lessons/l11-i2c-oled) | I2C + driving an SSD1306 OLED | Live text on a screen | 35 min |

---

### 🟡 Track 4: **Analog** — analog signals

**Reading voltages and moving data fast.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L12](/en/lessons/l12-adc) | ADC — reading analog sensors | Potentiometer, internal temp sensor | 35 min |
| [L13](/en/lessons/l13-dma) | DMA — transferring without the CPU | ADC streaming, UART async | 35 min |

---

### 🔴 Track 5: **Pro** — professional skills

**Everything that distinguishes serious firmware from a hobby project.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L14](/en/lessons/l14-lowpower) | Power-saving modes | Sleep, Standby, AWU — for battery life | 40 min |
| [L15](/en/lessons/l15-watchdog) | IWDG and WWDG | Self-recovery for production systems | 40 min |
| [L16](/en/lessons/l16-flash) | Flash programming + EEPROM emulation | Persisting settings across resets | 40 min |
| [L17](/en/lessons/l17-linker-startup) | Linker script + startup, deep dive | `link.ld`, vector table, life before main() | 40 min |
| [L18](/en/lessons/l18-debugging) | Debugging without printf | minichlink, GDB, LED breadcrumbs | 40 min |

---

### 🟠 Track 6: **Bonus** — advanced techniques

**A showcase of everything we've learned, controlling nanosecond signals and matrices.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L19](/en/lessons/l19-ws2812b) | WS2812B — the nanosecond battle | Precise bit-banging, disabling interrupts, nop counting | 45 min |
| [L20](/en/lessons/l20-matrix-multiplexing) | Matrix multiplexing | LED grid with SysTick scan + double buffering | 45 min |

---

### 🏆 Track 7: **Capstone** — the final project

**Combining all the knowledge into firmware that runs and ships.**

| # | Lesson | Topic | Time |
|---|------|---------|-------|
| [L21](/en/lessons/l21-final-project) | The final project | 5×5 LED board + UART + Flash + Watchdog | 90 min |

---

## 🧭 Recommended reading order

```
                   L00 ───┐  (you are here)
                          ▼
   Foundation:  L01 → L02 → L03               ← 3 days
                          │
                          ▼
   Core I/O:    L04 → L05 → L06 → L07 → L08   ← 5 days
                          │
                          ▼
   Comms:          L09 → L10 → L11            ← 3 days
                          │
                          ▼
   Analog:            L12 → L13               ← 2 days
                          │
                          ▼
   Pro:        L14 → L15 → L16 → L17 → L18    ← 5 days
                          │
                          ▼
   Bonus:            L19 → L20                ← 3 days
                          │
                          ▼
   Capstone:             L21                  ← 2-3 days
```

**Total**: about 4 weeks at one hour a day. Faster if you can devote more time, slower if you'd rather take it easy.

---

## 📋 Course rules

1. **Read the Reference Manual first, then apply, then answer the questions.** Don't rush.
2. **An oscilloscope/logic-analyzer is your friend.** Especially for WS2812B and the matrix.
3. **Don't use AI to write the code for you.** Use it to ask and explain — but the writing is yours.
4. **Mistake? Normal.** The CH32V003 doesn't fry easily. If it "locks up", [ch32v003-unbrick](https://github.com/shakir-abdo/ch32v003-unbrick) will save it.
5. **Track your progress.** After every lesson, write one sentence in your personal `progress.md` about "what I learned".

---

## 🧰 Hardware you'll need

| Item | Used for |
|---------|-----------|
| CH32V003J4M6 (or F4P6) | The MCU |
| WCH-LinkE | Programming and debugging |
| LED + 220Ω resistor | Nearly every lesson |
| Push-button | L04 onward |
| USB-UART (CH340/FTDI) | L09 onward |
| SSD1306 OLED 128×64 | L11 |
| Potentiometer 10kΩ | L12 |
| WS2812B (at least one LED) | L19 |
| 9 plain LEDs | L20 and L21 |

Details and photos on [the resources page](/en/resources).

---

## 📖 Core references

- **CH32V003 Reference Manual v1.9** — the bible.
- **CH32V003 Datasheet** — for electrical specs and the actual pinout.
- **[ch32v003fun](https://github.com/cnlohr/ch32v003fun)** — Charles Lohr's library, a clean reference for startup and linker setup.
- **[Mdot2Matrix](https://github.com/bitluni/Mdot2Matrix)** — `bitluni`'s LED matrix project, a real-world application of what's taught here.
- **[ch32v003j4m6-libraries](https://github.com/shakir-abdo/ch32v003j4m6-libraries)** — my parallel project: register-level libraries for common sensors.

---

> 🚀 **Ready?** Start with [Lesson 01: The wizard's handbook](/en/lessons/l01-bitwise-magic).
