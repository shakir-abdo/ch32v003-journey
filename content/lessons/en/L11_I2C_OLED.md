---
order: 11
slug: "l11-i2c-oled"
title: "I2C — Driving an SSD1306"
title_en: "I2C + SSD1306 OLED"
icon: "i-lucide-monitor-smartphone"
track: "comm"
level: "intermediate"
minutes: 35
tags: ["i2c", "oled"]
---

# Lesson 11: I2C — Driving an SSD1306 OLED

> **Reference:** CH32V003 RM v1.9 — Chapter 13 "I2C interface" — pages 150–167.
>
> **Hardware:** CH32V003 + SSD1306 OLED (128×64) + two 4.7kΩ pull-up resistors on SDA and SCL.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example from this lesson. The examples below assume these definitions are present.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_APB2PCENR   (*(volatile u32*)(RCC_BASE + 0x18))
#define RCC_APB1PCENR   (*(volatile u32*)(RCC_BASE + 0x1C))

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_CFGLR     (*(volatile u32*)(GPIOC_BASE + 0x00))

// ── I2C1 ──────────────────────────────────────────────
#define I2C1_BASE    0x40005400
#define I2C1_CTLR1      (*(volatile u32*)(I2C1_BASE + 0x00))
#define I2C1_CTLR2      (*(volatile u32*)(I2C1_BASE + 0x04))
#define I2C1_CKCFGR     (*(volatile u32*)(I2C1_BASE + 0x1C))
#define I2C1_DATAR      (*(volatile u32*)(I2C1_BASE + 0x10))
#define I2C1_STAR1      (*(volatile u32*)(I2C1_BASE + 0x14))
#define I2C1_STAR2      (*(volatile u32*)(I2C1_BASE + 0x18))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. What is I2C?

**I2C = Inter-Integrated Circuit** — a 2-wire protocol (SDA + SCL) supporting **multiple slaves** on the same bus. Each slave has a unique **7-bit address**.

```
   VDD
    │
    ⟗ ⟗  ← Pull-ups 4.7kΩ (mandatory!)
    │ │
    ●─●──── SDA ────●─────●─────●
    │ │                   │     │
    │ ●──── SCL ────●─────●─────●
    │ │             │     │     │
   MCU            OLED  Sensor  Mem
```

**Characteristics**:
- Speeds: 100kHz (standard), 400kHz (fast), 1MHz (fast+).
- Open-Drain (which is why the pull-ups are required).
- Half-duplex (you can't send and receive at the same instant).

---

## 1. I2C message structure

```
START | ADDR + R/W | ACK | DATA | ACK | ... | STOP
```

- **START**: SDA falls while SCL is high.
- **ADDR+R/W**: 7 bits of address + a direction bit (0=write, 1=read).
- **ACK**: the slave pulls SDA low to acknowledge.
- **DATA**: consecutive bytes, each followed by an ACK.
- **STOP**: SDA rises while SCL is high.

---

## 2. Pin mapping for I2C1

> 📖 *RM, Table 7-12 — page 56.*

| Signal | Default | Remap |
|---------|---------|-------|
| **SCL** | **PC2** | PD1 |
| **SDA** | **PC1** | PD0 |

> ⚠️ Since the LED on many boards sits on PC1, make sure it doesn't clash before wiring an OLED.

---

## 3. Main registers

| Register | Address | Description | RM page |
|-------|---------|--------|--------|
| `I2C1_CTLR1` | `0x40005400` | Enable, Start, Stop, Reset | 158 |
| `I2C1_CTLR2` | `0x40005404` | Frequency, interrupts | 161 |
| `I2C1_OAR1` | `0x40005408` | Own Address 1 | 162 |
| `I2C1_OAR2` | `0x4000540C` | Own Address 2 | 162 |
| `I2C1_DATAR` | `0x40005410` | Data | 163 |
| `I2C1_STAR1` | `0x40005414` | Status 1 | 163 |
| `I2C1_STAR2` | `0x40005418` | Status 2 | 165 |
| `I2C1_CKCFGR` | `0x4000541C` | Clock config (CCR) | 166 |

### Important CTLR1 bits

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | **PE** | Peripheral Enable |
| 8 | **START** | Generate Start condition |
| 9 | **STOP** | Generate Stop condition |
| 10 | ACK | Send ACK after byte |

### Important STAR1 bits

| Bit | Name | Meaning |
|------|-------|--------|
| 0 | SB | Start Bit sent |
| 1 | ADDR | Address sent |
| 2 | BTF | Byte Transfer Finished |
| 6 | RxNE | Receive buffer not empty |
| 7 | **TxE** | Transmit buffer empty |

---

## 4. Computing CCR for the bus speed

### In Standard Mode (≤100 kHz)

```
CCR = APB_CLK / (2 × I2C_freq)
```

Example: 48 MHz APB, 100 kHz → CCR = 48e6 / (2*100e3) = 240.

### In Fast Mode (>100 kHz)

```
CCR = APB_CLK / (3 × I2C_freq)   // duty=0
CCR = APB_CLK / (25 × I2C_freq)  // duty=1
```

> 📖 *RM, §13.3 "Master Mode" — page 153.*

---

## 5. Bitwise walkthrough of an I2C init @ 100 kHz

```c
// FREQ field (5 bits) in CTLR2 = APB frequency in MHz
I2C1_CTLR2 = 48;                          // = APB freq in MHz

// CCR in CKCFGR
I2C1_CKCFGR = 240;                        // standard 100 kHz

// PE = enable
I2C1_CTLR1 = (1 << 0);
```

**Notes**:

- `CTLR2[5:0]` = `FREQ` field — tells the peripheral the APB speed in MHz.
- `CKCFGR` holds CCR + F/S bit (Fast/Standard) + DUTY bit.

---

## 6. GPIO configuration for I2C — very important

I2C uses **Open-Drain** (hence the external pull-ups):

```c
// PC1 (SDA) and PC2 (SCL) as AF Open-Drain
GPIOC_CFGLR &= ~((0xF << (4*1)) | (0xF << (4*2)));
GPIOC_CFGLR |=  ((0b1111 << (4*1)) | (0b1111 << (4*2)));
//                  CNF=11 (AF OD), MODE=11 (50MHz)
```

> ⚠️ Don't use Push-Pull for I2C! You'll damage the pin if the slave tries to pull the line LOW (ACK) while the MCU tries to drive it HIGH — that's a direct short.

---

## 7. Full code — Master Write

```c
void i2c_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 0)  /* AFIOEN */;
    RCC_APB1PCENR |= (1u << 21) /* I2C1EN */;

    // GPIO: SDA=PC1, SCL=PC2 → AF Open-Drain
    GPIOC_CFGLR &= ~((0xF << 4) | (0xF << 8));
    GPIOC_CFGLR |=  ((0b1111 << 4) | (0b1111 << 8));

    // Disable the peripheral before configuring
    I2C1_CTLR1 &= ~(1 << 0);

    // Set APB freq (24 MHz on default HSI, 48 with PLL)
    I2C1_CTLR2 = 48;          // change this to your actual APB
    I2C1_CKCFGR = 240;        // 100 kHz @ 48 MHz APB

    // Enable the peripheral
    I2C1_CTLR1 |= (1 << 0);
}

int i2c_write(uint8_t addr7, const uint8_t *data, int len) {
    // 1) START
    I2C1_CTLR1 |= (1 << 8);
    while (!(I2C1_STAR1 & (1 << 0)));    // wait SB

    // 2) ADDR + W
    I2C1_DATAR = (addr7 << 1) | 0;
    while (!(I2C1_STAR1 & (1 << 1)));    // wait ADDR
    (void)I2C1_STAR2;                     // reading STAR2 clears ADDR

    // 3) DATA
    for (int i = 0; i < len; i++) {
        while (!(I2C1_STAR1 & (1 << 7)));    // TxE
        I2C1_DATAR = data[i];
    }
    while (!(I2C1_STAR1 & (1 << 2)));    // BTF

    // 4) STOP
    I2C1_CTLR1 |= (1 << 9);
    return 0;
}
```

> 🔑 The "reading STAR2 clears ADDR" trick is an I2C-peripheral quirk. Don't forget it.

---

## 8. SSD1306 OLED — Hello World

The SSD1306 I2C address is usually `0x3C` (sometimes 0x3D). Every command byte is preceded by a control byte:

- `0x00` = command
- `0x40` = data

### Boot sequence

```c
const uint8_t ssd1306_init_seq[] = {
    0x00,         // control: command
    0xAE,         // display off
    0xD5, 0x80,   // clock divide
    0xA8, 0x3F,   // multiplex 64
    0xD3, 0x00,   // offset 0
    0x40,         // start line 0
    0x8D, 0x14,   // charge pump on
    0x20, 0x00,   // memory mode horizontal
    0xA1,         // segment remap
    0xC8,         // COM scan dec
    0xDA, 0x12,   // COM pins
    0x81, 0x7F,   // contrast
    0xD9, 0xF1,   // pre-charge
    0xDB, 0x40,   // VCOM detect
    0xA4,         // entire display on (RAM)
    0xA6,         // normal display
    0xAF          // display on
};

void ssd1306_init(void) {
    i2c_write(0x3C, ssd1306_init_seq, sizeof(ssd1306_init_seq));
}

void ssd1306_clear(void) {
    for (int p = 0; p < 8; p++) {
        uint8_t cmd[] = {0x00, 0xB0 | p, 0x00, 0x10};   // set page + col
        i2c_write(0x3C, cmd, 4);
        uint8_t blank[129] = {0x40};                     // data marker + 128 zeros
        i2c_write(0x3C, blank, 129);
    }
}
```

> 📦 For text: you'll need font data (5x8 or 6x8). Ready-made versions exist in SSD1306 libraries.

---

## 9. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Permanently BUSY | No pull-ups | Add 4.7kΩ on SDA and SCL |
| Slave doesn't respond | Wrong address | Use an I2C scanner to find the address |
| Acknowledge Failure | Address doesn't exist or slave is disconnected | Check wiring |
| Too slow | Picked Fast Mode with a large CCR | Recheck the equation |
| Peripheral never starts | Forgot `PE` | `CTLR1 |= 1` |
| ARLO (Arbitration Lost) | Multiple masters on the bus | Add synchronization |
| Hangs in `while` | No ACK and no timeout | Add a timeout to the loops |

---

## 10. I2C Scanner — a golden tool

```c
void i2c_scan(void) {
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        I2C1_CTLR1 |= (1 << 8);                   // START
        while (!(I2C1_STAR1 & (1 << 0)));
        I2C1_DATAR = (addr << 1) | 0;
        // wait ADDR or AF (acknowledge failure)
        uint32_t to = 10000;
        while (!(I2C1_STAR1 & ((1<<1) | (1<<10))) && --to);
        if (I2C1_STAR1 & (1 << 1)) {
            printf("Found: 0x%02X\n", addr);
            (void)I2C1_STAR2;
        } else {
            I2C1_STAR1 &= ~(1 << 10);              // clear AF
        }
        I2C1_CTLR1 |= (1 << 9);                   // STOP
        delay_ms(2);
    }
}
```

---

## 11. Exercises

1. **I2C Scanner**: print every address present on the bus.
2. **SSD1306 Hello**: draw "Hello World" in the middle.
3. **EEPROM 24LC256**: write 64 bytes and read them back to verify.
4. **MPU6050**: read Accelerometer + Gyro data.
5. **Repeated Start**: figure out how to do a Read with a repeated start (no STOP in between).

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §13.2 "Overview" — page 150
  - §13.3 "Master Mode" — page 153
  - §13.11 "Register Description" — pages 158-166
  - Table 7-12 "I2C Alternate Function Remapping" — page 56
- **SSD1306 Datasheet** — Solomon Systech.
- **NXP UM10204** — I2C-bus specification (the canonical protocol reference).
