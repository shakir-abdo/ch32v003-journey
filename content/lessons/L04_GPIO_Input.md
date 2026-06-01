---
order: 4
slug: "l04-gpio-input"
title: "GPIO كـ Input — الأزرار و EXTI"
title_en: "GPIO Input + EXTI"
icon: "i-lucide-square-mouse-pointer"
track: "io"
level: "beginner"
minutes: 30
tags: ["gpio", "button", "exti"]
---

# الدرس 04: GPIO كـ Input — قراءة الأزرار

> **المرجع:** CH32V003 Reference Manual v1.9
> - الفصل 7 (GPIO and Alternate Function) — صفحات 50–58
> - الفصل 8 (EXTI) داخل PFIC — صفحات 33–34
>
> **العتاد المطلوب:** CH32V003J4M6 + LED على PC1 + زر ضغط (push-button) + سلكين.

---

## 📋 تعريفات السجلات لهذا الدرس

انسخ هذا البلوك إلى رأس `main.c` قبل تشغيل أيّ مثال من هذا الدرس. الأمثلة في الأسفل تفترض أنّ هذه التعريفات موجودة.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_APB2PCENR   (*(volatile u32*)(RCC_BASE + 0x18))

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_CFGLR     (*(volatile u32*)(GPIOC_BASE + 0x00))
#define GPIOC_OUTDR     (*(volatile u32*)(GPIOC_BASE + 0x0C))
#define GPIOC_INDR      (*(volatile u32*)(GPIOC_BASE + 0x08))
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── AFIO ──────────────────────────────────────────────
#define AFIO_BASE    0x40010000
#define AFIO_EXTICR     (*(volatile u32*)(AFIO_BASE + 0x08))

// ── EXTI ──────────────────────────────────────────────
#define EXTI_BASE    0x40010400
#define EXTI_INTENR     (*(volatile u32*)(EXTI_BASE + 0x00))
#define EXTI_RTENR      (*(volatile u32*)(EXTI_BASE + 0x08))
#define EXTI_FTENR      (*(volatile u32*)(EXTI_BASE + 0x0C))
#define EXTI_INTFR      (*(volatile u32*)(EXTI_BASE + 0x14))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// تأخير busy-loop بسيط (يكفي للأمثلة الأساسية)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 جميع العناوين مستخرجة من *CH32V003 RM v1.9*، الفصل الخاصّ بكل peripheral. الجدول مرتّب بترتيب الاستخدام في الدرس.

---


## 0. تذكير سريع (لمن نسي ما الـ register أصلاً)

> 💡 **إذا كانت هذه أول مرة تقرأ عن bare-metal، اقرأ هذا الجزء بهدوء. هو الأساس.**

الـ **Register** هو "صندوق" بحجم 32 بت موجود داخل الشريحة، له **عنوان رقمي** (مثل `0x40011008`). عندما تكتب في هذا العنوان… الشريحة **تتفاعل عتادياً** (مثلاً تشغّل LED، أو تقرأ زر).

في الشريحة `CH32V003`:

```
العنوان              النوع
────────────         ───────────────────
0x20000000+          ذاكرة RAM (للمتغيرات)
0x00000000+          ذاكرة Flash (للكود)
0x40000000+          سجلات الأطراف (registers!) ← هذا ما يهمنا
```

> 📖 *RM, الفصل 1.2 "Memory Image" — صفحة 2-3.*

**الفكرة الذهبية**: الكتابة على `0x40011008` لا تخزّن قيمة كأنها متغير، بل **ترسل أمراً للعتاد**. الـ CPU لا يفرق، لكن الـ bus داخل الشريحة يميّز ويحوّل الإشارة إلى Peripheral.

---

## 1. ماذا سنتعلم في هذا الدرس؟

في الدرس 2، شغّلنا LED (إخراج). الآن نقلب الاتجاه: **نقرأ** حالة طرف لمعرفة إذا كان الزر مضغوطاً.

سنتعلم:

1. **أنواع الـ Input الأربعة** المتاحة في الشريحة.
2. **Pull-up و Pull-down الداخلية** — مقاومات بداخل الشريحة، لا تحتاج خارجية.
3. **الفرق بين Polling و Interrupt**.
4. **Debouncing** — لماذا الضغطة الواحدة تظهر كعدة ضغطات وكيف تحلها.
5. **EXTI** — جعل الزر "ينبّه" الـ CPU بدل أن يسأل عنه باستمرار.

---

## 2. الخلفية النظرية: كيف يقرأ المتحكّم الجهد؟

داخل الشريحة، كل طرف (pin) متصل بدائرة اسمها **Schmitt Trigger**. هذه الدائرة تأخذ الجهد التماثلي (Analog) وتحوّله إلى 0 أو 1:

- الجهد قريب من 0V → الـ Schmitt يقول `0` (LOW).
- الجهد قريب من VDD (3.3V) → الـ Schmitt يقول `1` (HIGH).

ثم تُخزَّن هذه القيمة في سجل اسمه `INDR` (Input Data Register). نقرأ هذا السجل لنعرف حالة الطرف.

> 📖 *RM, الفصل 7.2.6 "Input Configuration" — صفحة 51.*

---

## 3. لماذا نحتاج Pull-up؟ (المشكلة الفيزيائية)

تخيّل زراً موصولاً بطرف PC2:

```
                   ?
   PC2 ─────────●──────●  ← الزر
                       │
                      ─┴─ GND
```

عندما الزر **مفتوح** (غير مضغوط)، الـ pin غير موصول بشيء (مثل سلك معلّق في الهواء). الجهد عليه عشوائي — قد يكون 0V، قد يكون 1.5V، قد يتذبذب. هذا اسمه **"Floating"** والقراءة منه فوضى.

### الحلّ: Pull-up Resistor

نضع مقاومة بين الـ pin و VDD:

```
       VDD (3.3V)
        │
        ⟗ Pull-up Resistor (داخلية ~40 kΩ)
        │
   PC2 ─●────────●──────●  زر
                        │
                       ─┴─ GND
```

- زر **مفتوح**: المقاومة ترفع PC2 إلى 3.3V → `INDR` يقرأ `1`.
- زر **مضغوط**: الزر يصل PC2 مباشرة إلى GND → `INDR` يقرأ `0`.

**هذا يسمى Active-Low**: الضغط = `0`.

### الخبر السار

CH32V003 يحتوي على **Pull-up و Pull-down داخلية** يمكن تفعيلها برمجياً، بدون أي عتاد خارجي. توفّر عليك مقاومة وسلكاً.

---

## 4. السجلات التي سنستخدمها

| السجل | العنوان | الوصف | المرجع في RM |
|-------|---------|--------|---------------|
| `RCC_APB2PCENR` | `0x40021018` | تفعيل ساعة GPIO وAFIO | §3.4.7, ص.21 |
| `GPIOC_CFGLR` | `0x40011000` | إعدادات أطراف PC0..PC7 (CNF + MODE) | §7.3.1, ص.56 |
| `GPIOC_INDR` | `0x40011008` | قراءة حالة الأطراف | §7.3.1, ص.57 |
| `GPIOC_OUTDR` | `0x4001100C` | كتابة الأطراف (هنا نستخدمه لاختيار Pull-up أو Pull-down) | §7.3.1, ص.57 |
| `AFIO_EXTICR` | `0x40010008` | اختيار أي Port مصدر لكل خط EXTI | §7.3.2, ص.58 |
| `EXTI_INTENR` | `0x40010400` | تفعيل المقاطعة لكل خط | §6.5.1, ص.34 |
| `EXTI_RTENR` | `0x40010408` | اشتعال المقاطعة عند الحافة الصاعدة | §6.5.1, ص.34 |
| `EXTI_FTENR` | `0x4001040C` | اشتعال المقاطعة عند الحافة الهابطة | §6.5.1, ص.34 |
| `EXTI_INTFR` | `0x40010414` | علم المقاطعة (يُمسح بكتابة 1) | §6.5.1, ص.34 |

> ⚠️ الأسماء `GPIOC_CFGLR`, `EXTI_INTENR` التي نستعملها هي **#define**ات نُعرّفها بأنفسنا في رأس كل مثال (انظر نمط L03). كل اسم يُترجم إلى `*(volatile u32*)(BASE + offset)`.

---

## 5. تشريح حقل CFG لـ Input (الجزء الأهم)

كل طرف يأخذ **4 بتات** في `CFGLR`:

```
bit 3  bit 2 │ bit 1   bit 0
─────────────┼─────────────
   CNF[1:0]  │   MODE[1:0]
```

### القاعدة:

| MODE | المعنى |
|------|--------|
| `00` | **Input** (هذا ما نريد!) |
| `01` | Output 10 MHz |
| `10` | Output 2 MHz |
| `11` | Output 50 MHz |

### عندما MODE=00 (Input)، حقل CNF يحدّد نوع المدخل:

| CNF | الاسم | معناه |
|-----|-------|--------|
| `00` | Analog | الـ pin مفصول عن Schmitt — للـ ADC فقط |
| `01` | Floating Input | بلا مقاومة داخلية — يتطلب مصدر خارجي |
| `10` | **Input with Pull-up/down** | المقاومة الداخلية مفعّلة ✅ |
| `11` | محجوز — لا تستخدم |

> 📖 *RM, الجدول 7-2 — صفحة 51.*

### القيمة 4-بت لاختيار Pull-up Input:

```
 CNF=10   MODE=00

 10  ‖  00     →  0b1000  =  0x8
```

### اختيار Pull-up أم Pull-down؟

عند `CNF=10`، حقل `OUTDR` للـ pin نفسه يحدّد الاتجاه:

- `OUTDR = 1` → Pull-**Up** (شائع للأزرار)
- `OUTDR = 0` → Pull-**Down**

> 📖 *RM, الجدول 7-3 — صفحة 51.*

---

## 6. شرح العمليات الـ Bitwise خطوة بخطوة 🧮

> **هذا الفصل مخصّص لفهم كل سطر bitwise قبل أن نضعه في الكود.**

سنضع الآن PC2 (الطرف رقم 2 في Port C) في وضع Input Pull-Up.

### العملية 1: تنظيف الـ 4 بتات الخاصة بـ PC2

**الكود**:
```c
GPIOC_CFGLR &= ~(0xF << (4 * 2));
```

**ماذا يحدث خطوة خطوة**:

1. `4 * 2 = 8` (لأن PC2 يبدأ من البت 8 في `CFGLR`).
2. `0xF` = `0b1111` = أربع بتات شغّالة.
3. `0xF << 8` = `0b1111_00000000` = القناع الذي يستهدف بتات 8-11 فقط:

   ```
   bit:  31 ... 12 11 10  9  8  7 ... 0
   mask:  0      0  1  1  1  1  0     0
   ```

4. `~(0xF << 8)` = نعكس القناع، فيصبح كل شيء `1` ماعدا بتات 8-11:

   ```
   bit:  31 ... 12 11 10  9  8  7 ... 0
   mask:  1      1  0  0  0  0  1     1
   ```

5. `CFGLR &= ...` = نطبّق AND. كل بت `& 1` = نفسه، لكن البتات 8-11 `& 0` = `0`.

**النتيجة**: بتات PC2 صارت `0000`، والبقية لم تتغير.

---

### العملية 2: كتابة Input Pull-Up/Down في PC2

**الكود**:
```c
GPIOC_CFGLR |= (0x8 << (4 * 2));
```

**ماذا يحدث**:

1. `0x8` = `0b1000` = CNF=10، MODE=00.
2. `0x8 << 8` = `0b1000_00000000` = نضع القيمة في موقع بتات PC2:

   ```
   bit:  31 ... 12 11 10  9  8 ...
   val:   0      0  1  0  0  0
   ```

3. `CFGLR |= ...` = OR. البتات 0-7 و12-31 لم تتغير، لكن البتات 8-11 صارت `1000`.

**النتيجة النهائية لبتات PC2**: `CNF=10, MODE=00` → Input مع Pull-up/down.

---

### العملية 3: اختيار Pull-Up (وليس Pull-Down)

**الكود**:
```c
GPIOC_OUTDR |= (1 << 2);
```

**ماذا يحدث**:

1. `1 << 2` = `0b0000_0100` — قناع للبت 2 فقط.
2. `OUTDR |= ...` = نضع البت 2 = `1` (Pull-up).

**ملاحظة**: إذا أردنا Pull-down: `GPIOC_OUTDR &= ~(1 << 2);`

---

### العملية 4: قراءة الزر

**الكود**:
```c
int pressed = (GPIOC_INDR & (1 << 2)) == 0;
```

**ماذا يحدث**:

1. `(1 << 2)` = `0b0000_0100` — قناع للبت 2.
2. `GPIOC_INDR & 0b0100` = يستخرج **فقط** بت PC2 من السجل. إما `0` أو `4`.
3. `== 0` → إذا البت 0 (زر مضغوط Active-Low)، النتيجة `true`. وإلا `false`.

> 🧠 **الفهم العميق**: `(REG & mask) == 0` تعني "بت معيّن مطفأ". `(REG & mask) != 0` تعني "بت معيّن مشتعل".

---

## 7. الكود الكامل — Polling

```c
#define BTN_PIN   2     // الزر على PC2
#define LED_PIN   1     // LED على PC1

void gpio_init(void) {
    // 1) تفعيل ساعة GPIOC
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */;

    // 2) PC2 = Input with Pull-Up
    GPIOC_CFGLR &= ~(0xF << (4 * BTN_PIN));    // امسح
    GPIOC_CFGLR |=  (0x8 << (4 * BTN_PIN));    // CNF=10, MODE=00
    GPIOC_OUTDR |=  (1   <<       BTN_PIN);    // اختر Pull-Up

    // 3) PC1 = Output Push-Pull 50 MHz
    GPIOC_CFGLR &= ~(0xF << (4 * LED_PIN));
    GPIOC_CFGLR |=  (0x3 << (4 * LED_PIN));    // CNF=00, MODE=11
}

static inline int button_pressed(void) {
    return (GPIOC_INDR & (1 << BTN_PIN)) == 0;
}

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    gpio_init();

    while (1) {
        if (button_pressed())
            GPIOC_BSHR = (1 << LED_PIN);   // LED ON
        else
            GPIOC_BCR  = (1 << LED_PIN);   // LED OFF
    }
}
```

---

## 8. مشكلة Debouncing (الزر يخدعنا)

عندما تضغط زراً، المعدنان داخله يلامسان بعضهما، لكن بسبب الاهتزاز الميكانيكي، الإشارة تتأرجح:

```
الجهد على PC2:
HIGH  ─┐         ┌──┐ ┌─┐ ┌──┐
       │         │  │ │ │ │
LOW    └─────────┘  └─┘ └─┘ ← ضوضاء
       ↑                    ↑
      ضغطت               استقرت
```

النتيجة: الكود يعدّ 5-10 ضغطات بدل واحدة.

### الحلّ السريع (Delay)

```c
if (button_pressed()) {
    delay(20 * 8000);              // انتظر 20ms
    if (button_pressed())      // تأكد ثانية
        do_action();
}
```

عيب: يوقف الـ CPU 20ms.

### الحلّ الذكي (Time-based في SysTick — انتظر الدرس 5)

```c
extern volatile uint32_t ticks_ms;  // من SysTick
uint32_t last_press = 0;

if (button_pressed() && (ticks_ms - last_press) > 30) {
    last_press = ticks_ms;
    do_action();
}
```

---

## 9. EXTI — اجعل الزر يوقظ الـ CPU

بدل أن يسأل الـ CPU عن الزر آلاف المرات في الثانية، نقول له: "نَم! وأيقظتك العتاد إذا ضُغط الزر."

### معمارية EXTI في CH32V003

8 خطوط EXTI (Line 0..7). كل خط مرتبط بـ pin معيّن في كل Port:

- Line 0: PA0 أو PC0 أو PD0 (تختار واحداً عبر `AFIO_EXTICR`).
- Line 2: PA2 أو PC2 أو PD2 (نفس القاعدة).
- ...إلخ.

> 📖 *RM, الفصل 6.4 — صفحة 33.*

### اختيار Port C لـ Line 2

`AFIO_EXTICR` سجل 32-بت يخصّص بتَّين لكل من الخطوط الثمانية:

| البتات | الخط | القيم |
|---------|------|-------|
| 1:0 | Line 0 | `00`=PA, `10`=PC, `11`=PD |
| 3:2 | Line 1 | نفس القيم |
| 5:4 | Line 2 | نفس القيم |
| ... | ... | ... |

> 📖 *RM, §7.3.2.5 "AFIO_EXTICR" — صفحة 58.*

### العمليات Bitwise لـ EXTICR

**نريد**: بتات [5:4] = `10` (PC) لـ Line 2.

```c
AFIO_EXTICR = (AFIO_EXTICR & ~(0x3 << (2 * 2)))    // امسح بتات [5:4]
             | (0x2 << (2 * 2));                      // اكتب 10 = PC
```

**خطوة خطوة**:
1. `2 * 2 = 4` (موقع Line 2).
2. `0x3 << 4` = `0b0011_0000` — قناع للبتَّين [5:4].
3. `~(0x3 << 4)` = `0b…_1100_1111`.
4. AND ينظّفهما.
5. `0x2 << 4` = `0b0010_0000` — قيمة `10` في الموقع.
6. OR يكتبها.

---

## 10. الكود الكامل — EXTI

```c
#define BTN_PIN  2
#define LED_PIN  1

void exti_init(void) {
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */ | (1u << 0)  /* AFIOEN */;

    // PC2 = Input Pull-Up
    GPIOC_CFGLR &= ~(0xF << (4 * BTN_PIN));
    GPIOC_CFGLR |=  (0x8 << (4 * BTN_PIN));
    GPIOC_OUTDR |=  (1   <<       BTN_PIN);

    // PC1 = Output (LED)
    GPIOC_CFGLR &= ~(0xF << (4 * LED_PIN));
    GPIOC_CFGLR |=  (0x3 << (4 * LED_PIN));

    // اختر PC كمصدر EXTI Line 2
    AFIO_EXTICR = (AFIO_EXTICR & ~(0x3 << (2 * BTN_PIN)))
                 | (0x2 << (2 * BTN_PIN));

    // فعّل المقاطعة + الحافة الهابطة (Active-Low: الحدث عند الضغط)
    EXTI_INTENR |= (1 << BTN_PIN);
    EXTI_FTENR  |= (1 << BTN_PIN);
    EXTI_RTENR  &= ~(1 << BTN_PIN);

    // فعّل القناة في PFIC
    PFIC_IENR1 |= (1u << 20); /* EXTI7_0_IRQn = 20 */
}

__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    if (EXTI_INTFR & (1 << BTN_PIN)) {
        EXTI_INTFR = (1 << BTN_PIN);     // مسح العلم (write 1 to clear!)
        GPIOC_OUTDR ^= (1 << LED_PIN);   // toggle LED
    }
}

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    exti_init();
    while (1) {
        __asm__ volatile ("wfi");   // نَم حتى المقاطعة
    }
}
```

> 🔑 **ملاحظة عتادية**: في `CH32V003` كل خطوط EXTI 0..7 تشترك في معالج واحد اسمه `EXTI7_0_IRQHandler`. لذلك نقرأ `INTFR` لمعرفة أي خط فعلاً اشتعل.

---

## 11. مسح علم EXTI — لماذا "write 1 to clear"؟

في معظم الـ peripherals، نمسح علماً بكتابة `0`. لكن في EXTI الـ INTFR من نوع **`rc_w1`** (Read, Clear by Writing 1). السبب: تصميم آمن للمقاطعات حيث لا يمكن مسح علم آخر بالخطأ.

```c
EXTI_INTFR = (1 << 2);    // ✅ يمسح العلم لـ Line 2 فقط
EXTI_INTFR &= ~(1 << 2);  // ❌ لا يفعل شيئاً!
```

> 💀 **الفخ الميت**: إذا نسيت المسح، المقاطعة تعيد إطلاق نفسها بلا توقف → النظام يتعلّق.

---

## 12. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| القراءة عشوائية بدون ضغط | Floating (CNF=01) | استخدم `CNF=10` + `OUTDR=1` |
| المقاطعة تشتعل بلا توقف | لم تمسح INTFR | `EXTI_INTFR = (1<<N)` |
| الزر مضغوط لكن `INDR=1` | اخترت Pull-Down بينما الزر إلى GND | `OUTDR |= (1<<N)` (pull-up) |
| ضغطة واحدة = 5 مقاطعات | لا debouncing | استخدم time-based في ISR |
| المقاطعة لا تشتعل أصلاً | نسيت `(1u << 0)  /* AFIOEN */` | فعّل ساعة AFIO |
| تعمل على PC2 لكن PA2 لا | EXTICR لا يزال على PC | اضبط الخط 2 إلى `00` لـ PA |

---

## 13. تمارين

1. **Toggle LED بضغطة EXTI**: تأكد من debouncing.
2. **عداد ضغطات**: اعرض عدد الضغطات على 3 LEDs (binary 0..7).
3. **Long press**: إذا الزر مضغوط أكثر من 1 ثانية، نفّذ سلوكاً مختلفاً.
4. **زرَّان**: PC2 و PD3 — كلاهما EXTI. كيف تميّز أيهما اشتعل في نفس المعالج؟
5. **مدمج**: زر يبدأ LED يومض، وضغطة ثانية يوقفه. (state machine).

---

## 📖 المراجع (مع أرقام الصفحات)

- **CH32V003 RM v1.9**:
  - الفصل 7.2.6 "Input Configuration" — صفحة 51
  - الجداول 7-2 و 7-3 (CNF/MODE encoding) — صفحة 51
  - الفصل 7.3.1 (GPIO Registers) — صفحات 56-57
  - الفصل 7.3.2.5 (AFIO_EXTICR) — صفحة 58
  - الفصل 6.4 "EXTI" — صفحة 33
  - الفصل 6.5.1 (EXTI Registers: INTENR/FTENR/RTENR/INTFR) — صفحة 34

