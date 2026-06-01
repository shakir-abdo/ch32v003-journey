---
order: 12
slug: "l12-adc"
title: "ADC — قراءة الحساسات التماثلية"
title_en: "ADC Conversions"
icon: "i-lucide-activity"
track: "analog"
level: "intermediate"
minutes: 35
tags: ["adc", "analog"]
---

# الدرس 12: ADC — قراءة الحساسات التماثلية

> **المرجع:** CH32V003 RM v1.9 — الفصل 9 "ADC" — صفحات 65–83.
>
> **العتاد:** CH32V003 + potentiometer أو حساس analog أو ببساطة internal temp sensor.

---

## 0. ما هو الـ ADC؟

**ADC = Analog-to-Digital Converter** — يحوّل جهداً تماثلياً (مثل 1.7V) إلى رقم رقمي يمكن للـ CPU استخدامه.

في `CH32V003`:
- **10-بت** → القيمة بين 0 و 1023.
- المرجع Vref = VDD (عادة 3.3V).
- 8 قنوات خارجية (CH0..CH7) + قناتان داخليتان (Vref و Temp Sensor).

### المعادلة الذهبية

```
V_in = (raw / 1023) × VDD
```

مثال: raw=512 → V_in = 512/1023 × 3.3 = 1.65V.

---

## 1. قنوات ADC الافتراضية

> 📖 *RM, §9.2.1 "Module Structure" — صفحة 65.*

| القناة | الـ Pin (default) | ملاحظة |
|--------|-------------------|--------|
| 0 | PA2 | — |
| 1 | PA1 | — |
| 2 | PC4 | — |
| 3 | PD2 | — |
| 4 | PD3 | — |
| 5 | PD5 | — |
| 6 | PD6 | — |
| 7 | PD4 | — |
| **8** | **Internal Vref (1.2V)** | للمعايرة |
| **9** | **Internal Temp Sensor** | لقياس درجة حرارة الشريحة |

> 💡 على J4M6 (SO8): متوفر فقط CH2 (PC4) و CH3/CH4/CH5 (PD2/3/5) و القنوات الداخلية.

---

## 2. السجلات الرئيسية

| السجل | العنوان | الوصف | RM ص. |
|-------|---------|--------|--------|
| `ADC1_STATR` | `0x40012400` | حالة (EOC, AWD) | 73 |
| `ADC1_CTLR1` | `0x40012404` | Scan, Discontinuous, Watchdog | 74 |
| `ADC1_CTLR2` | `0x40012408` | ADON, CONT, ALIGN, SWSTART | 75 |
| `ADC1_SAMPTR1` | `0x4001240C` | أوقات أخذ العينة (CH10-CH17) | 77 |
| `ADC1_SAMPTR2` | `0x40012410` | أوقات أخذ العينة (CH0-CH9) | 77 |
| `ADC1_RSQR1` | `0x4001242C` | Regular sequence (last 3) | 78 |
| `ADC1_RSQR2` | `0x40012430` | Regular sequence (mid 6) | 79 |
| `ADC1_RSQR3` | `0x40012434` | Regular sequence (first 6) | 79 |
| `ADC1_RDATAR` | `0x4001244C` | بيانات القراءة | 81 |

### بتات `CTLR2` الأهم

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | **ADON** | تشغيل ADC (1=on, 1 مرة ثانية = SW Start) |
| 1 | **CONT** | Continuous mode |
| 2 | CAL | Calibration |
| 3 | RSTCAL | Reset calibration |
| 11 | ALIGN | 0=right-aligned, 1=left-aligned |
| 22 | **SWSTART** | بدء التحويل |

> 📖 *RM, §9.3.3 — صفحة 75.*

---

## 3. شرح Bitwise لتفعيل ADC على PC4 (CH2)

```c
// 1) تفعيل ساعة ADC
RCC->APB2PCENR |= RCC_APB2Periph_ADC1;

// 2) PC4 كـ Analog Input
GPIOC->CFGLR &= ~(0xF << (4*4));    // امسح (يصبح CNF=00, MODE=00 = Analog ✅)

// 3) Sample time للـ CH2 — 3 بتات في SAMPTR2 موقع [8:6]
ADC1->SAMPTR2 &= ~(0x7 << 6);
ADC1->SAMPTR2 |= (0b111 << 6);       // 241 cycles (الأبطأ والأدق)

// 4) Regular sequence: قناة واحدة فقط = CH2
ADC1->RSQR1 &= ~(0xF << 20);         // L[3:0] = 0 (length = 1)
ADC1->RSQR3 &= ~(0x1F);
ADC1->RSQR3 |= 2;                    // first conversion = CH2

// 5) ADON: قم بتشغيله
ADC1->CTLR2 |= (1 << 0);

// 6) Calibration
ADC1->CTLR2 |= (1 << 3);            // RSTCAL
while (ADC1->CTLR2 & (1 << 3));
ADC1->CTLR2 |= (1 << 2);            // CAL
while (ADC1->CTLR2 & (1 << 2));
```

**شرح التفاصيل**:

- **Analog input**: `CNF=00 + MODE=00` (كل البتات الأربع = 0).
- **Sample time** أطول → دقّة أعلى لكن أبطأ. لـ source ذو مقاومة عالية اختر `111` (241 cycles).
- **Regular Sequence**: ترتيب القنوات التي سيتم تحويلها. لكل قناة 5 بتات (الفهرس).
- **L field** في `RSQR1[23:20]` يحدّد عدد القنوات في التسلسل (0 = قناة واحدة).
- **Calibration** ضروري بعد كل تشغيل للحصول على دقة كاملة.

---

## 4. الكود الكامل — قراءة واحدة

```c
#include "ch32v003fun.h"

void adc_init_ch2(void) {
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_ADC1;

    // PC4 = Analog
    GPIOC->CFGLR &= ~(0xF << (4 * 4));

    // Sample time للـ CH2
    ADC1->SAMPTR2 &= ~(0x7 << 6);
    ADC1->SAMPTR2 |= (0b111 << 6);    // 241 cycles

    // Sequence: قناة واحدة = CH2
    ADC1->RSQR1 = 0;
    ADC1->RSQR3 = 2;

    // ADC ON
    ADC1->CTLR2 = (1 << 0);

    // Calibrate
    ADC1->CTLR2 |= (1 << 3);
    while (ADC1->CTLR2 & (1 << 3));
    ADC1->CTLR2 |= (1 << 2);
    while (ADC1->CTLR2 & (1 << 2));
}

uint16_t adc_read(void) {
    ADC1->CTLR2 |= (1 << 22);           // SWSTART
    while (!(ADC1->STATR & (1 << 1))); // EOC
    return ADC1->RDATAR;
}

int main(void) {
    SystemInit();
    uart_init(115200);                  // من الدرس 09
    adc_init_ch2();

    while (1) {
        uint16_t v = adc_read();
        uint32_t mv = v * 3300UL / 1023;
        printf("ADC=%4u  mV=%4u\n", v, (unsigned)mv);
        Delay_Ms(200);
    }
}
```

---

## 5. قراءة Temp Sensor الداخلي (CH9)

```c
void adc_temp_init(void) {
    RCC->APB2PCENR |= RCC_APB2Periph_ADC1;

    // فعّل الـ Temp Sensor + Vref الداخلي
    ADC1->CTLR2 |= (1 << 23);          // TSVREFE

    // Sample time للـ CH9 (في SAMPTR2[29:27])
    ADC1->SAMPTR2 &= ~(0x7 << 27);
    ADC1->SAMPTR2 |= (0b111 << 27);

    ADC1->RSQR1 = 0;
    ADC1->RSQR3 = 9;

    ADC1->CTLR2 |= (1 << 0);
    // calibration كما السابق
}

int32_t temp_celsius(uint16_t raw) {
    // معادلة تقريبية من datasheet
    // V25 ≈ 1.43V, slope ≈ 4.3 mV/°C
    int32_t mv = raw * 3300 / 1023;
    return ((1430 - mv) * 10) / 43 + 25;
}
```

> ⚠️ قياسات الـ Temp Sensor الداخلي غير دقيقة (±5°C). للدقة استخدم حساس خارجي.

---

## 6. وضع المسح (Scan Mode) — قنوات متعددة

نريد قراءة 3 قنوات تباعاً:

```c
// Sequence: CH0, CH2, CH9 (3 قنوات)
ADC1->RSQR1 = (2 << 20);    // L=2 (length = 3)
ADC1->RSQR3 = (0 << 0)      // SQ1 = CH0
            | (2 << 5)      // SQ2 = CH2
            | (9 << 10);    // SQ3 = CH9

ADC1->CTLR1 |= (1 << 8);    // SCAN mode
```

ثم اقرأ بعد كل تحويل (سيُحدّث `RDATAR` تباعاً). الأنظف: استخدم DMA (الدرس 13) لجمعها في array تلقائياً.

---

## 7. Continuous Mode + EOC Interrupt

```c
ADC1->CTLR2 |= (1 << 1);       // CONT = continuous
ADC1->CTLR1 |= (1 << 5);       // EOCIE
NVIC_EnableIRQ(ADC_IRQn);

ADC1->CTLR2 |= (1 << 22);      // SWSTART (مرة واحدة فقط)
```

```c
volatile uint16_t latest_adc = 0;

__attribute__((interrupt))
void ADC1_IRQHandler(void) {
    if (ADC1->STATR & (1 << 1)) {
        latest_adc = ADC1->RDATAR;     // قراءة تمسح EOC
    }
}
```

---

## 8. Watchdog Analog — تنبيه عند تجاوز حد

```c
ADC1->WDHTR = 700;        // إذا raw > 700
ADC1->WDLTR = 300;        // أو < 300
ADC1->CTLR1 |= (1 << 23)  // AWDEN
            | (1 << 22)   // AWDIE
            | (1 << 9)    // AWDSGL (واحد فقط)
            | 2;          // AWDCH = CH2
```

عند الخروج عن النطاق، يشتعل علم `AWD` ومقاطعة.

---

## 9. شرح Bitwise للـ Sample Time Mapping

`SAMPTR1` يحمل sample-time لقنوات 10-17 (الموجودة في WCH شرائح أكبر، غير مستخدم في CH32V003).

`SAMPTR2` يحمل sample-time لقنوات `0..9`. كل قناة تأخذ 3 بتات:

| القناة | البتات | القناة | البتات |
|--------|---------|--------|---------|
| `CH0`  | `[2:0]`   | `CH5`  | `[17:15]` |
| `CH1`  | `[5:3]`   | `CH6`  | `[20:18]` |
| `CH2`  | `[8:6]`   | `CH7`  | `[23:21]` |
| `CH3`  | `[11:9]`  | `CH8`  | `[26:24]` |
| `CH4`  | `[14:12]` | `CH9`  | `[29:27]` |

لقراءة `CH2`: استخدم بتات `[8:6]`.

```c
ADC1->SAMPTR2 = (ADC1->SAMPTR2 & ~(0x7 << 6)) | (0b111 << 6);
```

> 🎯 فهم هذا التخطيط يوفر عليك ساعات من البحث.

---

## 10. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| القراءة دائماً 0 أو 1023 | الـ pin غير في Analog mode | امسح CFGLR للـ pin |
| القيمة متذبذبة كثيراً | sample time قصير + مصدر عالي المقاومة | اختر `111` (241 cycles) |
| الـ ADC لا يبدأ | نسيت `ADON` | `CTLR2 |= 1` |
| القراءة لا تستجيب | نسيت `SWSTART` | `CTLR2 |= (1<<22)` |
| Calibration يعلّق | نسيت تشغيل ADON أولاً | اضبط الترتيب |
| Temp Sensor يعطي مع 1023 | نسيت `TSVREFE` | `CTLR2 |= (1<<23)` |

---

## 11. تمارين

1. **Voltmeter بسيط**: اعرض جهد PC4 على UART (mV).
2. **Potentiometer → PWM**: حوّل قراءة PC4 إلى duty cycle على PC4 PWM (تذكر: لا تستخدم نفس الـ pin!).
3. **Temp logger**: اقرأ Temp Sensor كل ثانية، خزّن آخر 60 قراءة.
4. **Threshold alert**: استخدم Analog Watchdog ليطبع تنبيه عبر UART.
5. **Scan multi-channel**: اقرأ 4 قنوات وحوّلها للـ mV.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §9.2 "Functional Description" — صفحات 65-72
  - §9.3 "Register Description" — صفحات 73-83
- **CH32V003 Datasheet** — معادلة الـ Temp Sensor الدقيقة.
