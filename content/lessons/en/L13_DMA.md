---
order: 13
slug: "l13-dma"
title: "DMA — Transfers without the CPU"
title_en: "DMA Transfers"
icon: "i-lucide-share-2"
track: "analog"
level: "intermediate"
minutes: 35
tags: ["dma"]
---

# Lesson 13: DMA — Moving Data Without the CPU

> **Reference:** CH32V003 RM v1.9 — Chapter 8 "DMA" — pages 58–65.
>
> **Hardware:** CH32V003 + the ADC from lesson 12 + the UART from lesson 09.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example from this lesson. The examples below assume these definitions are present.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_AHBPCENR    (*(volatile u32*)(RCC_BASE + 0x14))

// ── USART1 ──────────────────────────────────────────────
#define USART1_BASE    0x40013800
#define USART1_DATAR    (*(volatile u32*)(USART1_BASE + 0x04))
#define USART1_CTLR3    (*(volatile u32*)(USART1_BASE + 0x14))

// ── ADC1 ──────────────────────────────────────────────
#define ADC1_BASE    0x40012400
#define ADC1_CTLR2      (*(volatile u32*)(ADC1_BASE + 0x08))
#define ADC1_RDATAR     (*(volatile u32*)(ADC1_BASE + 0x4C))

// ── DMA1 ──────────────────────────────────────────────
#define DMA1_BASE    0x40020000
#define DMA1_INTFR      (*(volatile u32*)(DMA1_BASE + 0x00))
#define DMA1_INTFCR     (*(volatile u32*)(DMA1_BASE + 0x04))
#define DMA1_CH1_CFGR   (*(volatile u32*)(DMA1_BASE + 0x08))
#define DMA1_CH1_CNTR   (*(volatile u32*)(DMA1_BASE + 0x0C))
#define DMA1_CH1_PADDR  (*(volatile u32*)(DMA1_BASE + 0x10))
#define DMA1_CH1_MADDR  (*(volatile u32*)(DMA1_BASE + 0x14))
#define DMA1_CH4_CFGR   (*(volatile u32*)(DMA1_BASE + 0x44))
#define DMA1_CH4_CNTR   (*(volatile u32*)(DMA1_BASE + 0x48))
#define DMA1_CH4_PADDR  (*(volatile u32*)(DMA1_BASE + 0x4C))
#define DMA1_CH4_MADDR  (*(volatile u32*)(DMA1_BASE + 0x50))

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


## 0. What is DMA?

**DMA = Direct Memory Access** — a hardware engine that moves data between memory and peripherals **without the CPU's involvement**.

### Without DMA

```
ADC → CPU → memory
       ↑
   every sample interrupts the CPU!
```

### With DMA

```
ADC ────► DMA ────► memory
                ↑
        one interrupt at the end, that's it
```

The result:
- ✅ The CPU is free to do other things, or sleep.
- ✅ High throughput (one cycle per transfer).
- ✅ Tight timing with no jitter.

---

## 1. DMA architecture on the CH32V003

7 DMA channels. Each one serves a specific peripheral. The golden table:

> 📖 *RM, §8.2.3 "DMA Request Mapping" — pages 60-62.*

| Channel | Possible sources |
|------|------------------|
| 1 | ADC1, TIM1_CH3 |
| 2 | SPI1_RX, USART1_TX, I2C1_TX, TIM1_CH1 |
| 3 | SPI1_TX, USART1_RX, I2C1_RX, TIM1_CH2 |
| 4 | TIM1_CH4/TRIG/COM |
| 5 | TIM1_UP |
| 6 | TIM2_CH3, TIM2_UP |
| 7 | TIM2_CH2/CH4 |

> 💡 For ADC: use channel 1. For UART TX: channel 2. For UART RX: channel 3.

---

## 2. Per-channel registers

| Register | Address (Channel 1) | Description |
|-------|---------------------|--------|
| `DMA_INTFR` | `0x40020000` | Interrupt flags |
| `DMA_INTFCR` | `0x40020004` | Clear interrupt flags |
| `DMA_CFGR1` | `0x40020008` | Channel 1 config |
| `DMA_CNTR1` | `0x4002000C` | Remaining transfers counter |
| `DMA_PADDR1` | `0x40020010` | Peripheral address |
| `DMA_MADDR1` | `0x40020014` | Memory address |

Each subsequent channel is +0x14 bytes after the previous one.

### Important `CFGR` bits

> 📖 *RM, §8.3.3 — page 62.*

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | **EN** | Enable the channel |
| 1 | **TCIE** | Transfer Complete IRQ |
| 4 | **DIR** | 1 = memory → peripheral, 0 = the opposite |
| 5 | **CIRC** | Circular mode |
| 6 | **PINC** | Peripheral pointer increment |
| 7 | **MINC** | Memory pointer increment |
| 9:8 | **PSIZE** | Peripheral data size (00=8, 01=16, 10=32) |
| 11:10 | **MSIZE** | Memory data size |
| 13:12 | **PL** | Priority (00=low, 11=very high) |
| 14 | MEM2MEM | Memory-to-memory mode |

---

## 3. Bitwise walkthrough — DMA pulling ADC into an array

```c
#define N_SAMPLES 64
volatile uint16_t adc_buf[N_SAMPLES];

void dma_adc_init(void) {
    RCC_AHBPCENR |= (1 << 0);           // DMA1 clock

    // Channel 1 for ADC reads
    DMA1_CH1_CFGR = 0;             // disable + reset
    DMA1_CH1_PADDR = (uint32_t)&ADC1_RDATAR;
    DMA1_CH1_MADDR = (uint32_t)adc_buf;
    DMA1_CH1_CNTR  = N_SAMPLES;

    DMA1_CH1_CFGR = (0b01 << 8)    // PSIZE = 16-bit
                        | (0b01 << 10)   // MSIZE = 16-bit
                        | (1 << 7)       // MINC: increment memory
                        | (1 << 5)       // CIRC: circular
                        | (0b10 << 12)   // High priority
                        | (1 << 1)       // TCIE
                        | (1 << 0);      // EN

    // Enable ADC DMA mode
    ADC1_CTLR2 |= (1 << 8);             // DMA bit
    ADC1_CTLR2 |= (1 << 1);             // CONT
    ADC1_CTLR2 |= (1 << 22);            // SWSTART

    PFIC_IENR1 |= (1u << 22); /* DMA1_Channel1_IRQn = 22 */
}

__attribute__((interrupt))
void DMA1_Channel1_IRQHandler(void) {
    if (DMA1_INTFR & (1 << 1)) {        // TCIF1
        DMA1_INTFCR = (1 << 1);          // clear
        // adc_buf is now full with 64 samples
    }
}
```

**Walkthrough**:

1. `PADDR = &ADC1_RDATAR` — data source (the ADC register).
2. `MADDR = adc_buf` — memory destination.
3. `CNTR = 64` — number of transfers.
4. `PSIZE = MSIZE = 01` (16-bit) because the ADC produces 10-bit data in a 16-bit container.
5. `MINC = 1` — the memory pointer advances with each transfer.
6. `PINC = 0` — the peripheral pointer is fixed (always the same register).
7. `CIRC = 1` — when it reaches the end, it wraps to the start automatically.

---

## 4. DMA + UART TX — send a string without blocking the CPU

```c
void uart_send_dma(const char *buf, uint16_t len) {
    DMA1_CH4_CFGR = 0;
    DMA1_CH4_PADDR = (uint32_t)&USART1_DATAR;
    DMA1_CH4_MADDR = (uint32_t)buf;
    DMA1_CH4_CNTR  = len;

    DMA1_CH4_CFGR = (0b00 << 8)   // PSIZE 8-bit
                        | (0b00 << 10)  // MSIZE 8-bit
                        | (1 << 7)      // MINC
                        | (1 << 4)      // DIR: memory→peripheral
                        | (1 << 0);     // EN

    USART1_CTLR3 |= (1 << 7);          // DMAT enable
}
```

> ⚠️ Check the table: USART1_TX uses **Channel 4** on the CH32V003. Don't guess.

---

## 5. Important — data sizes must match

```
ADC output = 16-bit  →  PSIZE = 01
Memory    = uint16_t →  MSIZE = 01
```

Or:

```
UART  = 8-bit       →  PSIZE = 00
Memory= char        →  MSIZE = 00
```

> 💀 If the sizes don't match, "data alignment" issues will corrupt the data.

---

## 6. Circular Mode — a hardware ring buffer

```c
DMA1_CH1_CFGR |= (1 << 5);     // CIRC
```

Instead of stopping when `CNTR` reaches 0, the counter is reloaded with its original value and the channel keeps going. Useful for:

- A continuous ADC filling a buffer circularly.
- UART RX receiving data nonstop.

Use `CNTR` itself to know the current position:

```c
uint32_t pos = N_SAMPLES - DMA1_CH1_CNTR;
```

---

## 7. DMA interrupts

`DMA_INTFR` holds flags for each channel:

| Channel | TCIF | HTIF | TEIF | GIF |
|--------|------|------|------|-----|
| 1 | bit 1 | bit 2 | bit 3 | bit 0 |
| 2 | bit 5 | bit 6 | bit 7 | bit 4 |
| 3 | bit 9 | ... | ... | ... |

- **TCIF** = Transfer Complete.
- **HTIF** = Half Transfer (great for a ping-pong buffer).
- **TEIF** = Transfer Error.
- **GIF** = Global flag.

Clear by writing `1` into `INTFCR`.

---

## 8. Ping-Pong Buffer — lossless processing

```c
#define BUF_SIZE 128
volatile uint16_t buf[BUF_SIZE];

void process(uint16_t *ptr, int len) { /* ... */ }

__attribute__((interrupt))
void DMA1_Channel1_IRQHandler(void) {
    uint32_t flags = DMA1_INTFR;
    if (flags & (1 << 2)) {                   // HTIF1: half full
        DMA1_INTFCR = (1 << 2);
        process(&buf[0], BUF_SIZE/2);          // process the first half
    }
    if (flags & (1 << 1)) {                   // TCIF1: full
        DMA1_INTFCR = (1 << 1);
        process(&buf[BUF_SIZE/2], BUF_SIZE/2); // process the second half
    }
}
```

> 💎 This pattern guarantees that processing won't collide with the ongoing write → no data loss.

---

## 9. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| No transfer happens | Forgot `EN` in CFGR | Enable bit 0 |
| Values overlap | PSIZE/MSIZE mismatched | Align them |
| Memory pointer doesn't advance | `MINC=0` | Enable it |
| Data goes the wrong way | Wrong `DIR` | Check |
| Interrupt never fires | Forgot `TCIE` or `NVIC_EnableIRQ` | Enable both |
| Transfer Error | Invalid address | Check PADDR/MADDR |
| UART doesn't send via DMA | Forgot `DMAT` in `CTLR3` | Enable it |
| ADC doesn't trigger DMA | Forgot the `DMA` bit in `CTLR2` | `(1<<8)` |

---

## 10. Exercises

1. **ADC sampling**: 1000 samples/second, store them in a 512-element buffer.
2. **UART DMA echo**: receive via DMA, send via DMA.
3. **Audio stream**: ADC + DMA + UART = stream audio to the PC.
4. **Memory copy**: use MEM2MEM to copy data inside memory.
5. **DMA + Timer**: have a timer trigger DMA every ms to read GPIO.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §8.2 "Function Description" — pages 58-62
  - §8.2.3 "DMA Request Mapping" — pages 60-62 (the golden table)
  - §8.3 "Register Description" — pages 62-65
