---
order: 8
slug: "l08-timers-pwm"
title: "Timers (TIM1/TIM2) and PWM"
title_en: "Timers + PWM"
icon: "i-lucide-activity"
track: "io"
level: "beginner"
minutes: 30
tags: ["tim1", "pwm"]
---

# Lesson 08: Timers (TIM1 and TIM2) — PWM, Input Capture, Output Compare

> **Reference:** CH32V003 RM v1.9
> - Chapter 10 "Advanced-control Timer (ADTM)" = TIM1 — pages 83–114
> - Chapter 11 "General-purpose Timer (GPTM)" = TIM2 — pages 114–138
>
> **Hardware:** CH32V003 + LED on TIM1_CH4 = PC4.

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

// ── TIM1 ──────────────────────────────────────────────
#define TIM1_BASE    0x40012C00
#define TIM1_CHCTLR2    (*(volatile u32*)(TIM1_BASE + 0x1C))
#define TIM1_CTLR1      (*(volatile u32*)(TIM1_BASE + 0x00))
#define TIM1_CCER       (*(volatile u32*)(TIM1_BASE + 0x20))
#define TIM1_PSC        (*(volatile u32*)(TIM1_BASE + 0x28))
#define TIM1_ATRLR      (*(volatile u32*)(TIM1_BASE + 0x2C))
#define TIM1_CH4CVR     (*(volatile u32*)(TIM1_BASE + 0x40))
#define TIM1_BDTR       (*(volatile u32*)(TIM1_BASE + 0x44))
#define TIM1_INTFR      (*(volatile u32*)(TIM1_BASE + 0x10))

// simple busy-loop delay (enough for the basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 Every address comes from *CH32V003 RM v1.9*, the chapter dedicated to each peripheral. The table is ordered by the sequence we use them in the lesson.

---


## 0. What even is a timer?

Picture a **digital counter** that rotates automatically at a specific clock rate. When it reaches a defined value (`ARR` = Auto-Reload Register), it either toggles a pin, fires an interrupt, or restarts.

```

  CNT: 0 → 1 → 2 → ... → ARR → 0 → 1 → ...
                              ↑
                          restart + event
```

From this simple idea we build:
- **PWM** (control LED brightness or motor speed).
- **Input Capture** (measure the duration of an external signal).
- **Output Compare** (fire a signal after a specific time).
- **Counter** (count pulses from a sensor).

---

## 1. The difference between TIM1 and TIM2

| Feature | TIM1 (Advanced) | TIM2 (General) |
|--------|------------------|-----------------|
| Channels | 4 + complementary | 4 |
| Dead-time | ✅ | ❌ |
| Brake input | ✅ | ❌ |
| Encoder mode | ✅ | ✅ |
| Bus | APB2 | APB2 (CH32V003-specific) |
| Best used for | BLDC motors, motor control | General PWM, measurement |

> 📖 *RM, §11.2.2 "Difference between General and Advanced" — page 115.*

In this lesson we focus on **TIM1** to drive PWM on PC4.

---

## 2. Foundation concepts to understand before any code

### PSC — Prescaler

Divides the APB clock before feeding the counter.

```
TIM_CLK = APB_CLK / (PSC + 1)
```

Example: APB=48 MHz, PSC=47 → TIM_CLK = 48e6/48 = 1 MHz (1µs per tick).

### ARR — Auto-Reload (the counter's max value)

```
PWM Period = (ARR + 1) / TIM_CLK
PWM Freq   = TIM_CLK / (ARR + 1)
```

Example: TIM_CLK=1MHz, ARR=999 → period=1ms, freq=1kHz.

### CCRx — Compare/Capture Register

In PWM, it sets **when** the signal level changes during each cycle.

```
Duty cycle (%) = CCRx / (ARR + 1) × 100
```

Example: ARR=999, CCRx=500 → 50% duty.

> 📖 *RM, §10.3.5 "PWM Output Mode" — page 100.*

---

## 3. Target example: PWM 1kHz at 50% on PC4

**Given**:
- SysCLK = 48 MHz
- We want period = 1ms (1 kHz)
- We want duty = 50%

**Math**:
- Pick TIM_CLK = 1 MHz → PSC = 48-1 = 47
- ARR = 1000-1 = 999 (for 1ms at 1MHz)
- CCR4 = 500 (50%)

---

## 4. The registers we'll use

| Register | Address | Description | RM p. |
|-------|---------|--------|--------|
| `RCC_APB2PCENR` | `0x40021018` | Enable TIM1 + GPIO + AFIO clocks | 21 |
| `GPIOC_CFGLR` | `0x40011000` | Configure PC4 as AF Push-Pull | 56 |
| `TIM1_PSC` | `0x40012828` | Prescaler 16-bit | 109 |
| `TIM1_ATRLR` | `0x4001282C` | Auto-Reload (ARR) | 110 |
| `TIM1_CH4CVR` | `0x40012840` | Compare value channel 4 | 111 |
| `TIM1_CHCTLR2` | `0x4001281C` | Configure channels 3 and 4 (PWM mode) | 100 |
| `TIM1_CCER` | `0x40012820` | Enable channels (output enable) | 101 |
| `TIM1_BDTR` | `0x40012844` | Break & Dead-Time (MOE) | 112 |
| `TIM1_CTLR1` | `0x40012800` | General control (CEN) | 92 |

---

## 5. Bit-level explanation of `CHCTLR2` for channel 4 — PWM Mode

The `CHCTLR2` register controls channels 3 and 4. Channel 4 occupies bits `[15:8]`:

| Bit(s) | Field | Function |
|----------|--------|---------|
| `[15]`   | `OC4CE`    | Output Compare Clear Enable |
| `[14:12]`| `OC4M[2:0]`| Compare mode (`110` = PWM Mode 1, `111` = PWM Mode 2) |
| `[11]`   | `OC4PE`    | Preload Enable — updates `CH4CVR` on the update event |
| `[10]`   | `OC4FE`    | Fast Enable |
| `[9:8]`  | `CC4S[1:0]`| Capture/Compare select (`00` = output) |

> 📖 *RM, §10.4.8 "Compare/Capture Control Register 2" — page 100.*

### The bitwise op to set PWM Mode 1 + Preload

```c
TIM1_CHCTLR2 = (TIM1_CHCTLR2 & ~(0xFF << 8))      // clear channel 4 bits
              | (0b110 << 12)                       // OC4M = PWM Mode 1
              | (1 << 11);                          // OC4PE = preload
```

**Explanation**:

1. `0xFF << 8` = `0x0000_FF00` — mask for channel 4's bits in CHCTLR2.
2. `&= ~...` clears them.
3. `0b110 << 12` sets OC4M = 110 (PWM mode 1).
4. `1 << 11` enables preload.
5. `|` writes both values without affecting channel 3.

---

## 6. The complete code

```c
void pwm_pc4_init(void) {
    // 1) Clocks: GPIOC + TIM1 + AFIO
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 11) /* TIM1EN */ | (1u << 0)  /* AFIOEN */;

    // 2) PC4 = Alternate Function Push-Pull, 50 MHz
    GPIOC_CFGLR &= ~(0xF << (4 * 4));
    GPIOC_CFGLR |=  (0b1011 << (4 * 4));   // CNF=10 (AF-PP), MODE=11 (50MHz)

    // 3) TIM1 base time: PSC=47 → 1 MHz tick
    TIM1_PSC   = 48 - 1;
    TIM1_ATRLR = 1000 - 1;       // ARR for 1 kHz

    // 4) Channel 4 PWM Mode 1 + Preload
    TIM1_CHCTLR2 = (TIM1_CHCTLR2 & ~(0xFF << 8))
                  | (0b110 << 12)            // OC4M = PWM Mode 1
                  | (1 << 11);               // OC4PE = preload

    // 5) Output enable for channel 4 (bit 12 in CCER)
    TIM1_CCER |= (1 << 12);                 // CC4E = 1

    // 6) Main Output Enable — very important for TIM1!
    TIM1_BDTR |= (1 << 15);                 // MOE = 1

    // 7) Duty cycle 50%
    TIM1_CH4CVR = 500;

    // 8) Start the counter
    TIM1_CTLR1 |= (1 << 0);                 // CEN = 1
}

int main(void) {
    // HSI = 24 MHz by default at boot — no setup needed here
    pwm_pc4_init();
    while (1) __asm__("wfi");
}
```

> 🔑 **MOE (Main Output Enable) in TIM1 is the cause of countless headaches**. Without it, even if you set everything else correctly, no signal comes out! TIM2 doesn't need this bit.

---

## 7. Gradually changing brightness (LED fading)

```c
void fade_loop(void) {
    int dir = 1;
    uint16_t brightness = 0;

    while (1) {
        TIM1_CH4CVR = brightness;
        delay_ms(2);                 // SysTick from lesson 06
        brightness += dir;
        if (brightness == 1000 || brightness == 0) dir = -dir;
    }
}
```

---

## 8. Input Capture — measuring the duration of an external signal

We want to measure the period of an incoming signal on PC4 (TIM1_CH4):

```c
void input_capture_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 11) /* TIM1EN */ | (1u << 0)  /* AFIOEN */;

    // PC4 = Input Floating (we receive an external signal)
    GPIOC_CFGLR &= ~(0xF << (4*4));
    GPIOC_CFGLR |=  (0b0100 << (4*4));   // CNF=01 (floating), MODE=00

    TIM1_PSC = 48 - 1;        // 1 MHz tick = 1µs precision
    TIM1_ATRLR = 0xFFFF;       // max value

    // Configure channel 4 as Input Capture (CC4S=01)
    // (in CHCTLR2 bits [9:8] = CC4S)
    TIM1_CHCTLR2 = (TIM1_CHCTLR2 & ~(0x3 << 8)) | (0x1 << 8);

    // Rising edge polarity + enable (bit 13 = CC4P, bit 12 = CC4E)
    TIM1_CCER &= ~(1 << 13);     // CC4P=0 → rising
    TIM1_CCER |=  (1 << 12);     // CC4E=1

    TIM1_CTLR1 |= 1;             // CEN
}

uint32_t capture_period_us(void) {
    while (!(TIM1_INTFR & (1 << 4)));     // wait for CC4IF
    uint32_t t1 = TIM1_CH4CVR;
    TIM1_INTFR &= ~(1 << 4);

    while (!(TIM1_INTFR & (1 << 4)));
    uint32_t t2 = TIM1_CH4CVR;
    TIM1_INTFR &= ~(1 << 4);

    return (t2 - t1) & 0xFFFF;    // wraparound-safe
}
```

> 📖 *RM, §10.3.1 "Input Capture Mode" — page 96.*

---

## 9. Default channel maps on CH32V003

> 📖 *RM, Table 7-8 — page 55.*

| TIM | CH1 | CH2 | CH3 | CH4 |
|-----|-----|-----|-----|-----|
| TIM1 (default) | PD2 | PA1 | PC3 | **PC4** |
| TIM1 (remap full) | PC4 | PC7 | PC5 | PD4 |
| TIM2 (default) | PD4 | PD3 | PC0 | PD7 |
| TIM2 (remap full) | PC5 | PC2 | PD2 | PC1 |

---

## 10. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| PWM doesn't output even though everything looks right | Forgot `BDTR.MOE = 1` on TIM1 | `TIM1_BDTR |= (1 << 15)` |
| Unexpected frequency | Forgot the `-1` on PSC or ARR | Remember `actual = N - 1` |
| Duty cycle not smooth | Forgot `OCxPE` (preload) | Enable it |
| Signal on the wrong pin | Forgot the remap | Set `AFIO_PCFR1` |
| PWM mode 2 inverted | Picked `0b111` by mistake | Use `0b110` for PWM 1 |
| Interrupt fires endlessly | Didn't clear `TIM1_INTFR` | Clear it in the ISR |

---

## 11. Exercises

1. **3 PWM channels** with 3 different brightness levels on PC4, PC5, PD4.
2. **RGB LED**: use 3 channels to fade a colour through the colour wheel.
3. **Servo motor**: PWM at 50Hz, duty 1-2ms to move a servo.
4. **Frequency counter**: use Input Capture to measure the frequency of a signal on PC4.
5. **Tone generator**: 50% duty PWM at varying frequencies (for a buzzer).
6. **Encoder mode**: TIM2 in encoder mode to read a rotary encoder.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §10.2 "Principle and Structure" — page 83
  - §10.3.5 "PWM Output Mode" — page 100
  - §10.4 "Register Description (TIM1)" — pages 92-114
  - §11.4 "Register Description (TIM2)" — pages 119-138
  - Table 7-8 "TIM1 Alternate Function Remapping" — page 55
