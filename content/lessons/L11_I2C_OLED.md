---
order: 11
slug: "l11-i2c-oled"
title: "I2C — تشغيل SSD1306"
title_en: "I2C + SSD1306 OLED"
icon: "i-lucide-monitor-smartphone"
track: "comm"
level: "intermediate"
minutes: 35
tags: ["i2c", "oled"]
---

# الدرس 11: I2C — تشغيل شاشة SSD1306 OLED

> **المرجع:** CH32V003 RM v1.9 — الفصل 13 "I2C interface" — صفحات 150–167.
>
> **العتاد:** CH32V003 + SSD1306 OLED (128×64) + مقاومتي pull-up 4.7kΩ على SDA و SCL.

---

## 0. ما هو I2C؟

**I2C = Inter-Integrated Circuit** — بروتوكول سلكين فقط (SDA + SCL) يدعم **عدة slaves** على نفس الـ bus. كل slave له **عنوان 7-bit** فريد.

```
   VDD
    │
    ⟗ ⟗  ← Pull-ups 4.7kΩ (إلزامي!)
    │ │
    ●─●──── SDA ────●─────●─────●
    │ │                   │     │
    │ ●──── SCL ────●─────●─────●
    │ │             │     │     │
   MCU            OLED  Sensor  Mem
```

**خصائص**:
- سرعات: 100kHz (standard), 400kHz (fast), 1MHz (fast+).
- Open-Drain (لذلك الـ Pull-ups ضرورية).
- نصف-Duplex (لا يُرسَل ويُستقبَل في نفس اللحظة).

---

## 1. هيكل رسالة I2C

```
START | ADDR + R/W | ACK | DATA | ACK | ... | STOP
```

- **START**: SDA يهبط بينما SCL مرتفع.
- **ADDR+R/W**: 7 بتات للعنوان + بت اتجاه (0=write, 1=read).
- **ACK**: الـ slave يهبط SDA كاعتراف.
- **DATA**: بايتات متعاقبة، كل واحد متبوع بـ ACK.
- **STOP**: SDA يرتفع بينما SCL مرتفع.

---

## 2. خرائط الأطراف لـ I2C1

> 📖 *RM, الجدول 7-12 — صفحة 56.*

| الإشارة | Default | Remap |
|---------|---------|-------|
| **SCL** | **PC2** | PD1 |
| **SDA** | **PC1** | PD0 |

> ⚠️ بما أن LED في كثير من البوردات على PC1، تأكد قبل ربط OLED أنها لا تتعارض.

---

## 3. السجلات الرئيسية

| السجل | العنوان | الوصف | RM ص. |
|-------|---------|--------|--------|
| `I2C1_CTLR1` | `0x40005400` | Enable, Start, Stop, Reset | 158 |
| `I2C1_CTLR2` | `0x40005404` | Frequency, interrupts | 161 |
| `I2C1_OAR1` | `0x40005408` | Own Address 1 | 162 |
| `I2C1_OAR2` | `0x4000540C` | Own Address 2 | 162 |
| `I2C1_DATAR` | `0x40005410` | Data | 163 |
| `I2C1_STAR1` | `0x40005414` | Status 1 | 163 |
| `I2C1_STAR2` | `0x40005418` | Status 2 | 165 |
| `I2C1_CKCFGR` | `0x4000541C` | Clock config (CCR) | 166 |

### بتات CTLR1 المهمة

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | **PE** | Peripheral Enable |
| 8 | **START** | Generate Start condition |
| 9 | **STOP** | Generate Stop condition |
| 10 | ACK | Send ACK after byte |

### بتات STAR1 المهمة

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | SB | Start Bit sent |
| 1 | ADDR | Address sent |
| 2 | BTF | Byte Transfer Finished |
| 6 | RxNE | Receive buffer not empty |
| 7 | **TxE** | Transmit buffer empty |

---

## 4. حساب CCR للسرعة

### في Standard Mode (≤100 kHz)

```
CCR = APB_CLK / (2 × I2C_freq)
```

مثال: 48 MHz APB, 100 kHz → CCR = 48e6 / (2*100e3) = 240.

### في Fast Mode (>100 kHz)

```
CCR = APB_CLK / (3 × I2C_freq)   // duty=0
CCR = APB_CLK / (25 × I2C_freq)  // duty=1
```

> 📖 *RM, §13.3 "Master Mode" — صفحة 153.*

---

## 5. شرح Bitwise لتهيئة I2C @ 100 kHz

```c
// FREQ field (5 بتات) في CTLR2 = تردد APB بالـ MHz
I2C1_CTLR2 = 48;                          // = APB freq in MHz

// CCR في CKCFGR
I2C1_CKCFGR = 240;                        // standard 100 kHz

// PE = enable
I2C1_CTLR1 = (1 << 0);
```

**ملاحظات**:

- `CTLR2[5:0]` = `FREQ` field — يخبر الـ peripheral بسرعة الـ APB بالـ MHz.
- `CKCFGR` يحمل CCR + بت F/S (Fast/Standard) + بت DUTY.

---

## 6. تهيئة GPIO لـ I2C — مهم جداً

I2C يستخدم **Open-Drain** (لذلك pull-up خارجي):

```c
// PC1 (SDA) و PC2 (SCL) كـ AF Open-Drain
GPIOC_CFGLR &= ~((0xF << (4*1)) | (0xF << (4*2)));
GPIOC_CFGLR |=  ((0b1111 << (4*1)) | (0b1111 << (4*2)));
//                  CNF=11 (AF OD), MODE=11 (50MHz)
```

> ⚠️ لا تستخدم Push-Pull للـ I2C! ستحرق المعدن إذا ضربه slave بـ ACK مع المعالج يحاول HIGH.

---

## 7. الكود الكامل — Master Write

```c
void i2c_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 0)  /* AFIOEN */;
    RCC_APB1PCENR |= (1u << 21) /* I2C1EN */;

    // GPIO: SDA=PC1, SCL=PC2 → AF Open-Drain
    GPIOC_CFGLR &= ~((0xF << 4) | (0xF << 8));
    GPIOC_CFGLR |=  ((0b1111 << 4) | (0b1111 << 8));

    // Disable peripheral قبل التهيئة
    I2C1_CTLR1 &= ~(1 << 0);

    // Set APB freq (24 MHz في وضع HSI افتراضي، 48 مع PLL)
    I2C1_CTLR2 = 48;          // غيّر هذا حسب APB لديك
    I2C1_CKCFGR = 240;        // 100 kHz @ 48 MHz APB

    // فعّل الـ peripheral
    I2C1_CTLR1 |= (1 << 0);
}

int i2c_write(uint8_t addr7, const uint8_t *data, int len) {
    // 1) START
    I2C1_CTLR1 |= (1 << 8);
    while (!(I2C1_STAR1 & (1 << 0)));    // wait SB

    // 2) ADDR + W
    I2C1_DATAR = (addr7 << 1) | 0;
    while (!(I2C1_STAR1 & (1 << 1)));    // wait ADDR
    (void)I2C1_STAR2;                     // قراءة STAR2 تمسح ADDR

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

> 🔑 الـ "قراءة STAR2 تمسح ADDR" هي خاصية I2C peripheral. لا تنسَها.

---

## 8. SSD1306 OLED — Hello World

عنوان SSD1306 على I2C عادة `0x3C` (أحياناً 0x3D). كل بايت أمر يسبقه بايت control:

- `0x00` = command
- `0x40` = data

### تسلسل الإقلاع

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

> 📦 للنصوص: تحتاج بيانات خط (font 5x8 أو 6x8). تجد جاهزاً في مكتبات SSD1306.

---

## 9. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| BUSY بشكل دائم | لا pull-ups | ركّب 4.7kΩ على SDA و SCL |
| لا يستجيب الـ slave | عنوان خطأ | استخدم I2C scanner لإيجاد العنوان |
| Acknowledge Failure | عنوان غير موجود أو slave مفصول | تحقق من التوصيل |
| السرعة بطيئة جداً | اخترت Fast Mode بـ CCR كبير | راجع المعادلة |
| الـ peripheral لا يبدأ | نسيت `PE` | `CTLR1 |= 1` |
| ARLO (Arbitration Lost) | متعدد masters على bus | اضف مزامنة |
| النظام يتعلّق في `while` | لا ACK وفقد timeout | أضف timeout للحلقات |

---

## 10. I2C Scanner — أداة ذهبية

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

## 11. تمارين

1. **I2C Scanner** اطبع كل العناوين الموجودة على bus.
2. **SSD1306 Hello**: أرسم "Hello World" في المنتصف.
3. **EEPROM 24LC256**: اكتب 64 بايت وأعد قراءتها للتحقق.
4. **MPU6050**: اقرأ بيانات Accelerometer + Gyro.
5. **Repeated Start**: ابحث عن كيفية تنفيذ Read مع repeated start (لا STOP).

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §13.2 "Overview" — صفحة 150
  - §13.3 "Master Mode" — صفحة 153
  - §13.11 "Register Description" — صفحات 158-166
  - الجدول 7-12 "I2C Alternate Function Remapping" — صفحة 56
- **SSD1306 Datasheet** — Solomon Systech.
- **NXP UM10204** — I2C-bus specification (المرجع المعتمد للبروتوكول).
