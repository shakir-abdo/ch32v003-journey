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

# الدرس 10: SPI — التواصل السريع مع الحساسات والذواكر

> **المرجع:** CH32V003 RM v1.9 — الفصل 14 "Serial Peripheral Interface (SPI)" — صفحات 167–182.
>
> **العتاد:** CH32V003 + أي SPI device (مثلاً BME280, MAX7219, شاشة TFT صغيرة).

---

## 0. ما هو SPI؟

**SPI = Serial Peripheral Interface** — بروتوكول 4-سلكي للتواصل بين MCU (Master) و peripheral (Slave) بسرعة عالية:

```
   Master (MCU)         Slave (Sensor)
   ──────────           ──────────────
      SCK   ──────────►  SCK    (الساعة المشتركة)
      MOSI  ──────────►  MOSI   (Master Out, Slave In)
      MISO  ◄──────────  MISO   (Master In, Slave Out)
      CS    ──────────►  CS     (Chip Select, Active-Low)
```

**الفرق عن UART**: SPI متزامن (مع ساعة) → سرعات حتى عشرات MHz، لكن يحتاج 4 أسلاك.

---

## 1. مفاهيم أساسية

### Master/Slave

- Master يولّد ساعة SCK ويختار الـ slave بـ CS=LOW.
- يرسل عبر MOSI، يستقبل عبر MISO.
- البيانات تتبادل كل ضربة ساعة بالتزامن (Full-Duplex).

### الأنماط الأربعة (CPOL/CPHA)

| Mode | CPOL | CPHA | متى يأخذ Slave البيانات؟ |
|------|------|------|---------------------------|
| 0 | 0 | 0 | عند الحافة الصاعدة (rising) — **الأشهر** |
| 1 | 0 | 1 | عند الحافة الهابطة |
| 2 | 1 | 0 | كل Slave يحدّد نمطه — اقرأ datasheet |
| 3 | 1 | 1 | — |

> 📖 *RM, §14.2.2 — صفحة 168.*

### السرعة (BR[2:0])

`SPI_BaudRatePrescaler` في `CTLR1[5:3]`. القيمة تقسم الساعة:

| BR | القاسم | على 48 MHz |
|----|--------|------------|
| 000 | /2 | 24 MHz |
| 001 | /4 | 12 MHz |
| 010 | /8 | 6 MHz |
| 011 | /16 | 3 MHz |
| ... | ... | ... |
| 111 | /256 | 187 kHz |

---

## 2. خرائط الأطراف لـ SPI1

> 📖 *RM, الجدول 7-11 — صفحة 56.*

| الإشارة | Default | Remap |
|---------|---------|-------|
| NSS | PC1 | PC0 |
| **SCK** | **PC5** | PC5 |
| **MISO** | **PC7** | PC7 |
| **MOSI** | **PC6** | PC6 |

> 💡 على J4M6 (SO8): PC5 غير متاح! → تحتاج استخدام Remap أو حزمة TSSOP20. تحقق من datasheet للحزمة لديك.

---

## 3. السجلات المهمة

| السجل | العنوان | الوصف | RM ص. |
|-------|---------|--------|--------|
| `SPI1_CTLR1` | `0x40013000` | الإعدادات الرئيسية | 175 |
| `SPI1_CTLR2` | `0x40013004` | DMA + interrupts | 178 |
| `SPI1_STATR` | `0x40013008` | حالة (TXE, RXNE, BSY) | 178 |
| `SPI1_DATAR` | `0x4001300C` | البيانات (read=RX, write=TX) | 180 |
| `SPI1_CRCR` | `0x40013010` | CRC polynomial | 180 |
| `SPI1_RCRCR` | `0x40013014` | RX CRC value | 181 |
| `SPI1_TCRCR` | `0x40013018` | TX CRC value | 181 |
| `SPI1_HSCR` | `0x4001301C` | High-speed control | 181 |

### بتات `CTLR1` المهمة

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | **CPHA** | Clock Phase |
| 1 | **CPOL** | Clock Polarity |
| 2 | **MSTR** | Master mode (1=master) |
| 3-5 | **BR[2:0]** | Baud rate prescaler |
| 6 | **SPE** | SPI Enable |
| 7 | **LSBFIRST** | 0=MSB أولاً, 1=LSB أولاً |
| 8 | **SSI** | Internal slave select |
| 9 | **SSM** | Software slave management |
| 10 | RXONLY | استقبال فقط |
| 11 | DFF | Data Frame: 0=8-bit, 1=16-bit |

---

## 4. شرح Bitwise — Master Mode 0, 8-bit, /16

```c
SPI1_CTLR1 = (1 << 2)     // MSTR = master
            | (0b011 << 3) // BR = /16 (3 MHz @ 48 MHz)
            | (1 << 8)     // SSI = high (لما SSM=1)
            | (1 << 9);    // SSM = software NSS
```

**خطوة خطوة**:

1. `1 << 2` → بت 2 = MSTR (we are master).
2. `0b011 << 3` → بتات [5:3] = `011` = قسمة /16.
3. `1 << 8` → SSI=1 (يبقى الـ slave-select مرفوعاً داخلياً).
4. `1 << 9` → SSM=1 (إدارة CS برمجياً وليس عتاد NSS).

> 🔑 لماذا SSM+SSI؟ في master mode إذا كان NSS غير معرّف بطريقة صحيحة، الـ peripheral يدخل master fault. هذه الطريقة تخبره: "أنا الـ master، الـ NSS مرفوع دائماً".

---

## 5. الكود الأساسي

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

    // PC3 (CS) = Output, ابدأ HIGH
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
    while (!(SPI1_STATR & (1 << 1)));     // انتظر TXE
    SPI1_DATAR = b;
    while (!(SPI1_STATR & (1 << 0)));     // انتظر RXNE
    return SPI1_DATAR;
}

uint8_t sensor_read_reg(uint8_t reg) {
    cs_low();
    spi_xfer(reg | 0x80);    // bit 7 = read (يعتمد على الـ sensor)
    uint8_t v = spi_xfer(0x00);
    cs_high();
    return v;
}
```

---

## 6. أهم بتات STATR

> 📖 *RM, §14.3.5 — صفحة 179.*

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | **RXNE** | RX Buffer Not Empty |
| 1 | **TXE** | TX Buffer Empty |
| 4 | UDR | Underrun |
| 6 | OVR | Overrun |
| **7** | **BSY** | SPI is busy — لا تغيّر CS الآن! |

> ⚡ **مهم**: قبل رفع CS لإنهاء transaction، انتظر `BSY=0`:

```c
while (SPI1_STATR & (1 << 7));   // wait BSY clear
cs_high();
```

---

## 7. أمثلة على Slaves شائعة

### BME280 (حساس درجة حرارة + رطوبة + ضغط)

```c
#define BME_REG_ID 0xD0
uint8_t id = sensor_read_reg(BME_REG_ID);  // يجب أن يعطي 0x60
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

### 25Q-series Flash (مثل W25Q32)

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

## 8. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| MOSI لا يخرج شيئاً | نسيت `SPE` | `SPI1_CTLR1 |= (1<<6)` |
| Master Fault Error | NSS lost | فعّل `SSM=1` و `SSI=1` |
| البيانات معكوسة | اخترت `LSBFIRST` بالخطأ | تحقق |
| Slave لا يستجيب | CPOL/CPHA خطأ | اقرأ datasheet للـ slave |
| السرعة بطيئة جداً | BR=111 (/256) | اختر prescaler أصغر |
| Read يرجع 0xFF دائماً | CS غير منزل | استدعِ `cs_low()` قبل `spi_xfer` |
| النظام يتعلّق | CS رفعت قبل `BSY=0` | انتظر BSY |

---

## 9. أداء عالي بالـ DMA (المعاينة فقط)

```c
// سيُشرح في الدرس 13 — DMA
SPI1_CTLR2 |= (1 << 1);   // TXDMAEN
```

---

## 10. تمارين

1. **Loopback Test**: اربط MOSI ↔ MISO. أرسل بايتاً واستلمه. تحقق من المساواة.
2. **BME280**: اقرأ ID register، قارن بـ 0x60.
3. **MAX7219**: شغّل LED matrix 8×8 بنمط معيّن.
4. **سرعات مختلفة**: قس مع oscilloscope الـ SCK عند BR=0, 3, 7.
5. **Multi-Slave**: ربطْ slave-ين على نفس الـ bus مع CS منفصلين.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §14.2 "Function Description" — صفحات 167-173
  - §14.3 "Register Description" — صفحات 175-181
  - الجدول 7-11 "SPI Alternate Function Remapping" — صفحة 56
- Datasheet الـ slave (BME280, MAX7219, …) — يحدّد timing requirements.
