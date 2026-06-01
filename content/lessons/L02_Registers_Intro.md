---
order: 2
slug: "l02-registers-intro"
title: "الـ Registers و Bit Operations"
title_en: "Registers Intro"
icon: "i-lucide-cpu"
track: "foundation"
level: "beginner"
minutes: 20
tags: ["registers", "mmio"]
---

# الدرس 02: الـ Registers و Bit Operations (الأساسيات)

> **النسخة المراجَعة** | تم تدقيق العناوين والـ offsets على Reference Manual v1.9.

---

## ١. ما هو الـ Register أصلاً؟

تخيّل المتحكّم وكأنه حاسوبٌ بالغُ الصِّغَر — وكأيّ حاسوب، له ذاكرة (RAM).

لكنّ هنا مفاجأة لطيفة 🎁:

في الحاسوب العادي، كل عناوين الذاكرة هي RAM فحسب. أمّا في المتحكّم، فبعض العناوين ليست ذاكرةً على الإطلاق — إنّها **أزرار تحكّمٍ بالعتاد**:

| العنوان | في الكمبيوتر العادي | في `CH32V003` |
|---------|--------------------|------------------|
| `0x20000000` | RAM عادية | بداية الـ RAM (2 KB) |
| `0x40011000` | RAM عادية | بداية سجلات `GPIOC` 😱 |
| `0x4001100C` | RAM عادية | `GPIOC_OUTDR` — قيمة الـ pins |
| `0x40011010` | RAM عادية | `GPIOC_BSHR` — Set/Reset ذرّي |

إذن في المتحكّم، بعضُ عناوين الذاكرة ليست ذاكرةً — **إنّها أزرار تحكّمٍ بالعتاد!** 🎛

اكتب قيمةً في عنوانٍ معيّن → يضيء الـ LED. اكتب في عنوانٍ آخر → يَنطفئ.

هذه العناوين الخاصّة نُسمّيها **Registers** (سجلّات).

> 💡 **مصطلح**: هذا النوع من العنونة يُسمى **Memory-Mapped I/O (MMIO)**. الـ CPU لا يميّز بين RAM و register — يكتب لعنوان، والـ bus decoder هو الذي يقرر يدخل على RAM أو على peripheral.

---

## ٢. التشبيه بـ REST API (لأصحاب الـ Web Dev)

تخيّل إن المتحكّم عنده REST API داخلي:

```js
// POST /gpioc/bshr — يشغّل pin
await fetch('0x40011010', { method: 'POST', body: 0b0010 });
// PC1 → صار HIGH!

// POST /gpioc/bcr — يطفّي pin
await fetch('0x40011014', { method: 'POST', body: 0b0010 });
// PC1 → صار LOW!
```

لكن بدل HTTP… تستخدم الذاكرة مباشرة. تكتب في عنوان… والأجهزة تتفاعل!

> 🔑 الفرق: في الـ REST API لازم network round-trip (ميلي ثوانٍ). هنا الكتابة تأخذ **دورة ساعة واحدة** (~20 نانوثانية على 48 MHz).

---

## ٣. لماذا نكتب `GPIOC->BSHR` بدل `0x40011010`؟

لأن لا أحد يريد أن يحفظ أرقام! 🫠

ملفات WCH الرسمية تعرّف لنا `structs` جاهزة:

```c
// هذه الـ struct موجودة في ملفات WCH:
typedef struct {
    volatile uint32_t CFGLR;    // 0x00 — إعدادات الـ pins
    volatile uint32_t CFGHR;    // 0x04 — إعدادات الـ pins الثانية (غير مستخدمة على CH32V003)
    volatile uint32_t INDR;     // 0x08 — قراءة الـ pins
    volatile uint32_t OUTDR;    // 0x0C — كتابة الـ pins
    volatile uint32_t BSHR;     // 0x10 — تشغيل pins (ذرّي)
    volatile uint32_t BCR;      // 0x14 — إطفاء pins (ذرّي)
    volatile uint32_t LCKR;     // 0x18 — قفل الإعدادات
} GPIO_TypeDef;

// ثمّ يعرّفون pointer جاهز:
#define GPIOC    ((GPIO_TypeDef *)0x40011000)
```

فلما تكتب:

```c
GPIOC->BSHR = (1 << 1);
```

هو نفس الشيء بالضبط:

```c
*(volatile uint32_t *)0x40011010 = (1 << 1);
```

لكنّ `GPIOC->BSHR` أسهل وأوضح! ✨

> 💡 **لماذا `volatile` مهم؟** بدون `volatile` المُترجم (compiler) قد يحذف القراءة/الكتابة لأنها "تبدو بلا فائدة". مع `volatile` يجبره أن ينفذ كل عملية بالضبط كما كُتبت.

---

## ٤. كل Peripheral له ساعة… RCC (الطبلون)

**RCC = Reset and Clock Control**

تخيّل الـ RCC كأنه طبلون كهرباء البيت:

| Peripheral | الحالة |
|------------|--------|
| `GPIOA`    | ⚡ ON  |
| `GPIOC`    | ⚡ ON  |
| `USART1`   | ⚡ ON  |
| `SPI1`     | ❌ OFF |
| `TIM1`     | ⚡ ON  |

إذا لم تُشغِّل المفتاح الخاصّ بالغرفة… النور لا يعمل! وكذلك في المتحكّم… إذا لم تُشغِّل البت الخاصّ بـ `GPIOC` في سجل `APB2PCENR`… الـ pins لا تعمل!

### سجل APB2PCENR (تخطيط البتات في CH32V003)

| البت | الـ Peripheral |
|------|----------------|
| 0 | AFIO |
| 2 | IOPAEN (GPIOA) |
| 4 | **IOPCEN (GPIOC)** |
| 5 | IOPDEN (GPIOD) |
| 9 | ADC1EN |
| 11 | TIM1EN |
| 12 | SPI1EN |
| 14 | USART1EN |

> 🎯 **بت رقم 4 = IOPCEN = PC port clock enable**.

```c
// تفعيل GPIOC:
RCC->APB2PCENR |= (1 << 4);
// أو الأنظف:
RCC->APB2PCENR |= RCC_APB2Periph_GPIOC;
```

---

## ٥. GPIO Registers

| السجل | فك الاختصار | معناه |
|------|-------------|--------|
| `CFGLR` | **C**on**F**i**G**uration **L**ow **R**egister | إعدادات أول 8 pins (PC0–PC7) |
| `CFGHR` | **C**on**F**i**G**uration **H**igh **R**egister | إعدادات بقية الـ pins (غير مستخدمة على CH32V003) |
| `BSHR` | **B**it **S**et/Reset / **H**igh **R**egister | يشغّل pin لحظياً (ذرّي) |
| `BCR` | **B**it **C**lear **R**egister | يطفّي pin لحظياً (ذرّي) |
| `OUTDR` | **OUT**put **D**ata **R**egister | قيمة الـ pins الحالية للكتابة |
| `INDR` | **IN**put **D**ata **R**egister | قراءة الـ pins |

### CFGLR — كل pin له 4 bits إعدادات

```
PC0 = bits  0-3       PC4 = bits 16-19
PC1 = bits  4-7       PC5 = bits 20-23
PC2 = bits  8-11      PC6 = bits 24-27
PC3 = bits 12-15      PC7 = bits 28-31
```

---

## ٦. Bit Operations — رموز العمليات على البتات

### `<<` و `>>` — إزاحة البتات (Bit Shift)

```c
1 << 0  =  1    (0001)
1 << 1  =  2    (0010)
1 << 2  =  4    (0100)
1 << 3  =  8    (1000)
1 << 4  = 16    (0001 0000)
```

> 🎯 **القراءة الصحيحة**: `1 << N` يعني "خذ الرقم 1، وحرّكه N خانة لليسار" → النتيجة: قناع (mask) فيه بت واحد فقط شغّال هو البت رقم N.

### `|` (OR) و `|=` — أضف دون أن تمسح الباقي

```
  0001 0000  (GPIOC)
| 0000 0100  (GPIOA)
= 0001 0100  ← الاثنين مع بعض!
```

```c
// ❌ خطأ — يمسح كل شيء:
RCC->APB2PCENR = RCC_APB2Periph_GPIOC;

// ✅ صحيح — يضيف للقائمة:
RCC->APB2PCENR |= RCC_APB2Periph_GPIOC;
```

> 🧠 القاعدة الذهبية: `x |= y` ≡ `x = x | y` ≡ "خذ القديم + أضف عليه".

### `&` (AND) و `&= ~` — امسح المحدد واحتفظ بالباقي

```
~ = NOT = يقلب كل البتات:
~0b00001111 = 0b11110000
```

```c
GPIOC->CFGLR &= ~(0xF << (4 * 1));
//                 ↑       ↑
//                 │       │
//                 │       └─ انقلهم لموقع PC1 (يبدأ من بت 4)
//                 └────── 0xF = 0b1111 = 4 بتات
// ~(...) = اقلبهم
// &=     = امسح PC1 فقط (تبقى البقية كما هي)
```

> 🧠 القاعدة الذهبية: `x &= ~y` ≡ "خذ القديم - احذف منه `y`".

### `^` (XOR) و `^=` — اقلب الحالة (Toggle)

```c
GPIOC->OUTDR ^= (1 << 1);   // إذا كان PC1=1 يصير 0، والعكس
```

> ⚠️ **تحذير**: التطبيق على `OUTDR` غير ذرّي (read-modify-write). للـ toggle الذرّي، استخدم `BSHR` و `BCR` بحالة معروفة.

---

## ٧. الخلاصة — جدول الرموز

| الرمز | ماذا يفعل؟ | مثال | المعنى |
|-------|-----------|------|--------|
| `(1 << N)` | يجعل البت N = 1 | `(1 << 4) = 16` | "شغّل البت رقم N فقط" |
| `x \|= y` | أضف `y` على `x` | `a \|= 0b0100` | شغّل البتات… والباقي كما هو |
| `x &= ~y` | امسح `y` من `x` | `a &= ~0b0100` | امسح البتات… والباقي كما هو |
| `x ^= y` | اقلب بتات `y` في `x` | `a ^= 0b0100` | toggle (غير ذرّي) |
| `0xF` | الرقم 15 (4 بتات كلها 1) | `= 0b1111` | اختصار سداسي عشر |
| `0xFF` | 8 بتات كلها 1 | `= 255` | byte كامل |

---

## ٨. الكود العملي — Task 1.1: Blink LED

```c
#include "ch32v003fun.h"

int main(void) {
    SystemInit();

    // 1. شغّل طبلون GPIOC
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC;

    // 2. اضبط PC1 = output push-pull 50MHz
    GPIOC->CFGLR &= ~(0xF << (4 * 1));     // امسح PC1
    GPIOC->CFGLR |=  (0b0011 << (4 * 1));  // 50MHz push-pull

    while (1) {
        GPIOC->BSHR = (1 << 1);     // شغّل PC1
        Delay_Ms(500);
        GPIOC->BCR  = (1 << 1);     // طفّي PC1
        Delay_Ms(500);
    }
}
```

---

## ٩. أسئلة الفهم

1. إذا أردتَ تشغيل LED على PC4 بدل PC1… ما الأرقام التي ستتغير في الكود؟
   - تلميح: 3 أرقام تتغير (في `CFGLR` مرتين، وفي `BSHR`/`BCR`).
2. لماذا استخدمنا `|=` مع `APB2PCENR` وليس `=` فقط؟
3. لماذا `CFGLR` نمسحه أولاً بـ `&= ~(…)` ثمّ نكتب بـ `|=`؟
4. ما الفرق بين `BSHR = (1<<1)` و `OUTDR |= (1<<1)`؟ متى يهم؟ (Hint: interrupts).
5. إذا كتبنا `GPIOC->BSHR = (1<<1) | (1<<17);` — ماذا يحدث؟ (نفس الـ pin يطلب SET و RESET).

---

## 📖 المصادر

- *CH32V003 Reference Manual* — الفصل 3 (RCC) + الفصل 7 (GPIO).
- *CH32V003 Datasheet* — من موقع WCH.
- *Mdot2Matrix* — https://github.com/bitluni/Mdot2Matrix
