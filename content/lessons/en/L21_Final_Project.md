---
order: 21
slug: "l21-final-project"
title: "Final Project — LED Matrix + UART"
title_en: "Final Project — LED Matrix + UART"
icon: "i-lucide-flag"
track: "capstone"
level: "advanced"
minutes: 90
tags: ["project"]
---

# Lesson 21: Final Project — UART-Controlled LED Display

> **Hardware required:**
> - CH32V003J4M6
> - A 5×5 LED matrix (either 25 ordinary LEDs + driver, or a WS2812B strip with 25 pixels)
> - USB-UART adapter (CH340/FTDI)
> - Push button
> - Resistors and wires

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
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── GPIOD ──────────────────────────────────────────────
#define GPIOD_BASE    0x40011400
#define GPIOD_OUTDR     (*(volatile u32*)(GPIOD_BASE + 0x0C))

// ── EXTI ──────────────────────────────────────────────
#define EXTI_BASE    0x40010400
#define EXTI_INTFR      (*(volatile u32*)(EXTI_BASE + 0x14))

// ── USART1 ──────────────────────────────────────────────
#define USART1_BASE    0x40013800
#define USART1_STATR    (*(volatile u32*)(USART1_BASE + 0x00))
#define USART1_DATAR    (*(volatile u32*)(USART1_BASE + 0x04))

// ── TIM1 ──────────────────────────────────────────────
#define TIM1_BASE    0x40012C00
#define TIM1_CTLR1      (*(volatile u32*)(TIM1_BASE + 0x00))
#define TIM1_CHCTLR1    (*(volatile u32*)(TIM1_BASE + 0x18))
#define TIM1_CCER       (*(volatile u32*)(TIM1_BASE + 0x20))
#define TIM1_PSC        (*(volatile u32*)(TIM1_BASE + 0x28))
#define TIM1_ATRLR      (*(volatile u32*)(TIM1_BASE + 0x2C))
#define TIM1_CH1CVR     (*(volatile u32*)(TIM1_BASE + 0x34))
#define TIM1_BDTR       (*(volatile u32*)(TIM1_BASE + 0x44))

// ── SysTick ──────────────────────────────────────────────
#define SysTick_BASE    0xE000F000
#define STK_SR          (*(volatile u32*)(SysTick_BASE + 0x04))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. Project goal

We're building an integrated system that uses **everything we've learned** in the previous lessons:

1. **GPIO** — for the LEDs and the button (L03, L04)
2. **SysTick** — refresh the display every 1ms (L06)
3. **Interrupts** — the button switches patterns instantly (L07)
4. **Timers** — PWM for global brightness control (L08)
5. **UART** — receive commands from a PC (L09)
6. **Flash** — save the last pattern across resets (L16)
7. **Watchdog** — ensure the system never hangs (L15)
8. **Low Power** — sleep between commands (L14)

---

## 1. Pin map

| Signal | Pin | Role |
|---------|-----|------|
| Rows[0..4] | PC0..PC4 | Matrix rows (Output Push-Pull) |
| Cols[0..4] | PD0..PD4 | Columns (Output) |
| UART TX | PD5 | Output to the host |
| UART RX | PD6 | Input from the host |
| Button | PD7 | Pattern toggle (EXTI) |
| Status LED | PA1 | Heartbeat |

> 💡 The J4M6 is pin-constrained. Adapt the layout to whichever package you have.

---

## 2. Software architecture

```
        ┌─────────────────────────┐
        │   main loop             │
        │  - process commands     │
        │  - update state         │
        │  - sleep (wfi)          │
        └────────┬────────────────┘
                 │
   ┌─────────────┼─────────────┬─────────────┐
   ▼             ▼             ▼             ▼
SysTick        EXTI          USART1         IWDG
1ms tick    button press   rx interrupt    timeout
   │             │             │             │
update        pattern      parse char      reset!
matrix        toggle       add to buf
```

---

## 3. The main state machine

```c
typedef enum {
    PATTERN_OFF = 0,
    PATTERN_HEART,
    PATTERN_X,
    PATTERN_SCROLL_TEXT,
    PATTERN_COUNT
} pattern_t;

typedef struct {
    pattern_t current;
    uint8_t   brightness;     // 0-255
    char      text[16];       // scroll text
    uint32_t  last_update;
} display_state_t;

display_state_t state;
```

---

## 4. Matrix multiplexing

```c
const uint8_t patterns[PATTERN_COUNT][5] = {
    [PATTERN_OFF]   = {0x00, 0x00, 0x00, 0x00, 0x00},
    [PATTERN_HEART] = {0x0A, 0x1F, 0x1F, 0x0E, 0x04},  // ❤
    [PATTERN_X]     = {0x11, 0x0A, 0x04, 0x0A, 0x11},  // X
};

volatile uint8_t active_pattern[5];   // what is being displayed now
volatile uint8_t current_row = 0;

void __attribute__((interrupt))
SysTick_Handler(void) {
    STK_SR = 0;

    // Turn off the previous row
    GPIOC_BCR = 0b11111;

    // Drive the columns for the new row
    uint8_t cols = active_pattern[current_row];
    GPIOD_OUTDR = (GPIOD_OUTDR & ~0b11111) | (cols & 0b11111);

    // Energize the new row
    GPIOC_BSHR = (1 << current_row);

    current_row = (current_row + 1) % 5;
}
```

> 💡 At a 1ms tick × 5 rows = 200 Hz refresh → no visible flicker.

---

## 5. Global brightness control via PWM

```c
void brightness_init(void) {
    RCC_APB2PCENR |= (1u << 11) /* TIM1EN */;
    TIM1_PSC = 48 - 1;        // 1MHz
    TIM1_ATRLR = 255;
    TIM1_CHCTLR1 = (0b110 << 4);   // CH1 PWM mode 1
    TIM1_CCER  = (1 << 0);
    TIM1_BDTR  = (1 << 15);   // MOE
    TIM1_CH1CVR = state.brightness;
    TIM1_CTLR1 = 1;
}
```

Then wire TIM1_CH1 (PD2) as the global enable for the matrix transistor.

---

## 6. UART command parser

```c
char cmd_buf[32];
uint8_t cmd_len = 0;

void process_cmd(void) {
    cmd_buf[cmd_len] = 0;

    if (strcmp(cmd_buf, "heart") == 0) {
        state.current = PATTERN_HEART;
    } else if (strcmp(cmd_buf, "x") == 0) {
        state.current = PATTERN_X;
    } else if (strcmp(cmd_buf, "off") == 0) {
        state.current = PATTERN_OFF;
    } else if (strncmp(cmd_buf, "bright ", 7) == 0) {
        state.brightness = atoi(cmd_buf + 7);
        TIM1_CH1CVR = state.brightness;
    } else if (strncmp(cmd_buf, "text ", 5) == 0) {
        strncpy(state.text, cmd_buf + 5, 15);
        state.current = PATTERN_SCROLL_TEXT;
    } else if (strcmp(cmd_buf, "save") == 0) {
        save_state_to_flash();
        uart_puts("Saved\r\n");
    } else if (strcmp(cmd_buf, "?") == 0) {
        uart_puts("Cmds: heart, x, off, bright N, text S, save\r\n");
    } else {
        uart_puts("Unknown cmd. Try '?'\r\n");
    }

    memcpy((uint8_t*)active_pattern, patterns[state.current], 5);
    cmd_len = 0;
}

void __attribute__((interrupt))
USART1_IRQHandler(void) {
    if (USART1_STATR & (1 << 5)) {
        uint8_t c = USART1_DATAR;
        uart_putc(c);   // echo
        if (c == '\r' || c == '\n') {
            uart_putc('\n');
            process_cmd();
        } else if (cmd_len < 31) {
            cmd_buf[cmd_len++] = c;
        }
    }
}
```

---

## 7. The button switches patterns

```c
void __attribute__((interrupt))
EXTI7_0_IRQHandler(void) {
    if (EXTI_INTFR & (1 << 7)) {
        EXTI_INTFR = (1 << 7);
        state.current = (state.current + 1) % PATTERN_COUNT;
        memcpy((uint8_t*)active_pattern, patterns[state.current], 5);
    }
}
```

---

## 8. Saving state to Flash

```c
#define STATE_ADDR 0x00003FC0

typedef struct {
    uint16_t magic;
    uint8_t  pattern;
    uint8_t  brightness;
} saved_state_t;

void save_state_to_flash(void) {
    flash_erase_page(STATE_ADDR);
    saved_state_t s = {0xC003, state.current, state.brightness};
    uint16_t *p = (uint16_t *)&s;
    for (int i = 0; i < sizeof(s)/2; i++) {
        flash_write_halfword(STATE_ADDR + i*2, p[i]);
    }
    flash_lock();
}

void load_state_from_flash(void) {
    saved_state_t *s = (saved_state_t *)STATE_ADDR;
    if (s->magic == 0xC003) {
        state.current    = s->pattern;
        state.brightness = s->brightness;
    } else {
        state.current = PATTERN_HEART;
        state.brightness = 128;
    }
}
```

---

## 9. main()

```c
int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    clock_48mhz();          // L05 from the Clock Guide

    gpio_init_matrix();
    uart_init(115200);
    button_exti_init();
    brightness_init();
    systick_init();         // 1ms tick
    iwdg_init(3999, 3);     // 1s watchdog

    load_state_from_flash();
    memcpy((uint8_t*)active_pattern, patterns[state.current], 5);

    uart_puts("CH32V003 Matrix ready. '?' for help.\r\n");

    while (1) {
        iwdg_feed();
        __asm__ volatile ("wfi");    // sleep until next interrupt
    }
}
```

---

## 10. Scroll text pattern (advanced exercise)

```c
extern const uint8_t font5x5[][5];   // small font

uint8_t scroll_buf[200];
uint16_t scroll_pos = 0;
uint16_t scroll_len = 0;

void build_scroll_buf(const char *text) {
    scroll_len = 0;
    while (*text && scroll_len < 195) {
        for (int col = 0; col < 5; col++) {
            scroll_buf[scroll_len++] = font5x5[*text - 32][col];
        }
        scroll_buf[scroll_len++] = 0;    // separator
        text++;
    }
}

void scroll_step(void) {
    if (state.current != PATTERN_SCROLL_TEXT) return;
    for (int row = 0; row < 5; row++) {
        active_pattern[row] = scroll_buf[(scroll_pos + row) % scroll_len];
    }
    scroll_pos = (scroll_pos + 1) % scroll_len;
}
```

Call `scroll_step()` every 200ms from SysTick.

---

## 11. Final verification

When you're done, you should have:

- ✅ The matrix displays the default pattern at boot.
- ✅ The button switches the pattern instantly.
- ✅ Typing `heart`, `x`, or `off` over UART changes what's displayed.
- ✅ `bright 50` dims the display.
- ✅ `text HELLO` starts a scroll.
- ✅ `save` saves the state; it survives resets.
- ✅ If you deliberately hang the program, the watchdog reboots after a second.
- ✅ Between commands, the CPU is in `wfi` (measurable on a multimeter).

---

## 12. Extra tasks

1. **Animation engine**: use a timer to drive a frame-by-frame animation.
2. **Brightness via ADC**: a potentiometer controls brightness.
3. **Temp sensor display**: show the die temperature on the matrix.
4. **Game**: a simple Pong on 5×5.
5. **OTA update**: update patterns over UART.

---

## 13. Wrap-up

You now:

- ✅ Understand register-level work on the CH32V003.
- ✅ Can read the Reference Manual.
- ✅ Use interrupts effectively.
- ✅ Wire up peripherals (UART, SPI, I2C, ADC, DMA).
- ✅ Handle low-power modes.
- ✅ Write a bootloader / firmware from scratch.
- ✅ Diagnose bugs without printf.
- ✅ Built a complete project from 0 to product.

**That's the professional level.** Continued practice and real-world projects take you the rest of the way. 🚀

---

## 📖 Standard references (for future lookups)

- **CH32V003 Reference Manual v1.9** — the hardware authority.
- **CH32V003 Datasheet** — electrical specs and pinout.
- **WCH AN-IAP** — In-Application Programming.
- **ch32v003fun** — a minimal reference library.
- **NXP UM10204** — the I2C spec.
- **Hacker's Delight** (Henry S. Warren) — bitwise wizardry.

---

## After finishing — where to go next?

| Direction | Resource |
|---------|--------|
| RTOS on CH32V003 | FreeRTOS port for RISC-V |
| Motor control | CH32V103/V20x (larger flash) |
| RF + bluetooth | CH32V208 / CH582 |
| Linux SBC | StarFive VisionFive 2 |
| FPGA + Verilog | iCEBreaker, TinyFPGA |

**Good luck on the journey! 🎓**
