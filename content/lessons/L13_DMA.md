---
order: 13
slug: "l13-dma"
title: "DMA — نقل بدون CPU"
title_en: "DMA Transfers"
icon: "i-lucide-share-2"
track: "analog"
level: "intermediate"
minutes: 35
tags: ["dma"]
---

# الدرس 13: DMA — نقل بيانات بدون CPU

> **المرجع:** CH32V003 RM v1.9 — الفصل 8 "DMA" — صفحات 58–65.
>
> **العتاد:** CH32V003 + ADC من الدرس 12 + UART من الدرس 09.

---

## 0. ما هو الـ DMA؟

**DMA = Direct Memory Access** — وحدة عتادية تنقل بيانات بين الذاكرة والـ peripherals **بدون تدخّل الـ CPU**.

### بدون DMA

```
ADC → CPU → الذاكرة
       ↑
   كل sample يقاطع الـ CPU!
```

### مع DMA

```
ADC ────► DMA ────► الذاكرة
                ↑
        مقاطعة واحدة عند الانتهاء فقط
```

النتيجة:
- ✅ الـ CPU حر لعمل أشياء أخرى أو النوم.
- ✅ سرعة عالية (دورة واحدة لكل نقل).
- ✅ توقيت دقيق بلا jitter.

---

## 1. معمارية DMA في CH32V003

7 قنوات DMA. كل قناة تخدم peripheral محدد. الجدول الذهبي:

> 📖 *RM, §8.2.3 "DMA Request Mapping" — صفحات 60-62.*

| قناة | المصادر الممكنة |
|------|------------------|
| 1 | ADC1, TIM1_CH3 |
| 2 | SPI1_RX, USART1_TX, I2C1_TX, TIM1_CH1 |
| 3 | SPI1_TX, USART1_RX, I2C1_RX, TIM1_CH2 |
| 4 | TIM1_CH4/TRIG/COM |
| 5 | TIM1_UP |
| 6 | TIM2_CH3, TIM2_UP |
| 7 | TIM2_CH2/CH4 |

> 💡 لـ ADC: استخدم القناة 1. لـ UART TX: القناة 2. لـ UART RX: القناة 3.

---

## 2. السجلات لكل قناة

| السجل | العنوان (Channel 1) | الوصف |
|-------|---------------------|--------|
| `DMA_INTFR` | `0x40020000` | علم المقاطعة |
| `DMA_INTFCR` | `0x40020004` | مسح المقاطعة |
| `DMA_CFGR1` | `0x40020008` | إعدادات القناة 1 |
| `DMA_CNTR1` | `0x4002000C` | عدّاد البايتات المتبقية |
| `DMA_PADDR1` | `0x40020010` | عنوان الـ peripheral |
| `DMA_MADDR1` | `0x40020014` | عنوان الذاكرة |

كل قناة لاحقة تبعد +0x14 بايت عن السابقة.

### بتات `CFGR` المهمة

> 📖 *RM, §8.3.3 — صفحة 62.*

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | **EN** | تفعيل القناة |
| 1 | **TCIE** | Transfer Complete IRQ |
| 4 | **DIR** | 1 = ذاكرة → peripheral, 0 = العكس |
| 5 | **CIRC** | Circular mode |
| 6 | **PINC** | Peripheral pointer increment |
| 7 | **MINC** | Memory pointer increment |
| 9:8 | **PSIZE** | Peripheral data size (00=8, 01=16, 10=32) |
| 11:10 | **MSIZE** | Memory data size |
| 13:12 | **PL** | Priority (00=low, 11=very high) |
| 14 | MEM2MEM | Memory-to-memory mode |

---

## 3. شرح Bitwise — DMA لقراءة ADC إلى array

```c
#define N_SAMPLES 64
volatile uint16_t adc_buf[N_SAMPLES];

void dma_adc_init(void) {
    RCC->AHBPCENR |= (1 << 0);           // DMA1 clock

    // Channel 1 لقراءة ADC
    DMA1_Channel1->CFGR = 0;             // disable + reset
    DMA1_Channel1->PADDR = (uint32_t)&ADC1->RDATAR;
    DMA1_Channel1->MADDR = (uint32_t)adc_buf;
    DMA1_Channel1->CNTR  = N_SAMPLES;

    DMA1_Channel1->CFGR = (0b01 << 8)    // PSIZE = 16-bit
                        | (0b01 << 10)   // MSIZE = 16-bit
                        | (1 << 7)       // MINC: increment memory
                        | (1 << 5)       // CIRC: circular
                        | (0b10 << 12)   // High priority
                        | (1 << 1)       // TCIE
                        | (1 << 0);      // EN

    // فعّل ADC DMA mode
    ADC1->CTLR2 |= (1 << 8);             // DMA bit
    ADC1->CTLR2 |= (1 << 1);             // CONT
    ADC1->CTLR2 |= (1 << 22);            // SWSTART

    NVIC_EnableIRQ(DMA1_Channel1_IRQn);
}

__attribute__((interrupt))
void DMA1_Channel1_IRQHandler(void) {
    if (DMA1->INTFR & (1 << 1)) {        // TCIF1
        DMA1->INTFCR = (1 << 1);          // مسح
        // adc_buf الآن ممتلئ بـ 64 عينة
    }
}
```

**شرح**:

1. `PADDR = &ADC1->RDATAR` — مصدر البيانات (سجل الـ ADC).
2. `MADDR = adc_buf` — وجهة الذاكرة.
3. `CNTR = 64` — عدد النقلات.
4. `PSIZE = MSIZE = 01` (16-bit) لأن ADC يعطي 10-bit في 16-bit container.
5. `MINC = 1` — مؤشر الذاكرة يزيد كل نقل (المؤشر يتقدم).
6. `PINC = 0` — مؤشر الـ peripheral ثابت (نفس السجل دائماً).
7. `CIRC = 1` — عندما يصل النهاية، يعود للبداية تلقائياً.

---

## 4. DMA + UART TX — إرسال string بدون توقّف الـ CPU

```c
void uart_send_dma(const char *buf, uint16_t len) {
    DMA1_Channel4->CFGR = 0;
    DMA1_Channel4->PADDR = (uint32_t)&USART1->DATAR;
    DMA1_Channel4->MADDR = (uint32_t)buf;
    DMA1_Channel4->CNTR  = len;

    DMA1_Channel4->CFGR = (0b00 << 8)   // PSIZE 8-bit
                        | (0b00 << 10)  // MSIZE 8-bit
                        | (1 << 7)      // MINC
                        | (1 << 4)      // DIR: memory→peripheral
                        | (1 << 0);     // EN

    USART1->CTLR3 |= (1 << 7);          // DMAT enable
}
```

> ⚠️ تحقق من الجدول: USART1_TX يستخدم **Channel 4** على CH32V003. لا تخمّن.

---

## 5. مهم — أحجام البيانات يجب أن تتطابق

```
ADC ouput = 16-bit  →  PSIZE = 01
Memory   = uint16_t →  MSIZE = 01
```

أو:

```
UART  = 8-bit       →  PSIZE = 00
Memory= char        →  MSIZE = 00
```

> 💀 إذا الأحجام مختلفة، تحدث "data alignment" قد تخرّب البيانات.

---

## 6. Circular Mode — Ring buffer عتادي

```c
DMA1_Channel1->CFGR |= (1 << 5);     // CIRC
```

بدلاً من التوقف عند انتهاء `CNTR`، يعيد العدّاد إلى القيمة الأصلية ويواصل. مفيد لـ:

- ADC مستمر يملأ buffer دائرياً.
- UART RX يستقبل بيانات بلا توقف.

استخدم `CNTR` نفسه لمعرفة الموقع الحالي:

```c
uint32_t pos = N_SAMPLES - DMA1_Channel1->CNTR;
```

---

## 7. مقاطعات DMA

`DMA_INTFR` يحمل أعلام لكل قناة:

| القناة | TCIF | HTIF | TEIF | GIF |
|--------|------|------|------|-----|
| 1 | bit 1 | bit 2 | bit 3 | bit 0 |
| 2 | bit 5 | bit 6 | bit 7 | bit 4 |
| 3 | bit 9 | ... | ... | ... |

- **TCIF** = Transfer Complete.
- **HTIF** = Half Transfer (مفيد لـ ping-pong buffer).
- **TEIF** = Transfer Error.
- **GIF** = Global flag.

المسح بكتابة `1` في `INTFCR`.

---

## 8. Ping-Pong Buffer — معالجة بدون فقد بيانات

```c
#define BUF_SIZE 128
volatile uint16_t buf[BUF_SIZE];

void process(uint16_t *ptr, int len) { /* ... */ }

__attribute__((interrupt))
void DMA1_Channel1_IRQHandler(void) {
    uint32_t flags = DMA1->INTFR;
    if (flags & (1 << 2)) {                   // HTIF1: نصف ممتلئ
        DMA1->INTFCR = (1 << 2);
        process(&buf[0], BUF_SIZE/2);          // عالج النصف الأول
    }
    if (flags & (1 << 1)) {                   // TCIF1: ممتلئ
        DMA1->INTFCR = (1 << 1);
        process(&buf[BUF_SIZE/2], BUF_SIZE/2); // عالج النصف الثاني
    }
}
```

> 💎 هذا النمط يضمن أن المعالجة لا تتدخل في الكتابة الجارية → لا فقد للبيانات.

---

## 9. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| لا نقل يحدث | نسيت `EN` في CFGR | فعّل بت 0 |
| القيم تتداخل | PSIZE/MSIZE غير متطابقتين | اضبطهما |
| الـ memory لا تتقدم | `MINC=0` | فعّله |
| البيانات معكوسة | `DIR` خطأ | تحقق |
| المقاطعة لا تشتعل | نسيت `TCIE` أو `NVIC_EnableIRQ` | فعّلهما |
| Transfer Error | عنوان غير صالح | تحقق من PADDR/MADDR |
| UART لا يرسل عبر DMA | نسيت `DMAT` في `CTLR3` | فعّله |
| ADC لا يطلق DMA | نسيت `DMA` بت في `CTLR2` | `(1<<8)` |

---

## 10. تمارين

1. **ADC sampling**: 1000 sample/second، خزّنها في buffer 512.
2. **UART DMA echo**: استقبل عبر DMA، أرسل عبر DMA.
3. **Audio stream**: ADC + DMA + UART = streaming audio data للحاسوب.
4. **Memory copy**: استخدم MEM2MEM لنقل بيانات في الذاكرة.
5. **DMA + Timer**: timer يطلق DMA كل ms لقراءة GPIO.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §8.2 "Function Description" — صفحات 58-62
  - §8.2.3 "DMA Request Mapping" — صفحات 60-62 (الجدول الذهبي)
  - §8.3 "Register Description" — صفحات 62-65
