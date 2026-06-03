---
order: 9
slug: "l09-uart-deep"
title: "UART Deep Dive"
title_en: "UART Deep Dive"
icon: "i-lucide-cable"
track: "comm"
level: "intermediate"
minutes: 35
tags: ["uart", "serial"]
---

# Lesson 09: UART Deep Dive — Interrupts, Ring Buffer, Custom printf

> **Reference:** CH32V003 RM v1.9 — Chapter 12 "USART" — pages 138–150.
>
> **Hardware:** CH32V003 + USB-UART adapter (CH340/FTDI) connected to TX=PD5, RX=PD6.

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
#define GPIOD_CFGLR     (*(volatile u32*)(GPIOD_BASE + 0x00))
#define GPIOD_OUTDR     (*(volatile u32*)(GPIOD_BASE + 0x0C))

// ── USART1 ──────────────────────────────────────────────
#define USART1_BASE    0x40013800
#define USART1_STATR    (*(volatile u32*)(USART1_BASE + 0x00))
#define USART1_DATAR    (*(volatile u32*)(USART1_BASE + 0x04))
#define USART1_BRR      (*(volatile u32*)(USART1_BASE + 0x08))
#define USART1_CTLR1    (*(volatile u32*)(USART1_BASE + 0x0C))

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


## 0. What is UART?

**UART = Universal Asynchronous Receiver/Transmitter**.

A simple serial protocol to exchange bytes between two devices over two wires (TX and RX) with no shared clock. Each byte is sent as:

```
   Idle = HIGH
   ─────┐ ┌─┬─┬─┬─┬─┬─┬─┬─┐ ┌──── Idle
        │ │D│D│D│D│D│D│D│D│ │
        └─┴─┴─┴─┴─┴─┴─┴─┴─┘─┘
       Start  8 Data bits  Stop
       LOW                  HIGH
```

**How do the two sides agree on speed?** Through a pre-agreed **Baud Rate** (e.g., 115200 bps). Both use an internal clock with sufficient accuracy.

---

## 1. What are we learning in this lesson?

- UART with **polling** (the simplest) — `is the byte ready?`
- UART with **interrupts** — the CPU doesn't waste time
- **Ring Buffer** for continuous reception
- Redirecting `printf` to UART (easy printing)

---

## 2. Pin mapping for USART1 on CH32V003

> 📖 *RM, Table 7-10 "USART1 Alternate Function Remapping" — page 56.*

| Mapping | TX | RX | CK | CTS | RTS | RM1:RM[0] |
|---------|------|------|------|-------|-------|------------|
| **Default** | **PD5** | **PD6** | PD4 | PD3 | PC2 | 0:00 |
| Remap 1 | PD0 | PD1 | PD7 | PC3 | PC2 | 0:01 |
| Remap 2 | PD6 | PD5 | PD7 | PC6 | PC7 | 1:00 |
| Remap 3 | PC0 | PC1 | PC5 | PC6 | PC7 | 1:01 |

> ❗ **Very important note:** The default mapping on `CH32V003` is **not** `PA9/PA10` as on STM32. This is a common mistake when copying STM32 code. **Correct: PD5 (TX) and PD6 (RX).**

---

## 3. Calculating the Baud Rate

`USART1_BRR` is a 16-bit register that sets the APB divider value used to generate the baud clock.

### Equation (with 16× oversampling — the default)

```
BRR = APBx_CLK / Baud_Rate
```

### Examples

| APB | Baud | BRR (decimal) | BRR (hex) |
|-----|------|------------|------------|
| 48 MHz | 9600 | 5000 | 0x1388 |
| 48 MHz | 115200 | 417 (≈416) | 0x1A0 |
| 24 MHz | 115200 | 208 | 0xD0 |
| 24 MHz | 9600 | 2500 | 0x9C4 |

> 📖 *RM, §12.3 "Baud Rate Generator" — page 142, §12.10.3 BRR — page 145.*

> ⚠️ Fractional value: if the result is `417.5`, the hardware supports 4 fractional bits in `BRR[3:0]` — use them to improve accuracy.

---

## 4. Core registers

| Register | Address | Description |
|-------|---------|--------|
| `USART1_STATR` | `0x40013800` | Status (TXE, RXNE, TC, ...) |
| `USART1_DATAR` | `0x40013804` | Transmit/receive data |
| `USART1_BRR` | `0x40013808` | Baud Rate |
| `USART1_CTLR1` | `0x4001380C` | UE, TE, RE, IRQ enables |
| `USART1_CTLR2` | `0x40013810` | Stop bits, LIN, CK |
| `USART1_CTLR3` | `0x40013814` | DMA, error IRQ |
| `AFIO_PCFR1` | `0x40010004` | Remap selection |

---

## 5. Important bits in `STATR`

> 📖 *RM, §12.10.1 — page 144.*

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | PE | Parity error |
| 1 | FE | Framing error |
| 2 | NE | Noise error |
| 3 | ORE | Overrun error |
| 4 | IDLE | Idle line detected |
| **5** | **RXNE** | **Receive Buffer Not Empty** — byte ready to read |
| 6 | TC | Transmission Complete |
| **7** | **TXE** | **Transmit Buffer Empty** — ready for a new byte |

### Important `CTLR1` bits

| Bit | Name | Meaning |
|------|-------|--------|
| 13 | **UE** | USART Enable |
| 3 | **TE** | Transmitter Enable |
| 2 | **RE** | Receiver Enable |
| 5 | RXNEIE | RXNE interrupt enable |
| 7 | TXEIE | TXE interrupt enable |

---

## 6. Polling code — the minimum to work

```c
void uart_init(uint32_t baud) {
    RCC_APB2PCENR |= (1u << 14) /* USART1EN */ | (1u << 5)  /* IOPDEN */ | (1u << 0)  /* AFIOEN */;

    // PD5 = TX → AF Push-Pull, 50 MHz
    GPIOD_CFGLR &= ~(0xF << (4 * 5));
    GPIOD_CFGLR |=  (0b1011 << (4 * 5));    // CNF=10 (AF-PP), MODE=11

    // PD6 = RX → Input Pull-Up (to avoid floating)
    GPIOD_CFGLR &= ~(0xF << (4 * 6));
    GPIOD_CFGLR |=  (0x8 << (4 * 6));       // CNF=10 (Input Pull)
    GPIOD_OUTDR |=  (1 << 6);               // Pull-Up

    // Baud
    USART1_BRR = SYSTEM_CORE_CLOCK / baud;

    // UE | TE | RE
    USART1_CTLR1 = (1 << 13) | (1 << 3) | (1 << 2);
}

void uart_putc(char c) {
    while (!(USART1_STATR & (1 << 7)));    // wait for TXE
    USART1_DATAR = c;
}

void uart_puts(const char *s) {
    while (*s) uart_putc(*s++);
}

int uart_getc(void) {
    if (USART1_STATR & (1 << 5))            // RXNE
        return USART1_DATAR;
    return -1;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    uart_init(115200);

    while (1) {
        uart_puts("Hello World!\r\n");
        delay(1000 * 8000);
    }
}
```

---

## 7. Bitwise explanation for enabling CTLR1

```c
USART1_CTLR1 = (1 << 13) | (1 << 3) | (1 << 2);
```

**What happens**:

1. `1 << 13` = `0x2000` → bit 13 (UE).
2. `1 << 3` = `0x0008` → bit 3 (TE).
3. `1 << 2` = `0x0004` → bit 2 (RE).
4. OR all bits: `0x200C` = 8204.

**The result in the register** (only the bits that became `1`):

| Bit | Value | Field | Function |
|------|---------|--------|---------|
| `13` | `1` | **UE** | USART Enable |
| `3`  | `1` | **TE** | Transmitter Enable |
| `2`  | `1` | **RE** | Receiver Enable |

All other bits = `0`. Final result: `0x200C`.

> 🎯 **Why direct assignment `=` and not `|=`?** Because the register reset value is 0, and we know the full target value.

---

## 8. Receive by Interrupt

```c
#define RX_BUF_SIZE 64

volatile uint8_t  rx_buf[RX_BUF_SIZE];
volatile uint8_t  rx_head = 0, rx_tail = 0;

void uart_init_irq(uint32_t baud) {
    // ... (same as uart_init)
    USART1_CTLR1 |= (1 << 5);          // RXNEIE
    PFIC_IENR1 |= (1u << 29); /* USART1_IRQn = 29 */
}

__attribute__((interrupt))
void USART1_IRQHandler(void) {
    if (USART1_STATR & (1 << 5)) {                     // RXNE
        uint8_t b = USART1_DATAR;                      // reading clears RXNE
        uint8_t next = (rx_head + 1) % RX_BUF_SIZE;
        if (next != rx_tail) {                           // buffer not full
            rx_buf[rx_head] = b;
            rx_head = next;
        }
        // otherwise: drop (overrun) — enlarge the buffer if this happens often
    }
}

int uart_read(void) {
    if (rx_head == rx_tail) return -1;                  // empty
    uint8_t b = rx_buf[rx_tail];
    rx_tail = (rx_tail + 1) % RX_BUF_SIZE;
    return b;
}
```

> 🔄 This is called a **Ring Buffer** (circular buffer). It uses `head` for writes and `tail` for reads.

---

## 9. Redirecting printf to UART

In GCC + newlib-nano, you can override `_write` to redirect output to UART:

```c
#include <unistd.h>

int _write(int fd, const char *buf, int len) {
    for (int i = 0; i < len; i++) {
        if (buf[i] == '\n') uart_putc('\r');
        uart_putc(buf[i]);
    }
    return len;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    uart_init(115200);
    printf("Temp: %d.%02d °C\n", t/100, t%100);
}
```

> 💡 **Watch the size**: full `printf` eats 8–12 KB of flash (the CH32V003 only has 16KB!). Use a slim `printf` (`-u _printf_float -DPRINTF_DISABLE_SUPPORT_FLOAT`).

---

## 10. Commands over UART (Mini Shell)

```c
char line[32]; int line_len = 0;

void process_line(void) {
    line[line_len] = 0;
    if (line[0] == '1') GPIOC_BSHR = (1 << 1);
    else if (line[0] == '0') GPIOC_BCR  = (1 << 1);
    else if (line[0] == 'r') { printf("LED state\n"); }
    line_len = 0;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    while (1) {
        int c = uart_read();
        if (c < 0) { __asm__("wfi"); continue; }
        uart_putc(c);          // echo
        if (c == '\r' || c == '\n') {
            uart_putc('\n');
            process_line();
        } else if (line_len < 31) {
            line[line_len++] = c;
        }
    }
}
```

---

## 11. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Nothing comes out on the other side | TX on PA9 by mistake | Make sure you're on PD5 |
| Unexpected garbage characters | Wrong baud | Check `BRR = APBCLK/baud` |
| Only one character arrives, then it stalls | ORE (Overrun) is set | Read `STATR` then `DATAR` to clear |
| Echo prints duplicated characters | AF Open-Drain mode | Use AF **Push-Pull** |
| RX reads nothing | Forgot RE in CTLR1 | Enable `RE` (bit 2) |
| Interrupt never fires | Forgot RXNEIE | Enable `(1 << 5)` in CTLR1 |
| Buffer overflow | Slow processing | Enlarge the ring buffer or use DMA |

---

## 12. Exercises

1. **Echo Server**: receive any character and send it back + print "OK".
2. **Millisecond counter**: print `millis()` every second.
3. **Command parser**: `led on`, `led off`, `read temp` (with the ADC in lesson 12).
4. **printf with DMA**: when you learn DMA in lesson 13, make TX non-blocking.
5. **Binary frame**: design a byte-based protocol: `<sync><len><payload><CRC>`.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §12.1 "Main Features" — page 138
  - §12.3 "Baud Rate Generator" — page 142
  - §12.10 "Register Description" — pages 144-150
  - Table 7-10 "USART1 Alternate Function Remapping" — page 56
- **CH32V003 Datasheet** — for UART electrical specs.
