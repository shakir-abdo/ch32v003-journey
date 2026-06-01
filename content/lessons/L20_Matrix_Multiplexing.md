---
order: 20
slug: "l20-matrix-multiplexing"
title: "Matrix Multiplexing — كثير من LEDs، قليل من Pins"
title_en: "Matrix Multiplexing"
icon: "i-lucide-grid-3x3"
track: "bonus"
level: "advanced"
minutes: 45
tags: ["matrix", "multiplexing", "pov", "led"]
---

# الدرس 20: Matrix Multiplexing — كثير من LEDs، قليل من Pins 🪩

> **العتاد:** CH32V003 + 9 LEDs عادية (للـ 3×3 مثال) + 9 مقاومات 220Ω.
> **الشرط المُسبَق:** [L06 SysTick](/lessons/l06-systick) — سنبني الـ scan loop عليه.

---

## 0. المشكلة

تريد بناء عرض LEDs بحجم 8×8 (64 LED) لكن المتحكّم عنده 18 طرفاً فقط على J4M6. كيف؟ الحلّ هو **Multiplexing**: قسّم الـ LEDs إلى شبكة صفوف وأعمدة، فبدل 64 طرف تحتاج 8+8 = **16 طرفاً** فقط.

---

## 1. الفكرة الأساسية

```
        Col0   Col1   Col2
         │      │      │
Row0 ────●──────●──────●──── LED 0,1,2
         │      │      │
Row1 ────●──────●──────●──── LED 3,4,5
         │      │      │
Row2 ────●──────●──────●──── LED 6,7,8
```

- **3 صفوف + 3 أعمدة = 6 أطراف لـ 9 LEDs** (بدل 9 أطراف)
- 8×8 = 16 طرف لـ 64 LED
- 16×16 = 32 طرف لـ 256 LED

> 💡 لكنّ السرّ: لا نُضيء كل الـ LEDs دفعةً واحدة — بل **صفّاً واحداً في كل لحظة**.

---

## 2. تقنية "Persistence of Vision" (POV)

عين الإنسان لا تميّز ومضات أسرع من **~60 Hz**. لو غيّرنا الصف المُضاء أسرع من ذلك، يرى المُشاهد كأنّ كل الصفوف مُضاءة دائماً.

```
زمن
 t=0    Row0 ON, Cols (مضيء/مطفئ حسب النمط)
 t=1ms  Row0 OFF → Row1 ON, Cols
 t=2ms  Row1 OFF → Row2 ON, Cols
 t=3ms  Row2 OFF → Row0 ON …
```

- 3 صفوف × 1 ms لكل صف = إعادة عرض الإطار كل 3 ms = **333 Hz** ⇒ بعيد جداً عن الـ flicker
- 8 صفوف × 1 ms = 125 Hz ⇒ آمن
- 16 صفوف × 1 ms = 62.5 Hz ⇒ على الحدّ — قلّل الزمن

> 🎯 **القاعدة**: تردد العرض = 1 / (عدد الصفوف × زمن كل صف). اهدف لـ ≥ 100 Hz بأمان.

---

## 3. التوصيل الكهربائي

### الإصدار البسيط (Common Cathode)

```
           VCC
            │
           [R]   ← مقاومة 220Ω لكل عمود
            │
    ●───────●─── Col0
    │       │
   LED     LED
    │       │
   Row0   Row1   ← الصفوف تتصل بـ GPIO مباشرة
```

- **Row** = Output. عند `HIGH` يصبح الصف "نشطاً" (مصدر).
- **Col** = Output. عند `LOW` يكتمل المسار → LED يضيء.

### القاعدة:
- لإضاءة LED في الموقع `(row, col)`: ضع الصف `row = HIGH` والعمود `col = LOW`.
- بقيّة الصفوف والأعمدة: `Z` (high-impedance) أو معكوس.

---

## 4. كود 3×3 — نمط ثابت

نريد عرض الشكل **X**:

```
نمط[0] = 1 0 1
نمط[1] = 0 1 0
نمط[2] = 1 0 1
```

```c
// PC0..PC2 = صفوف (3 أطراف)
// PD0..PD2 = أعمدة (3 أطراف)

typedef unsigned int u32;

#define GPIOC_BASE  0x40011000
#define GPIOC_CFGLR (*(volatile u32*)(GPIOC_BASE + 0x00))
#define GPIOC_BSHR  (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR   (*(volatile u32*)(GPIOC_BASE + 0x14))

#define GPIOD_BASE  0x40011400
#define GPIOD_CFGLR (*(volatile u32*)(GPIOD_BASE + 0x00))
#define GPIOD_BSHR  (*(volatile u32*)(GPIOD_BASE + 0x10))
#define GPIOD_BCR   (*(volatile u32*)(GPIOD_BASE + 0x14))

// نمط الإطار: كل صف = 3 بِتات (أعلى 5 بِتات مُهمَلة)
const uint8_t frame[3] = {
    0b101,   // ⬛⬜⬛
    0b010,   // ⬜⬛⬜
    0b101    // ⬛⬜⬛
};

void matrix_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 5)  /* IOPDEN */;

    // PC0..PC2 = Output Push-Pull
    for (int p = 0; p <= 2; p++) {
        GPIOC_CFGLR &= ~(0xF << (4 * p));
        GPIOC_CFGLR |=  (0x3 << (4 * p));
    }
    // PD0..PD2 = Output Push-Pull
    for (int p = 0; p <= 2; p++) {
        GPIOD_CFGLR &= ~(0xF << (4 * p));
        GPIOD_CFGLR |=  (0x3 << (4 * p));
    }

    // ابدأ بكل شيء مطفأ: الصفوف LOW، الأعمدة HIGH
    GPIOC_BCR  = 0b111;
    GPIOD_BSHR = 0b111;
}

static uint8_t current_row = 0;

void matrix_scan_step(void) {
    // 1) أطفئ الصف السابق (BCR على كل بِتات الصف)
    GPIOC_BCR = 0b111;

    // 2) اضبط الأعمدة حسب نمط الصف الجديد (LOW = LED ON)
    uint8_t cols = frame[current_row];
    GPIOD_BSHR = (~cols & 0b111);  // BSHR = bits to set HIGH (= LED OFF)
    GPIOD_BCR  = (cols  & 0b111);  // BCR  = bits to set LOW  (= LED ON)

    // 3) شغّل الصف الجديد
    GPIOC_BSHR = (1 << current_row);

    // 4) جهّز للصف التالي في الـ tick القادم
    current_row = (current_row + 1) % 3;
}
```

---

## 5. ربط الـ Scan بالـ SysTick

```c
volatile uint32_t ticks = 0;

void SysTick_Handler(void) __attribute__((interrupt));
void SysTick_Handler(void) {
    STK_SR = 0;
    ticks++;
    matrix_scan_step();   // كل 1ms = 333Hz refresh
}

void systick_init(void) {
    STK_CTLR = 0;
    STK_CNT  = 0;
    STK_CMP  = 48000 - 1;   // 1ms @ 48MHz
    STK_CTLR = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);
    PFIC_IENR1 |= (1u << 12); /* SysTicK_IRQn = 12 */
}

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    matrix_init();
    systick_init();
    while (1) {
        __asm__ volatile ("wfi");   // نَم حتى الـ tick التالي
    }
}
```

---

## 6. Double Buffering — لتجنّب الـ tearing

عند تحديث الإطار من الـ main loop، إذا قاطع SysTick في منتصف الكتابة → الصفوف الأولى تعرض القديم والباقي تعرض الجديد → **tearing**.

الحلّ: نُسختان من الإطار.

```c
volatile uint8_t frame_front[3];   // ما يَعرضه الـ SysTick
volatile uint8_t frame_back[3];    // ما يكتبه الـ main loop
volatile uint8_t swap_request = 0;

void SysTick_Handler(void) __attribute__((interrupt));
void SysTick_Handler(void) {
    STK_SR = 0;

    // عند بدء إطار جديد (current_row == 0)، انتقل للجديد إذا طُلب
    if (current_row == 0 && swap_request) {
        for (int r = 0; r < 3; r++) frame_front[r] = frame_back[r];
        swap_request = 0;
    }
    matrix_scan_step_from(frame_front);
}

void matrix_show(const uint8_t *new_frame) {
    for (int r = 0; r < 3; r++) frame_back[r] = new_frame[r];
    swap_request = 1;
    // الـ swap يحدث في next tick — لا تعديل أثناء العرض
}
```

> 🧠 **القاعدة**: لا تعدّل ما يقرأه الـ ISR بدون آلية مزامنة. الـ double-buffer + flag = نمط شائع وآمن.

---

## 7. التحكّم بالسطوع (PWM ناعم)

تستطيع تخفيف الإضاءة عبر تشغيل LED لجزءٍ من زمن الصف فقط:

```c
// زمن الصف 1ms = 48000 cycles. اعرض LED لـ 50% منها فقط:
matrix_scan_step();
delay(24000 / 3);
GPIOD_BSHR = 0b111;   // أطفئ كل الأعمدة قبل انتهاء الـ tick
```

أو بشكل أنظف: SysTick بتردد أعلى (مثلاً 10kHz) + counter داخلي يحدّد متى يطفئ.

---

## 8. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|-------|
| كل الـ LEDs مُضاءة دائماً | لم تطفئ الصف السابق قبل تشغيل الجديد | `GPIOC_BCR = ...` أول شي |
| flicker مرئي | تردد المسح < 60 Hz | قلّل زمن كل صف أو قلّل عدد الصفوف |
| LEDs متقاطعة تشتعل (ghosting) | الـ pull-ups أو الـ leakage | استعمل push-pull وتأكّد من الأرضيات |
| سطوع غير متجانس | بعض الصفوف مدّتها أطول | استعمل SysTick منتظم لا Delay |
| الـ matrix تتلف بعد دقائق | تيار عالٍ على pin واحد | أضف مقاومات لكل عمود |
| tearing عند التحديث | تعديل الإطار أثناء الـ scan | استعمل double buffering |

---

## 9. حساب التيار — تحذير

كل GPIO على CH32V003 يستطيع أن **يُمتصّ/يصدّر** حتى **8 mA** (الحدّ الموصى به). على 3×3:

- صف واحد فعّال × 3 أعمدة × 5 mA (LED) = 15 mA على pin الصف. **خارج النطاق!**

**الحلّ**: استعمل **transistor** (مثل 2N2222) كمفتاح للصف، أو IC مدمج مثل **74HC595** أو **TPIC6B595** للأعمدة.

> 🔑 على شبكات 8×8 (8 LEDs لكل صف) **لا بدّ** من driver خارجي — لا تشغّل LEDs مباشرة من pins المتحكّم.

---

## 10. تمارين

1. **3×3 X-pattern**: نفّذ الكود أعلاه وتحقّق من ظهور X.
2. **Animation**: بدّل النمط كل ثانية بين X و O.
3. **Brightness control**: زر يقلّب السطوع (high/medium/low) عبر تعديل duty cycle.
4. **8×8 character display**: تخطيط 8 صفوف + 8 أعمدة، اعرض حرفاً من font 8×8.
5. **Scrolling text**: مرّر سلسلة `"SHAKIR"` أفقياً.

---

## 11. الخطوة التالية

في [الدرس 21: المشروع النهائي](/lessons/l21-final-project) ستركّب كل ما تعلّمته: Matrix + UART لتلقّي أوامر + Flash لحفظ آخر نمط + Watchdog للحماية.

---

## 📖 المراجع

- **bitluni/Mdot2Matrix** — أحد أنظف تطبيقات الـ multiplexing على CH32V003.
- *AVR Multiplexing Tutorial* (Sparkfun) — المفهوم العام، قابل للنقل لأي MCU.
- *TPIC6B595 datasheet* — الـ driver المُفضّل للأعمدة على matrices كبيرة.
