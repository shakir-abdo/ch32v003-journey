---
order: 12
slug: "l12-adc"
title: "ADC — Reading Analog Sensors"
title_en: "ADC Conversions"
icon: "i-lucide-activity"
track: "analog"
level: "intermediate"
minutes: 35
tags: ["adc", "analog"]
---

# Lesson 12: ADC — Reading Analog Sensors

> **Reference:** CH32V003 RM v1.9 — Chapter 9 "ADC" — pages 65–83.
>
> **Hardware:** CH32V003 + potentiometer or any analog sensor, or simply the internal temp sensor.

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

// ── ADC1 ──────────────────────────────────────────────
#define ADC1_BASE    0x40012400
#define ADC1_CTLR2      (*(volatile u32*)(ADC1_BASE + 0x08))
#define ADC1_SAMPTR2    (*(volatile u32*)(ADC1_BASE + 0x10))
#define ADC1_RSQR1      (*(volatile u32*)(ADC1_BASE + 0x2C))
#define ADC1_RSQR3      (*(volatile u32*)(ADC1_BASE + 0x34))
#define ADC1_STATR      (*(volatile u32*)(ADC1_BASE + 0x00))
#define ADC1_RDATAR     (*(volatile u32*)(ADC1_BASE + 0x4C))
#define ADC1_CTLR1      (*(volatile u32*)(ADC1_BASE + 0x04))
#define ADC1_WDHTR      (*(volatile u32*)(ADC1_BASE + 0x24))
#define ADC1_WDLTR      (*(volatile u32*)(ADC1_BASE + 0x28))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. What is an ADC?

**ADC = Analog-to-Digital Converter** — turns an analog voltage (e.g., 1.7V) into a digital number the CPU can use.

On the `CH32V003`:
- **10-bit** → value between 0 and 1023.
- Reference Vref = VDD (typically 3.3V).
- 8 external channels (CH0..CH7) + two internal channels (Vref and Temp Sensor).

### The golden equation

```
V_in = (raw / 1023) × VDD
```

Example: raw=512 → V_in = 512/1023 × 3.3 = 1.65V.

---

## 1. Default ADC channels

> 📖 *RM, §9.2.1 "Module Structure" — page 65.*

| Channel | Pin (default) | Note |
|--------|-------------------|--------|
| 0 | PA2 | — |
| 1 | PA1 | — |
| 2 | PC4 | — |
| 3 | PD2 | — |
| 4 | PD3 | — |
| 5 | PD5 | — |
| 6 | PD6 | — |
| 7 | PD4 | — |
| **8** | **Internal Vref (1.2V)** | For calibration |
| **9** | **Internal Temp Sensor** | Measures die temperature |

> 💡 On J4M6 (SO8): only CH2 (PC4), CH3/CH4/CH5 (PD2/3/5), and the internal channels are available.

---

## 2. Main registers

| Register | Address | Description | RM page |
|-------|---------|--------|--------|
| `ADC1_STATR` | `0x40012400` | Status (EOC, AWD) | 73 |
| `ADC1_CTLR1` | `0x40012404` | Scan, Discontinuous, Watchdog | 74 |
| `ADC1_CTLR2` | `0x40012408` | ADON, CONT, ALIGN, SWSTART | 75 |
| `ADC1_SAMPTR1` | `0x4001240C` | Sample times (CH10-CH17) | 77 |
| `ADC1_SAMPTR2` | `0x40012410` | Sample times (CH0-CH9) | 77 |
| `ADC1_RSQR1` | `0x4001242C` | Regular sequence (last 3) | 78 |
| `ADC1_RSQR2` | `0x40012430` | Regular sequence (mid 6) | 79 |
| `ADC1_RSQR3` | `0x40012434` | Regular sequence (first 6) | 79 |
| `ADC1_RDATAR` | `0x4001244C` | Read data | 81 |

### Most important `CTLR2` bits

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | **ADON** | Power on ADC (1=on, second write = SW Start) |
| 1 | **CONT** | Continuous mode |
| 2 | CAL | Calibration |
| 3 | RSTCAL | Reset calibration |
| 11 | ALIGN | 0=right-aligned, 1=left-aligned |
| 22 | **SWSTART** | Start the conversion |

> 📖 *RM, §9.3.3 — page 75.*

---

## 3. Bitwise walkthrough to enable ADC on PC4 (CH2)

```c
// 1) Enable the ADC clock
RCC_APB2PCENR |= (1u << 9)  /* ADC1EN */;

// 2) PC4 as Analog Input
GPIOC_CFGLR &= ~(0xF << (4*4));    // clear (becomes CNF=00, MODE=00 = Analog ✅)

// 3) Sample time for CH2 — 3 bits in SAMPTR2 at position [8:6]
ADC1_SAMPTR2 &= ~(0x7 << 6);
ADC1_SAMPTR2 |= (0b111 << 6);       // 241 cycles (slowest and most accurate)

// 4) Regular sequence: one channel only = CH2
ADC1_RSQR1 &= ~(0xF << 20);         // L[3:0] = 0 (length = 1)
ADC1_RSQR3 &= ~(0x1F);
ADC1_RSQR3 |= 2;                    // first conversion = CH2

// 5) ADON: power it on
ADC1_CTLR2 |= (1 << 0);

// 6) Calibration
ADC1_CTLR2 |= (1 << 3);            // RSTCAL
while (ADC1_CTLR2 & (1 << 3));
ADC1_CTLR2 |= (1 << 2);            // CAL
while (ADC1_CTLR2 & (1 << 2));
```

**Detailed explanation**:

- **Analog input**: `CNF=00 + MODE=00` (all four bits = 0).
- **Sample time** longer → higher accuracy but slower. For a high-impedance source pick `111` (241 cycles).
- **Regular Sequence**: the order of channels to convert. Each channel takes 5 bits (its index).
- **L field** in `RSQR1[23:20]` sets the number of channels in the sequence (0 = one channel).
- **Calibration** is required after every power-on for full accuracy.

---

## 4. Full code — single read

```c
void adc_init_ch2(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 9)  /* ADC1EN */;

    // PC4 = Analog
    GPIOC_CFGLR &= ~(0xF << (4 * 4));

    // Sample time for CH2
    ADC1_SAMPTR2 &= ~(0x7 << 6);
    ADC1_SAMPTR2 |= (0b111 << 6);    // 241 cycles

    // Sequence: one channel = CH2
    ADC1_RSQR1 = 0;
    ADC1_RSQR3 = 2;

    // ADC ON
    ADC1_CTLR2 = (1 << 0);

    // Calibrate
    ADC1_CTLR2 |= (1 << 3);
    while (ADC1_CTLR2 & (1 << 3));
    ADC1_CTLR2 |= (1 << 2);
    while (ADC1_CTLR2 & (1 << 2));
}

uint16_t adc_read(void) {
    ADC1_CTLR2 |= (1 << 22);           // SWSTART
    while (!(ADC1_STATR & (1 << 1))); // EOC
    return ADC1_RDATAR;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    uart_init(115200);                  // from lesson 09
    adc_init_ch2();

    while (1) {
        uint16_t v = adc_read();
        uint32_t mv = v * 3300UL / 1023;
        printf("ADC=%4u  mV=%4u\n", v, (unsigned)mv);
        delay(200 * 8000);
    }
}
```

---

## 5. Reading the internal Temp Sensor (CH9)

```c
void adc_temp_init(void) {
    RCC_APB2PCENR |= (1u << 9)  /* ADC1EN */;

    // Enable the internal Temp Sensor + Vref
    ADC1_CTLR2 |= (1 << 23);          // TSVREFE

    // Sample time for CH9 (in SAMPTR2[29:27])
    ADC1_SAMPTR2 &= ~(0x7 << 27);
    ADC1_SAMPTR2 |= (0b111 << 27);

    ADC1_RSQR1 = 0;
    ADC1_RSQR3 = 9;

    ADC1_CTLR2 |= (1 << 0);
    // calibration as before
}

int32_t temp_celsius(uint16_t raw) {
    // Approximate equation from the datasheet
    // V25 ≈ 1.43V, slope ≈ 4.3 mV/°C
    int32_t mv = raw * 3300 / 1023;
    return ((1430 - mv) * 10) / 43 + 25;
}
```

> ⚠️ The internal Temp Sensor isn't very accurate (±5°C). For precision use an external sensor.

---

## 6. Scan Mode — multiple channels

We want to read 3 channels back-to-back:

```c
// Sequence: CH0, CH2, CH9 (3 channels)
ADC1_RSQR1 = (2 << 20);    // L=2 (length = 3)
ADC1_RSQR3 = (0 << 0)      // SQ1 = CH0
            | (2 << 5)      // SQ2 = CH2
            | (9 << 10);    // SQ3 = CH9

ADC1_CTLR1 |= (1 << 8);    // SCAN mode
```

Then read after each conversion (RDATAR updates one after the other). Cleaner: use DMA (lesson 13) to gather them into an array automatically.

---

## 7. Continuous Mode + EOC Interrupt

```c
ADC1_CTLR2 |= (1 << 1);       // CONT = continuous
ADC1_CTLR1 |= (1 << 5);       // EOCIE
PFIC_IENR1 |= (1u << 26); /* ADC_IRQn = 26 */

ADC1_CTLR2 |= (1 << 22);      // SWSTART (only once)
```

```c
volatile uint16_t latest_adc = 0;

__attribute__((interrupt))
void ADC1_IRQHandler(void) {
    if (ADC1_STATR & (1 << 1)) {
        latest_adc = ADC1_RDATAR;     // reading clears EOC
    }
}
```

---

## 8. Analog Watchdog — alert when a threshold is crossed

```c
ADC1_WDHTR = 700;        // if raw > 700
ADC1_WDLTR = 300;        // or < 300
ADC1_CTLR1 |= (1 << 23)  // AWDEN
            | (1 << 22)   // AWDIE
            | (1 << 9)    // AWDSGL (single channel only)
            | 2;          // AWDCH = CH2
```

When the value goes out of range, the `AWD` flag fires together with an interrupt.

---

## 9. Bitwise walkthrough — Sample Time Mapping

`SAMPTR1` holds sample-time for channels 10–17 (present on larger WCH chips, unused on the CH32V003).

`SAMPTR2` holds sample-time for channels `0..9`. Each channel takes 3 bits:

| Channel | Bits | Channel | Bits |
|--------|---------|--------|---------|
| `CH0`  | `[2:0]`   | `CH5`  | `[17:15]` |
| `CH1`  | `[5:3]`   | `CH6`  | `[20:18]` |
| `CH2`  | `[8:6]`   | `CH7`  | `[23:21]` |
| `CH3`  | `[11:9]`  | `CH8`  | `[26:24]` |
| `CH4`  | `[14:12]` | `CH9`  | `[29:27]` |

To read `CH2`: use bits `[8:6]`.

```c
ADC1_SAMPTR2 = (ADC1_SAMPTR2 & ~(0x7 << 6)) | (0b111 << 6);
```

> 🎯 Understanding this layout saves you hours of head-scratching.

---

## 10. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Reading is always 0 or 1023 | Pin isn't in Analog mode | Clear CFGLR for the pin |
| Value swings wildly | Sample time too short + high-impedance source | Pick `111` (241 cycles) |
| ADC doesn't start | Forgot `ADON` | `CTLR2 |= 1` |
| Read doesn't respond | Forgot `SWSTART` | `CTLR2 |= (1<<22)` |
| Calibration hangs | Didn't turn ADON on first | Fix the order |
| Temp Sensor returns 1023 | Forgot `TSVREFE` | `CTLR2 |= (1<<23)` |

---

## 11. Exercises

1. **Simple voltmeter**: print the PC4 voltage over UART (mV).
2. **Potentiometer → PWM**: turn the PC4 reading into a duty cycle on a PWM pin (remember: don't reuse the same pin!).
3. **Temp logger**: read the Temp Sensor every second, keep the last 60 samples.
4. **Threshold alert**: use the Analog Watchdog to print an alert over UART.
5. **Multi-channel scan**: read 4 channels and convert them to mV.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §9.2 "Functional Description" — pages 65-72
  - §9.3 "Register Description" — pages 73-83
- **CH32V003 Datasheet** — the precise Temp Sensor equation.
