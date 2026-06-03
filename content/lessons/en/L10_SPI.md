---
order: 10
slug: "l10-spi"
title: "SPI — Master Mode"
title_en: "SPI Master"
icon: "i-lucide-network"
track: "comm"
level: "intermediate"
minutes: 35
tags: ["spi", "master"]
---

# Lesson 10: SPI — High-Speed Communication with Sensors and Memories

> **Reference:** CH32V003 RM v1.9 — Chapter 14 "Serial Peripheral Interface (SPI)" — pages 167–182.
>
> **Hardware:** CH32V003 + any SPI device (e.g., BME280, MAX7219, a small TFT display).

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
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── SPI1 ──────────────────────────────────────────────
#define SPI1_BASE    0x40013000
#define SPI1_CTLR1      (*(volatile u32*)(SPI1_BASE + 0x00))
#define SPI1_STATR      (*(volatile u32*)(SPI1_BASE + 0x08))
#define SPI1_DATAR      (*(volatile u32*)(SPI1_BASE + 0x0C))
#define SPI1_CTLR2      (*(volatile u32*)(SPI1_BASE + 0x04))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. What is SPI?

**SPI = Serial Peripheral Interface** — a 4-wire protocol for high-speed communication between an MCU (Master) and a peripheral (Slave):

```
   Master (MCU)         Slave (Sensor)
   ──────────           ──────────────
      SCK   ──────────►  SCK    (shared clock)
      MOSI  ──────────►  MOSI   (Master Out, Slave In)
      MISO  ◄──────────  MISO   (Master In, Slave Out)
      CS    ──────────►  CS     (Chip Select, Active-Low)
```

**Difference vs UART**: SPI is synchronous (with a clock) → speeds up to tens of MHz, but it needs 4 wires.

---

## 1. Core concepts

### Master/Slave

- Master generates the SCK clock and selects the slave with CS=LOW.
- Sends over MOSI, receives over MISO.
- Data is exchanged on every clock edge in sync (Full-Duplex).

### The four modes (CPOL/CPHA)

| Mode | CPOL | CPHA | When does the slave latch data? |
|------|------|------|---------------------------|
| 0 | 0 | 0 | On the rising edge — **the most common** |
| 1 | 0 | 1 | On the falling edge |
| 2 | 1 | 0 | Each slave defines its own mode — read the datasheet |
| 3 | 1 | 1 | — |

> 📖 *RM, §14.2.2 — page 168.*

### Speed (BR[2:0])

`SPI_BaudRatePrescaler` in `CTLR1[5:3]`. The value divides the clock:

| BR | Divider | @ 48 MHz |
|----|--------|------------|
| 000 | /2 | 24 MHz |
| 001 | /4 | 12 MHz |
| 010 | /8 | 6 MHz |
| 011 | /16 | 3 MHz |
| ... | ... | ... |
| 111 | /256 | 187 kHz |

---

## 2. Pin mapping for SPI1

> 📖 *RM, Table 7-11 — page 56.*

| Signal | Default | Remap |
|---------|---------|-------|
| NSS | PC1 | PC0 |
| **SCK** | **PC5** | PC5 |
| **MISO** | **PC7** | PC7 |
| **MOSI** | **PC6** | PC6 |

> 💡 On J4M6 (SO8): PC5 is **not** available! → you'll need to use Remap or a TSSOP20 package. Check the datasheet for your package.

---

## 3. Important registers

| Register | Address | Description | RM page |
|-------|---------|--------|--------|
| `SPI1_CTLR1` | `0x40013000` | Main configuration | 175 |
| `SPI1_CTLR2` | `0x40013004` | DMA + interrupts | 178 |
| `SPI1_STATR` | `0x40013008` | Status (TXE, RXNE, BSY) | 178 |
| `SPI1_DATAR` | `0x4001300C` | Data (read=RX, write=TX) | 180 |
| `SPI1_CRCR` | `0x40013010` | CRC polynomial | 180 |
| `SPI1_RCRCR` | `0x40013014` | RX CRC value | 181 |
| `SPI1_TCRCR` | `0x40013018` | TX CRC value | 181 |
| `SPI1_HSCR` | `0x4001301C` | High-speed control | 181 |

### Important `CTLR1` bits

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | **CPHA** | Clock Phase |
| 1 | **CPOL** | Clock Polarity |
| 2 | **MSTR** | Master mode (1=master) |
| 3-5 | **BR[2:0]** | Baud rate prescaler |
| 6 | **SPE** | SPI Enable |
| 7 | **LSBFIRST** | 0=MSB first, 1=LSB first |
| 8 | **SSI** | Internal slave select |
| 9 | **SSM** | Software slave management |
| 10 | RXONLY | Receive only |
| 11 | DFF | Data Frame: 0=8-bit, 1=16-bit |

---

## 4. Bitwise explanation — Master Mode 0, 8-bit, /16

```c
SPI1_CTLR1 = (1 << 2)     // MSTR = master
            | (0b011 << 3) // BR = /16 (3 MHz @ 48 MHz)
            | (1 << 8)     // SSI = high (since SSM=1)
            | (1 << 9);    // SSM = software NSS
```

**Step by step**:

1. `1 << 2` → bit 2 = MSTR (we are master).
2. `0b011 << 3` → bits [5:3] = `011` = /16 divider.
3. `1 << 8` → SSI=1 (slave-select stays high internally).
4. `1 << 9` → SSM=1 (manage CS in software, not via the NSS hardware).

> 🔑 Why SSM+SSI? In master mode, if NSS is not properly defined the peripheral enters master fault. This way we tell it: "I am the master, NSS is always high".

---

## 5. The core code

```c
#define CS_PIN  3  // PC3 = Chip Select (Output)

void spi_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 12) /* SPI1EN */ | (1u << 0)  /* AFIOEN */;

    // PC5 (SCK), PC6 (MOSI) = AF Push-Pull
    GPIOC_CFGLR &= ~((0xF << (4*5)) | (0xF << (4*6)));
    GPIOC_CFGLR |=  ((0b1011 << (4*5)) | (0b1011 << (4*6)));

    // PC7 (MISO) = Input Floating
    GPIOC_CFGLR &= ~(0xF << (4*7));
    GPIOC_CFGLR |=  (0b0100 << (4*7));

    // PC3 (CS) = Output, start HIGH
    GPIOC_CFGLR &= ~(0xF << (4*CS_PIN));
    GPIOC_CFGLR |=  (0x3 << (4*CS_PIN));
    GPIOC_BSHR = (1 << CS_PIN);

    // SPI master mode, /16, SW NSS
    SPI1_CTLR1 = (1 << 2) | (0b011 << 3) | (1 << 8) | (1 << 9);
    SPI1_CTLR1 |= (1 << 6);    // SPE: enable
}

static inline void cs_low(void)  { GPIOC_BCR  = (1 << CS_PIN); }
static inline void cs_high(void) { GPIOC_BSHR = (1 << CS_PIN); }

uint8_t spi_xfer(uint8_t b) {
    while (!(SPI1_STATR & (1 << 1)));     // wait TXE
    SPI1_DATAR = b;
    while (!(SPI1_STATR & (1 << 0)));     // wait RXNE
    return SPI1_DATAR;
}

uint8_t sensor_read_reg(uint8_t reg) {
    cs_low();
    spi_xfer(reg | 0x80);    // bit 7 = read (depends on the sensor)
    uint8_t v = spi_xfer(0x00);
    cs_high();
    return v;
}
```

---

## 6. Important STATR bits

> 📖 *RM, §14.3.5 — page 179.*

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | **RXNE** | RX Buffer Not Empty |
| 1 | **TXE** | TX Buffer Empty |
| 4 | UDR | Underrun |
| 6 | OVR | Overrun |
| **7** | **BSY** | SPI is busy — don't toggle CS now! |

> ⚡ **Important**: before raising CS to end the transaction, wait for `BSY=0`:

```c
while (SPI1_STATR & (1 << 7));   // wait BSY clear
cs_high();
```

---

## 7. Examples with common slaves

### BME280 (temperature + humidity + pressure sensor)

```c
#define BME_REG_ID 0xD0
uint8_t id = sensor_read_reg(BME_REG_ID);  // should return 0x60
```

### MAX7219 (LED matrix driver)

```c
void max7219_write(uint8_t reg, uint8_t data) {
    cs_low();
    spi_xfer(reg);
    spi_xfer(data);
    while (SPI1_STATR & (1 << 7));
    cs_high();
}
```

### 25Q-series Flash (e.g., W25Q32)

```c
void flash_read(uint32_t addr, uint8_t *buf, int len) {
    cs_low();
    spi_xfer(0x03);                       // Read command
    spi_xfer((addr >> 16) & 0xFF);
    spi_xfer((addr >> 8) & 0xFF);
    spi_xfer(addr & 0xFF);
    for (int i = 0; i < len; i++) buf[i] = spi_xfer(0x00);
    cs_high();
}
```

---

## 8. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| MOSI emits nothing | Forgot `SPE` | `SPI1_CTLR1 |= (1<<6)` |
| Master Fault Error | NSS lost | Enable `SSM=1` and `SSI=1` |
| Data is bit-reversed | Picked `LSBFIRST` by mistake | Check |
| Slave doesn't respond | Wrong CPOL/CPHA | Read the slave's datasheet |
| Speed is too slow | BR=111 (/256) | Pick a smaller prescaler |
| Read always returns 0xFF | CS not pulled low | Call `cs_low()` before `spi_xfer` |
| System hangs | CS raised before `BSY=0` | Wait for BSY |

---

## 9. High performance with DMA (preview only)

```c
// Will be covered in lesson 13 — DMA
SPI1_CTLR2 |= (1 << 1);   // TXDMAEN
```

---

## 10. Exercises

1. **Loopback Test**: jumper MOSI ↔ MISO. Send a byte and receive it. Verify equality.
2. **BME280**: read the ID register, compare to 0x60.
3. **MAX7219**: drive an 8×8 LED matrix with a chosen pattern.
4. **Different speeds**: with a scope, measure SCK at BR=0, 3, 7.
5. **Multi-Slave**: hook up two slaves on the same bus with separate CS lines.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §14.2 "Function Description" — pages 167-173
  - §14.3 "Register Description" — pages 175-181
  - Table 7-11 "SPI Alternate Function Remapping" — page 56
- Slave datasheet (BME280, MAX7219, …) — defines timing requirements.
