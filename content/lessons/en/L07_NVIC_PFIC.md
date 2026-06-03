---
order: 7
slug: "l07-nvic-pfic"
title: "PFIC and Interrupts"
title_en: "NVIC / PFIC"
icon: "i-lucide-zap"
track: "io"
level: "beginner"
minutes: 30
tags: ["interrupts", "pfic"]
---

# Lesson 07: PFIC and Interrupts — how the CPU reacts to events

> **Reference:** CH32V003 Reference Manual v1.9 — Chapter 6 (Interrupt and Events / PFIC) — pages 32–47.
>
> **Hardware:** CH32V003J4M6 + LED + button.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example in this lesson. The samples below assume these definitions are in place.

```c
typedef unsigned int u32;

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_OUTDR     (*(volatile u32*)(GPIOC_BASE + 0x0C))

// ── EXTI ──────────────────────────────────────────────
#define EXTI_BASE    0x40010400
#define EXTI_INTFR      (*(volatile u32*)(EXTI_BASE + 0x14))

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


## 0. Why this lesson matters

Everything we've learned so far has been **sequential**: one line follows another. But hardware life isn't like that:

- A button is pressed at some random moment.
- Data arrives over UART whenever it arrives.
- A timer reaches its compare value.

We need a mechanism for **"stop what you're doing now and respond to this event"** — that's the interrupt.

On CH32V003 the unit responsible for managing interrupts is the **PFIC** (Programmable Fast Interrupt Controller). Similar to the NVIC in ARM Cortex-M, but simpler.

---

## 1. How an interrupt works — a 5-step story

```
  Processor                         Hardware (Peripheral)
  ──────                            ────────────────────

  Running main() code              Button pressed ← EXTI Line 2 fires
       │
       │           ◄──── interrupt signal ────
       │
  1) Finishes the current instruction
  2) Saves the context (PC, regs) onto the stack
  3) Reads the vector table → finds the handler's address
  4) Jumps into the ISR (Interrupt Service Routine)
       │
       ▼
  EXTI7_0_IRQHandler() {
      // your response code here
      // important: clear the interrupt flag!
  }
       │
       ▼
  5) `mret` (Machine Return)
       │
       ▼
  Restores the context and resumes main() right where it stopped
```

---

## 2. The vector table — the address book

This is a table at the start of Flash that holds the address of every ISR. When interrupt number N fires, the processor jumps to the address at `Vector_Table[N]`.

> 📖 *RM, §6.3 "Vector Table of Interrupts and Exceptions" — pages 32-33.*

### The important channels on CH32V003

| # | Name | Source |
|---|-------|--------|
| 0 | — | (reserved) |
| 1 | NMI | Non-Maskable Interrupt |
| 2 | HardFault | Major processor fault |
| 12 | SysTick | When CNT==CMP |
| 14 | SW_Handler | Software interrupt |
| 16 | WWDG | Window watchdog |
| 17 | PVD | Programmable Voltage Detector |
| 19 | RCC | RCC notifications |
| 20 | EXTI7_0 | EXTI lines 0-7 (all together!) |
| 22-25 | DMA1 channels 1-4 (up to 7) | DMA |
| 26 | ADC | ADC conversion complete |
| 27 | I2C1_EV | I2C events |
| 28 | I2C1_ER | I2C errors |
| 29 | USART1 | UART events |
| 30 | SPI1 | SPI events |
| 31-33 | TIM1 (UP/CC/BRK/TRG_COM) | Timer 1 |
| 34 | TIM2 | Timer 2 |

---

## 3. The ISR — how we write it

On RISC-V (CH32V003), the ISR needs special handling to save the registers. We tell the compiler via `__attribute__((interrupt))`:

```c
__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    // ... your code
}
```

This attribute makes the compiler emit:
1. Saving every register onto the stack at entry.
2. Restoring them at exit.
3. Ending with the `mret` instruction instead of the regular `ret`.

> ⚠️ Without `__attribute__((interrupt))` it acts like a regular function, uses `ret`, and the system crashes.

### A WCH-specific alternative for performance

WCH defines a specialised attribute for higher performance:

```c
__attribute__((interrupt("WCH-Interrupt-fast")))
void TIM2_IRQHandler(void) { ... }
```

It uses the "fast interrupt" registers available in QingKe instead of saving every register → roughly 30% faster.

---

## 4. The main PFIC registers

| Register | Address | Description |
|-------|---------|--------|
| `PFIC_ISR1` | `0xE000E000` | Pending status of interrupts 0-31 |
| `PFIC_IENR1` | `0xE000E100` | Enable interrupt (1=enable) |
| `PFIC_IRER1` | `0xE000E180` | Disable (write 1 to disable) |
| `PFIC_IPSR1` | `0xE000E200` | Mark interrupt as pending |
| `PFIC_IPRR1` | `0xE000E280` | Clear pending |
| `PFIC_IPRIORx` | `0xE000E400+x` | Priority per channel (8-bit) |
| `PFIC_CFGR` | `0xE000E048` | Behaviour configuration (NEST, PRI grouping) |

> 📖 *RM, §6.5.2 "PFIC Registers" — pages 35-46.*

> 💡 In this curriculum we touch `PFIC_IENR1` directly via `PFIC_IENR1 |= (1u << N)`. Many frameworks hide this behind `NVIC_EnableIRQ(N)` but direct writing keeps the address (`0xE000E100`) and the IRQ number visible.

---

## 5. Controlling interrupts — the golden lines

### Enable an interrupt

```c
PFIC_IENR1 |= (1u << 20); /* EXTI7_0_IRQn = 20 */
```

What happens under the hood: it writes a `1` to the right bit of `PFIC_IENR1`.

### Disable

```c
NVIC_DisableIRQ(EXTI7_0_IRQn);
```

### Set priority (0=highest)

```c
NVIC_SetPriority(EXTI7_0_IRQn, 0);
```

### Globally disable all interrupts

```c
__disable_irq();   // = csrci mstatus, 8
// critical section
__enable_irq();    // = csrsi mstatus, 8
```

> 💀 **Only use this for very short stretches**. If you hold it longer than a few microseconds, you'll lose interrupts!

---

## 6. Bitwise walkthrough — enabling an interrupt manually

To enable interrupt 20 (EXTI7_0), for example, we write:

```c
PFIC->IENR[20 / 32] = (1 << (20 % 32));
//          ↑                  ↑
//         IENR1               bit 20 in the register
```

**Explanation**:

1. `20 / 32 = 0` → we use `IENR1` (the first register).
2. `20 % 32 = 20` → we light bit 20.
3. `1 << 20` = mask for bit 20.
4. Direct assignment `=` because this register is special **Write-1-to-Set**: writing `1` enables, writing `0` does nothing.

> 🎯 Note: this register is of type `wo_w1s` (write-only, write-1-to-set). Different from regular registers.

---

## 7. A full example — SysTick + EXTI with priorities

```c
volatile uint32_t ticks_ms = 0;
volatile uint8_t  btn_event = 0;

void systick_init(void) {
    STK_CTLR = 0; STK_CNT = 0; STK_SR = 0;
    STK_CMP  = 47999;
    STK_CTLR = 0xF;     // STE | STIE | STCLK | STRE
    PFIC_IENR1 |= (1u << 12); /* SysTick_IRQn = 12 */
    NVIC_SetPriority(SysTick_IRQn, 1);   // lower priority
}

void button_exti_init(void) {
    // ... (same as lesson 04)
    PFIC_IENR1 |= (1u << 20); /* EXTI7_0_IRQn = 20 */
    NVIC_SetPriority(EXTI7_0_IRQn, 0);   // higher priority (button matters more)
}

__attribute__((interrupt))
void SysTick_Handler(void) {
    STK_SR = 0;
    ticks_ms++;
}

__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    EXTI_INTFR = (1 << 2);
    btn_event = 1;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no setup needed here
    systick_init();
    button_exti_init();

    while (1) {
        if (btn_event) {
            btn_event = 0;
            GPIOC_OUTDR ^= (1 << 1);
        }
        __asm__ volatile ("wfi");
    }
}
```

> 🔑 If a button press happens during a SysTick handler, EXTI is higher priority → it will interrupt SysTick. That's what we want.

---

## 8. Golden rules for ISRs

### Rule 1: keep the ISR very short

```c
// ❌ bad
void EXTI7_0_IRQHandler(void) {
    EXTI_INTFR = (1<<2);
    delay(100 * 8000);           // ← don't do this!
    printf("clicked");        // ← nor this!
    update_oled_display();    // ← nor this!
}

// ✅ good
void EXTI7_0_IRQHandler(void) {
    EXTI_INTFR = (1<<2);
    btn_event = 1;            // ← just raise a flag
}
// and main() handles the rest
```

### Rule 2: variables shared with main must be `volatile`

```c
volatile uint32_t ticks_ms = 0;     // ✅
uint32_t ticks_ms = 0;              // ❌ the compiler may optimise reads away
```

### Rule 3: clear the interrupt flag at the start of the ISR

```c
void EXTI7_0_IRQHandler(void) {
    EXTI_INTFR = (1 << 2);   // ← the very first thing
    // ... the rest
}
```

### Rule 4: don't use `printf` or `malloc` inside an ISR

Both hold resources for a long time + aren't reentrant.

### Rule 5: watch out for re-entry

If an ISR runs slowly, a second interrupt may arrive before it finishes. On CH32V003 you can disable interrupts inside an ISR if you need to.

---

## 9. Software interrupt — `wfi` and waking up

```c
__asm__ volatile ("wfi");
```

A RISC-V instruction that halts the CPU until an interrupt arrives. Used for:

- After every chunk of work in `main()` to save power.
- A clean `event-driven` style.

---

## 10. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Processor hangs after the interrupt | Forgot `__attribute__((interrupt))` | Add it |
| Interrupt fires endlessly | Didn't clear the peripheral flag | Clear it at the start of the ISR |
| `printf` prints half a string | Called it from an ISR | Don't call printf from an ISR |
| A variable doesn't update | Forgot `volatile` | Add `volatile` |
| The system is slow | The ISR does heavy work | Move it to a flag + main loop |
| A high-priority interrupt doesn't preempt | Didn't give it a lower number | `NVIC_SetPriority(.., 0)` |

---

## 11. Exercises

1. **Shared variables**: a `counter` updated in an ISR and read in main. Ensure safe reads on 32-bit values.
2. **Priorities**: two interrupts (SysTick + EXTI). Confirm EXTI preempts SysTick.
3. **Critical section**: use `__disable_irq()` to update a 64-bit variable safely.
4. **Re-entry**: build a long ISR and measure how many interrupts are lost.
5. **Software trigger**: use `STK_CTLR |= (1 << 31)` (SWIE) to fire an interrupt from software.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §6.1 "PFIC Main Features" — page 32
  - §6.3 "Vector Table" — pages 32-33
  - §6.5.2 "PFIC Registers" — pages 35-46
- **QingKe V2 Processor Manual** — for the details on `mret`, `wfi`, CSRs.
