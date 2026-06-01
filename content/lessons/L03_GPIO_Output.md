---
order: 3
slug: "l03-gpio-output"
title: "GPIO كـ Output — Blinky الأول"
title_en: "GPIO Output (Blinky)"
icon: "i-lucide-lightbulb"
track: "foundation"
level: "beginner"
minutes: 20
tags: ["gpio", "blinky"]
---

# الدرس 03: GPIO كـ Output — مشروع Blinky الأول

> **النسخة المراجَعة** | كل المراجع إلى Reference Manual v1.9 الفصل 7 (GPIO).
> تصحيحات: شرح حقل CFGLR كاملاً (CNF + MODE)، إيضاح أن MODE=`0b11` (50MHz) هو الأكثر استخداماً، وتنبيه على أهمية تفعيل الساعة قبل أي شيء.

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
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// تأخير busy-loop بسيط (يكفي للأمثلة الأساسية)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 جميع العناوين مستخرجة من *CH32V003 RM v1.9*، الفصل الخاصّ بكل peripheral. الجدول مرتّب بترتيب الاستخدام في الدرس.

---


## مقدمة

يُغطّي هذا الدرسُ الخطوات الأساسية لتهيئة طرف إدخال/إخراج عام (GPIO) كـ **مخرج (Output)**. المشروع التطبيقي هو التحكم في الـ LED المدمج على الشريحة — مشروع "Blinky" الشهير.

> 🎯 **بعد أن تُتمّ هذه المرحلة ستفهم:** لماذا كل طرف يحتاج 4 بتات في `CFGLR`، الفرق بين `BSHR/BCR` و `OUTDR`، ومتى تختار `push-pull` مقابل `open-drain`.

---

## المشروع: وميض الـ LED على PC1

في معظم بوردات تطوير `CH32V003J4M6` (SO8) الـ LED المدمج موصول على **PC1** (Pin 6 على الـ package).

### الخطوات الثلاث

| # | الخطوة | السجل |
|---|---------|--------|
| 1 | تفعيل ساعة Port C | `RCC_APB2PCENR` |
| 2 | تهيئة PC1 كـ Output Push-Pull | `GPIOC_CFGLR` |
| 3 | التحكم بالحالة (HIGH/LOW) | `GPIOC_BSHR` / `GPIOC_BCR` |

---

## الخطوة 1 — تفعيل الساعة للـ Port

### لماذا؟

لتوفير الطاقة، كل طرف (Peripheral) في الشريحة **معطّل افتراضياً**. يعمل فقط الـ CPU + Flash + RAM. أي طرف آخر يحتاج تفعيل ساعته يدوياً.

### السجل المسؤول

`RCC_APB2PCENR` (APB2 Peripheral Clock Enable Register) — جميع أطراف APB2 تُفعَّل من هنا.

```c
// تعريف السجل (مرّة واحدة في رأس الملف):
typedef unsigned int u32;
#define RCC_BASE      0x40021000
#define RCC_APB2PCENR (*(volatile u32*)(RCC_BASE + 0x18))
#define RCC_IOPCEN    (1u << 4)   // بت 4 = تفعيل ساعة GPIOC

// تفعيل ساعة GPIOC:
RCC_APB2PCENR |= RCC_IOPCEN;
```

> 💡 لاحظ: نحن نُعرّف السجل كمؤشّر إلى `volatile u32` عند عنوانه المطلق `0x40021018`. لا نستعمل أيّ إطار خارجي. هذا هو bare-metal الحقيقي.

> 🎯 **`IOPCEN` في بت 4** — اقرأ §3.4.7 من الـ RM لرؤية تخطيط بتات `APB2PCENR` كاملاً.

### تحذير شائع

❌ **لا تكتب** `RCC_APB2PCENR = RCC_IOPCEN;` (يمسح كل الـ peripherals الأخرى التي فعّلتها قبل ذلك).

✅ **استخدم دائماً** `|=` لإضافة بت دون مسح غيره.

### بديل: `GPIO_TypeDef` المختصر

لو سمحتَ لنفسك ببعض المختصرات، تستطيع تعريف سجلات GPIOC في `struct` لتقصر الكتابة:

```c
typedef struct {
    volatile u32 CFGLR;   // 0x00
    volatile u32 CFGHR;   // 0x04 (غير مستخدم على CH32V003)
    volatile u32 INDR;    // 0x08
    volatile u32 OUTDR;   // 0x0C
    volatile u32 BSHR;    // 0x10
    volatile u32 BCR;     // 0x14
    volatile u32 LCKR;    // 0x18
} gpio_t;

#define GPIOC ((gpio_t*)0x40011000)

// ثم: GPIOC_CFGLR &= ~(0xFu << 4);
```

> 💎 في هذا المنهج نُفضّل **الـ #define المباشر** لأنّه يُظهر العنوان والإزاحة بوضوح. الـ struct اختصار مفيد لكنّه يخفي الـ offset.

---

## الخطوة 2 — تهيئة وضع الـ Pin

### السجل المسؤول

`GPIOC_CFGLR` (Configuration Low Register) — يتحكم في الأطراف من 0 إلى 7. **كل طرف ياخذ 4 بتات** (المجموع 32 بت = 8 أطراف).

### تشريح الـ 4 بتات

```
 bit3   bit2 │ bit1   bit0
 ────────────┼───────────────
   CNF[1:0]  │   MODE[1:0]
```

- **MODE[1:0]** — يحدّد الاتجاه (Input/Output) وأقصى سرعة:

  | `MODE` | المعنى |
  |--------|--------|
  | `00` | Input |
  | `01` | Output, max **10 MHz** |
  | `10` | Output, max **2 MHz** |
  | `11` | Output, max **50 MHz** |

- **CNF[1:0]** — يحدّد النوع الكهربائي:

  | `CNF` (مع MODE != 00) | المعنى |
  |------------------------|---------|
  | `00` | Push-Pull (الأكثر استخداماً) |
  | `01` | Open-Drain |
  | `10` | Alternate Function Push-Pull |
  | `11` | Alternate Function Open-Drain |

### القيمة المطلوبة لـ PC1 = Output Push-Pull 50 MHz

```
CNF=00 | MODE=11  →  0b0011  =  0x3
```

### كتابة الكود (نمط "نظّف ثم اكتب")

```c
// تعريف السجل:
#define GPIOC_BASE  0x40011000
#define GPIOC_CFGLR (*(volatile u32*)(GPIOC_BASE + 0x00))

// 1) تنظيف الـ 4 بتات الخاصة بـ PC1 (بتات 4-7):
GPIOC_CFGLR &= ~(0xFu << (4 * 1));

// 2) كتابة 0b0011 = Push-Pull, 50MHz:
GPIOC_CFGLR |=  (0x3u << (4 * 1));
```

> 💡 **لماذا 50 MHz وليس 10 MHz؟** أعلى slew-rate = أحدّ حواف الإشارة، مفيد جداً لـ PWM و WS2812B. الفرق في استهلاك الطاقة ضئيل لمشاريع الهواية.

### الصيغة العامة (مفيدة للحفظ)

```
GPIOC_CFGLR &= ~(0xFu << (4 * PIN_NUMBER));
GPIOC_CFGLR |=  (VAL  << (4 * PIN_NUMBER));
```

> ✏️ ملاحظة: للأطراف PC8 وما فوق (غير موجودة على CH32V003 لكن موجودة على شرائح WCH أكبر) يُستخدم `CFGHR` بنفس النمط مع `(4 * (PIN_NUMBER - 8))`.

---

## الخطوة 3 — التحكم في الـ LED

### السجل المسؤول

`GPIOC_BSHR` (Bit Set/Reset Register) عند العنوان `0x40011010` — أفضل طريقة لتغيير حالة طرف واحد:

- **ذرّي (Atomic)**: كتابة واحدة لا يمكن مقاطعتها.
- **آمن مع المقاطعات**: لا حاجة لـ `cli()` حوله.
- **لا يؤثر على الأطراف الأخرى**.

### تخطيط الـ 32 بت

```
 bit 31 ─────────────── bit 16 │ bit 15 ─────────────── bit 0
        RESET (نصف علوي)       │       SET (نصف سفلي)
        كتابة 1 → الطرف LOW    │       كتابة 1 → الطرف HIGH
```

### أمثلة

```c
#define GPIOC_BSHR (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR  (*(volatile u32*)(GPIOC_BASE + 0x14))
#define GPIOC_OUTDR (*(volatile u32*)(GPIOC_BASE + 0x0C))

// PC1 = HIGH (تشغيل LED)
GPIOC_BSHR = (1u << 1);

// PC1 = LOW (إطفاء LED) — طريقتان متكافئتان:
GPIOC_BSHR = (1u << (16 + 1));   // عبر BSHR (نصف علوي = RESET)
GPIOC_BCR  = (1u << 1);          // عبر BCR (أنظف وأشيع)
```

### مقارنة سريعة بين الطرق الثلاث

| الطريقة | ذرّي؟ | يؤثر على البقية؟ | الاستخدام |
|---------|--------|--------------------|------------|
| `GPIOC_BSHR` / `GPIOC_BCR` | ✅ | ❌ | الأفضل لتحريك pin واحد |
| `GPIOC_OUTDR ^= (1u<<n)` | ❌ | يمكن (read-modify-write) | للـ toggle المتزامن |
| `GPIOC_OUTDR = value` | ✅ | يمسح كل البقية | لكتابة قيمة كاملة (مثل عداد) |

---

## الكود الكامل — Blinky على مستوى السجلات النقي

```c
typedef unsigned int u32;

// ── RCC ─────────────────────────────────────────────────
#define RCC_BASE       0x40021000
#define RCC_APB2PCENR  (*(volatile u32*)(RCC_BASE + 0x18))
#define RCC_IOPCEN     (1u << 4)        // ساعة GPIOC

// ── GPIOC ───────────────────────────────────────────────
#define GPIOC_BASE     0x40011000
#define GPIOC_CFGLR    (*(volatile u32*)(GPIOC_BASE + 0x00))
#define GPIOC_BSHR     (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR      (*(volatile u32*)(GPIOC_BASE + 0x14))

// تأخير بسيط (busy loop). الـ HSI = 24 MHz افتراضياً بعد الـ Reset،
// و~800,000 دورة ≈ نصف ثانية تقريباً (غير دقيق لكن كافٍ لـ Blinky).
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}

void main(void) {
    // 1) ساعة GPIOC (HSI = 24 MHz افتراضياً، لا حاجة لإعداده)
    RCC_APB2PCENR |= RCC_IOPCEN;

    // 2) PC1 = Output Push-Pull 50 MHz
    GPIOC_CFGLR &= ~(0xFu << (4 * 1));    // امسح بتات PC1
    GPIOC_CFGLR |=  (0x3u << (4 * 1));    // CNF=00, MODE=11

    while (1) {
        GPIOC_BSHR = (1u << 1);            // ON
        delay(800000);
        GPIOC_BCR  = (1u << 1);            // OFF
        delay(800000);
    }
}
```

**ملاحظات على هذا الكود:**

- **بلا `#include`** سوى للمعرّفات الأساسية. كل عنوان يظهر بشكل صريح.
- **بلا `SystemInit()`** — الـ HSI مفعّل افتراضياً عند الـ Reset، لا داعي لاستدعاء أي دالة.
- **`delay()` يدوي** — busy loop بسيط. لاحقاً في [L06 SysTick](/lessons/l06-systick) سنتعلّم التوقيت الدقيق.
- **`while(cycles--)`** — `cycles` هو `volatile` كي لا يحذفه المُترجم أثناء التحسين.
- **`u32` بدل `uint32_t`** — اختصار. يمكن استخدام `uint32_t` من `<stdint.h>` لو أردت الأناقة القياسية.

> 🔑 **هذا هو الـ bare-metal الحقيقي**: لا إطار، لا HAL، لا macros سحرية. أنت ترى كل عنوان وكل بِت.

---

## أخطاء شائعة وحلولها

| الخطأ | السبب | الحل |
|-------|-------|-------|
| الـ LED لا يضيء أبداً | نسيت تفعيل ساعة GPIOC | تأكد من `RCC_APB2PCENR` |
| الـ LED مضيء دائماً | كتبت 1 في كل البتات الـ 4 (`0xF`) | استخدم `0x3` فقط لـ MODE=11, CNF=00 |
| تعطّل الـ pin بعد فترة | استخدمت `OUTDR \|=` داخل interrupt | استخدم `BSHR`/`BCR` (ذرّي) |
| يضيء عكس المتوقع | الـ LED موصول بـ Active-Low | بدّل ON/OFF بين `BSHR` و `BCR` |

---

## أسئلة الفهم

1. إذا كان الـ LED على PC4 بدل PC1، ما الأرقام التي تتغير في الكود؟
2. لماذا استخدمنا `|=` مع `APB2PCENR` وليس `=` فقط؟
3. لماذا `CFGLR` نمسحه أولاً بـ `&= ~(...)` ثمّ نكتب بـ `|=` ؟ (بكلمتين: read-modify-write نظيف.)
4. ماذا يحدث إذا حاولت كتابة `BSHR = (1 << 1) | (1 << 17);` (بتات SET و RESET للـ pin نفسه)؟ (Hint: SET له الأولوية.)

---

## 📖 المراجع

- *CH32V003 Reference Manual* — الفصل 7 (GPIO and Alternate Function I/O).
- جدول 7-2: قيم MODE.
- جدول 7-3: قيم CNF.
- الفصل 3.4: سجلات RCC.
