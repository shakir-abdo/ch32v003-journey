---
order: 4
slug: "l04-gpio-input"
title: "GPIO as Input — Buttons and EXTI"
title_en: "GPIO Input + EXTI"
icon: "i-lucide-square-mouse-pointer"
track: "io"
level: "beginner"
minutes: 30
tags: ["gpio", "button", "exti"]
---

# Lesson 04: GPIO as Input — reading buttons

> **Reference:** CH32V003 Reference Manual v1.9
> - Chapter 7 (GPIO and Alternate Function) — pages 50–58
> - Chapter 8 (EXTI) inside PFIC — pages 33–34
>
> **Hardware required:** CH32V003J4M6 + LED on PC1 + push-button + two wires.

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
#define GPIOC_INDR      (*(volatile u32*)(GPIOC_BASE + 0x08))
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── AFIO ──────────────────────────────────────────────
#define AFIO_BASE    0x40010000
#define AFIO_EXTICR     (*(volatile u32*)(AFIO_BASE + 0x08))

// ── EXTI ──────────────────────────────────────────────
#define EXTI_BASE    0x40010400
#define EXTI_INTENR     (*(volatile u32*)(EXTI_BASE + 0x00))
#define EXTI_RTENR      (*(volatile u32*)(EXTI_BASE + 0x08))
#define EXTI_FTENR      (*(volatile u32*)(EXTI_BASE + 0x0C))
#define EXTI_INTFR      (*(volatile u32*)(EXTI_BASE + 0x14))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// simple busy-loop delay (enough for the basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 Every address comes from *CH32V003 RM v1.9*, the chapter dedicated to each peripheral. The table is ordered by the sequence we use them in the lesson.

---


## 0. Quick refresher (for anyone who forgot what a register is)

> 💡 **If this is your first time reading about bare-metal, take this section slowly. It's the foundation.**

A **register** is a 32-bit "box" inside the chip with a **numeric address** (like `0x40011008`). When you write to that address, the chip **reacts in hardware** (turns on an LED, reads a button, etc.).

On the `CH32V003`:

```
Address              Type
────────────         ───────────────────
0x20000000+          RAM (for variables)
0x00000000+          Flash (for code)
0x40000000+          Peripheral registers ← these are what we care about
```

> 📖 *RM, Chapter 1.2 "Memory Image" — pages 2-3.*

**The golden idea**: writing to `0x40011008` doesn't store a value the way a variable does — it **sends a command to the hardware**. The CPU doesn't know the difference, but the bus inside the chip distinguishes the address and routes the signal to the peripheral.

---

## 1. What will we learn in this lesson?

In lesson 2 we drove an LED (output). Now we flip direction: we **read** a pin's state to know whether a button is pressed.

We'll learn:

1. **The four input types** available on the chip.
2. **Internal pull-up and pull-down** — resistors inside the chip, no external part needed.
3. **The difference between polling and interrupt**.
4. **Debouncing** — why one press registers as several, and how to fix it.
5. **EXTI** — letting the button "wake up" the CPU instead of polling it constantly.

---

## 2. Theoretical background: how does the MCU read voltage?

Inside the chip, every pin is connected to a circuit called a **Schmitt Trigger**. This circuit takes the analog voltage and converts it to 0 or 1:

- Voltage near 0V → Schmitt outputs `0` (LOW).
- Voltage near VDD (3.3V) → Schmitt outputs `1` (HIGH).

That value is then stored in a register called `INDR` (Input Data Register). We read this register to know the pin's state.

> 📖 *RM, Chapter 7.2.6 "Input Configuration" — page 51.*

---

## 3. Why do we need a pull-up? (The physical problem)

Picture a button wired to pin PC2:

```
                   ?
   PC2 ─────────●──────●  ← button
                       │
                      ─┴─ GND
```

When the button is **open** (not pressed), the pin is connected to nothing (like a wire dangling in the air). The voltage on it is random — could be 0V, could be 1.5V, could oscillate. This is called **"floating"** and reading it gives noise.

### The fix: pull-up resistor

We put a resistor between the pin and VDD:

```
       VDD (3.3V)
        │
        ⟗ Pull-up resistor (internal ~40 kΩ)
        │
   PC2 ─●────────●──────●  button
                        │
                       ─┴─ GND
```

- Button **open**: the resistor pulls PC2 up to 3.3V → `INDR` reads `1`.
- Button **pressed**: the button connects PC2 directly to GND → `INDR` reads `0`.

**This is called Active-Low**: pressed = `0`.

### The good news

CH32V003 has **internal pull-up and pull-down** that can be enabled in software, with no external hardware. Saves you a resistor and a wire.

---

## 4. The registers we'll use

| Register | Address | Description | RM reference |
|-------|---------|--------|---------------|
| `RCC_APB2PCENR` | `0x40021018` | Enable GPIO and AFIO clocks | §3.4.7, p.21 |
| `GPIOC_CFGLR` | `0x40011000` | Pin configuration PC0..PC7 (CNF + MODE) | §7.3.1, p.56 |
| `GPIOC_INDR` | `0x40011008` | Read pin states | §7.3.1, p.57 |
| `GPIOC_OUTDR` | `0x4001100C` | Write pins (here we use it to choose pull-up or pull-down) | §7.3.1, p.57 |
| `AFIO_EXTICR` | `0x40010008` | Pick which port sources each EXTI line | §7.3.2, p.58 |
| `EXTI_INTENR` | `0x40010400` | Enable interrupt for each line | §6.5.1, p.34 |
| `EXTI_RTENR` | `0x40010408` | Fire interrupt on rising edge | §6.5.1, p.34 |
| `EXTI_FTENR` | `0x4001040C` | Fire interrupt on falling edge | §6.5.1, p.34 |
| `EXTI_INTFR` | `0x40010414` | Interrupt flag (cleared by writing 1) | §6.5.1, p.34 |

> ⚠️ The names `GPIOC_CFGLR`, `EXTI_INTENR` we use are **#defines** we declare at the top of each example (see the L03 pattern). Each name expands to `*(volatile u32*)(BASE + offset)`.

---

## 5. Dissecting the CFG field for Input (the most important part)

Each pin takes **4 bits** in `CFGLR`:

```
bit 3  bit 2 │ bit 1   bit 0
─────────────┼─────────────
   CNF[1:0]  │   MODE[1:0]
```

### The rule:

| MODE | Meaning |
|------|--------|
| `00` | **Input** (this is what we want!) |
| `01` | Output 10 MHz |
| `10` | Output 2 MHz |
| `11` | Output 50 MHz |

### When MODE=00 (Input), the CNF field picks the input type:

| CNF | Name | Meaning |
|-----|-------|--------|
| `00` | Analog | The pin is disconnected from the Schmitt — for ADC only |
| `01` | Floating Input | No internal resistor — requires an external source |
| `10` | **Input with Pull-up/down** | Internal resistor enabled ✅ |
| `11` | Reserved — don't use |

> 📖 *RM, Table 7-2 — page 51.*

### The 4-bit value for "Pull-up Input":

```
 CNF=10   MODE=00

 10  ‖  00     →  0b1000  =  0x8
```

### Pick pull-up or pull-down?

With `CNF=10`, the `OUTDR` field for the same pin picks the direction:

- `OUTDR = 1` → Pull-**Up** (common for buttons)
- `OUTDR = 0` → Pull-**Down**

> 📖 *RM, Table 7-3 — page 51.*

---

## 6. Bit-by-bit explanation of the bitwise ops 🧮

> **This section is here to understand every bitwise line before we drop it into the code.**

We now place PC2 (pin 2 in Port C) in Input Pull-Up mode.

### Operation 1: clear the 4 bits belonging to PC2

**Code**:
```c
GPIOC_CFGLR &= ~(0xF << (4 * 2));
```

**What happens step by step**:

1. `4 * 2 = 8` (because PC2 starts at bit 8 in `CFGLR`).
2. `0xF` = `0b1111` = four bits on.
3. `0xF << 8` = `0b1111_00000000` = the mask that targets bits 8-11 only:

   ```
   bit:  31 ... 12 11 10  9  8  7 ... 0
   mask:  0      0  1  1  1  1  0     0
   ```

4. `~(0xF << 8)` = invert the mask, so everything becomes `1` except bits 8-11:

   ```
   bit:  31 ... 12 11 10  9  8  7 ... 0
   mask:  1      1  0  0  0  0  1     1
   ```

5. `CFGLR &= ...` = apply AND. Every `& 1` = itself, but bits 8-11 `& 0` = `0`.

**Result**: PC2's bits are now `0000`, and the rest is unchanged.

---

### Operation 2: write "Input Pull-Up/Down" into PC2

**Code**:
```c
GPIOC_CFGLR |= (0x8 << (4 * 2));
```

**What happens**:

1. `0x8` = `0b1000` = CNF=10, MODE=00.
2. `0x8 << 8` = `0b1000_00000000` = place the value at PC2's slot:

   ```
   bit:  31 ... 12 11 10  9  8 ...
   val:   0      0  1  0  0  0
   ```

3. `CFGLR |= ...` = OR. Bits 0-7 and 12-31 stay, but bits 8-11 become `1000`.

**Final result for PC2's bits**: `CNF=10, MODE=00` → Input with pull-up/down.

---

### Operation 3: select pull-up (not pull-down)

**Code**:
```c
GPIOC_OUTDR |= (1 << 2);
```

**What happens**:

1. `1 << 2` = `0b0000_0100` — mask for bit 2 only.
2. `OUTDR |= ...` = set bit 2 = `1` (pull-up).

**Note**: if you want pull-down: `GPIOC_OUTDR &= ~(1 << 2);`

---

### Operation 4: read the button

**Code**:
```c
int pressed = (GPIOC_INDR & (1 << 2)) == 0;
```

**What happens**:

1. `(1 << 2)` = `0b0000_0100` — mask for bit 2.
2. `GPIOC_INDR & 0b0100` = extract **only** PC2's bit from the register. Either `0` or `4`.
3. `== 0` → if the bit is 0 (button pressed, Active-Low), the result is `true`. Otherwise `false`.

> 🧠 **Deep understanding**: `(REG & mask) == 0` means "a specific bit is off". `(REG & mask) != 0` means "a specific bit is on".

---

## 7. The complete code — polling

```c
#define BTN_PIN   2     // button on PC2
#define LED_PIN   1     // LED on PC1

void gpio_init(void) {
    // 1) Enable GPIOC clock
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */;

    // 2) PC2 = Input with Pull-Up
    GPIOC_CFGLR &= ~(0xF << (4 * BTN_PIN));    // clear
    GPIOC_CFGLR |=  (0x8 << (4 * BTN_PIN));    // CNF=10, MODE=00
    GPIOC_OUTDR |=  (1   <<       BTN_PIN);    // pick Pull-Up

    // 3) PC1 = Output Push-Pull 50 MHz
    GPIOC_CFGLR &= ~(0xF << (4 * LED_PIN));
    GPIOC_CFGLR |=  (0x3 << (4 * LED_PIN));    // CNF=00, MODE=11
}

static inline int button_pressed(void) {
    return (GPIOC_INDR & (1 << BTN_PIN)) == 0;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no setup needed here
    gpio_init();

    while (1) {
        if (button_pressed())
            GPIOC_BSHR = (1 << LED_PIN);   // LED ON
        else
            GPIOC_BCR  = (1 << LED_PIN);   // LED OFF
    }
}
```

---

## 8. The debouncing problem (the button lies to us)

When you press a button, the metal contacts touch each other, but due to mechanical bounce the signal oscillates:

```
Voltage on PC2:
HIGH  ─┐         ┌──┐ ┌─┐ ┌──┐
       │         │  │ │ │ │
LOW    └─────────┘  └─┘ └─┘ ← noise
       ↑                    ↑
      press               settled
```

The result: the code counts 5-10 presses instead of one.

### Quick fix (delay)

```c
if (button_pressed()) {
    delay(20 * 8000);          // wait 20ms
    if (button_pressed())      // confirm again
        do_action();
}
```

Downside: stalls the CPU for 20ms.

### The smart fix (time-based with SysTick — wait for lesson 5)

```c
extern volatile uint32_t ticks_ms;  // from SysTick
uint32_t last_press = 0;

if (button_pressed() && (ticks_ms - last_press) > 30) {
    last_press = ticks_ms;
    do_action();
}
```

---

## 9. EXTI — let the button wake the CPU

Instead of the CPU asking about the button thousands of times per second, we tell it: "Sleep, and the hardware will wake you up when the button is pressed."

### EXTI architecture on CH32V003

8 EXTI lines (Line 0..7). Each line is tied to a specific pin in each port:

- Line 0: PA0 or PC0 or PD0 (pick one via `AFIO_EXTICR`).
- Line 2: PA2 or PC2 or PD2 (same rule).
- ...etc.

> 📖 *RM, Chapter 6.4 — page 33.*

### Pick Port C for Line 2

`AFIO_EXTICR` is a 32-bit register that dedicates two bits to each of the eight lines:

| Bits | Line | Values |
|---------|------|-------|
| 1:0 | Line 0 | `00`=PA, `10`=PC, `11`=PD |
| 3:2 | Line 1 | same values |
| 5:4 | Line 2 | same values |
| ... | ... | ... |

> 📖 *RM, §7.3.2.5 "AFIO_EXTICR" — page 58.*

### The bitwise ops for EXTICR

**We want**: bits [5:4] = `10` (PC) for Line 2.

```c
AFIO_EXTICR = (AFIO_EXTICR & ~(0x3 << (2 * 2)))    // clear bits [5:4]
             | (0x2 << (2 * 2));                      // write 10 = PC
```

**Step by step**:
1. `2 * 2 = 4` (Line 2's offset).
2. `0x3 << 4` = `0b0011_0000` — mask for bits [5:4].
3. `~(0x3 << 4)` = `0b…_1100_1111`.
4. AND clears them.
5. `0x2 << 4` = `0b0010_0000` — the value `10` in position.
6. OR writes it.

---

## 10. The complete code — EXTI

```c
#define BTN_PIN  2
#define LED_PIN  1

void exti_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 0)  /* AFIOEN */;

    // PC2 = Input Pull-Up
    GPIOC_CFGLR &= ~(0xF << (4 * BTN_PIN));
    GPIOC_CFGLR |=  (0x8 << (4 * BTN_PIN));
    GPIOC_OUTDR |=  (1   <<       BTN_PIN);

    // PC1 = Output (LED)
    GPIOC_CFGLR &= ~(0xF << (4 * LED_PIN));
    GPIOC_CFGLR |=  (0x3 << (4 * LED_PIN));

    // Pick PC as the source for EXTI Line 2
    AFIO_EXTICR = (AFIO_EXTICR & ~(0x3 << (2 * BTN_PIN)))
                 | (0x2 << (2 * BTN_PIN));

    // Enable the interrupt + falling edge (Active-Low: event on press)
    EXTI_INTENR |= (1 << BTN_PIN);
    EXTI_FTENR  |= (1 << BTN_PIN);
    EXTI_RTENR  &= ~(1 << BTN_PIN);

    // Enable the channel in PFIC
    PFIC_IENR1 |= (1u << 20); /* EXTI7_0_IRQn = 20 */
}

__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    if (EXTI_INTFR & (1 << BTN_PIN)) {
        EXTI_INTFR = (1 << BTN_PIN);     // clear the flag (write 1 to clear!)
        GPIOC_OUTDR ^= (1 << LED_PIN);   // toggle LED
    }
}

int main(void) {
    // HSI = 24 MHz by default at boot — no setup needed here
    exti_init();
    while (1) {
        __asm__ volatile ("wfi");   // sleep until the next interrupt
    }
}
```

> 🔑 **Hardware note**: on `CH32V003` all EXTI lines 0..7 share one handler called `EXTI7_0_IRQHandler`. That's why we read `INTFR` to know which line actually fired.

---

## 11. Clearing the EXTI flag — why "write 1 to clear"?

In most peripherals we clear a flag by writing `0`. But in EXTI the `INTFR` is of type **`rc_w1`** (Read, Clear by Writing 1). The reason: a safe interrupt design where you can't accidentally clear someone else's flag.

```c
EXTI_INTFR = (1 << 2);    // ✅ clears the flag for Line 2 only
EXTI_INTFR &= ~(1 << 2);  // ❌ does nothing!
```

> 💀 **The deadly trap**: if you forget to clear, the interrupt keeps re-firing forever → the system hangs.

---

## 12. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Random reads without pressing | Floating (CNF=01) | Use `CNF=10` + `OUTDR=1` |
| Interrupt fires endlessly | Didn't clear INTFR | `EXTI_INTFR = (1<<N)` |
| Button pressed but `INDR=1` | You picked Pull-Down while the button goes to GND | `OUTDR |= (1<<N)` (pull-up) |
| One press = 5 interrupts | No debouncing | Use time-based in the ISR |
| Interrupt doesn't fire at all | Forgot `(1u << 0)  /* AFIOEN */` | Enable the AFIO clock |
| Works on PC2 but not PA2 | EXTICR is still on PC | Set Line 2 to `00` for PA |

---

## 13. Exercises

1. **Toggle LED with an EXTI press**: include debouncing.
2. **Press counter**: display the count on 3 LEDs (binary 0..7).
3. **Long press**: if the button is held longer than 1 second, run a different action.
4. **Two buttons**: PC2 and PD3 — both EXTI. How do you tell which fired in the same handler?
5. **Combined**: a press starts an LED blinking, a second press stops it. (state machine).

---

## 📖 References (with page numbers)

- **CH32V003 RM v1.9**:
  - Chapter 7.2.6 "Input Configuration" — page 51
  - Tables 7-2 and 7-3 (CNF/MODE encoding) — page 51
  - Chapter 7.3.1 (GPIO Registers) — pages 56-57
  - Chapter 7.3.2.5 (AFIO_EXTICR) — page 58
  - Chapter 6.4 "EXTI" — page 33
  - Chapter 6.5.1 (EXTI Registers: INTENR/FTENR/RTENR/INTFR) — page 34
