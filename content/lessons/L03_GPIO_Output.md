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

## مقدمة

يُغطّي هذا الدرسُ الخطوات الأساسية لتهيئة طرف إدخال/إخراج عام (GPIO) كـ **مخرج (Output)**. المشروع التطبيقي هو التحكم في الـ LED المدمج على الشريحة — مشروع "Blinky" الشهير.

> 🎯 **بعد أن تُتمّ هذه المرحلة ستفهم:** لماذا كل طرف يحتاج 4 بتات في `CFGLR`، الفرق بين `BSHR/BCR` و `OUTDR`، ومتى تختار `push-pull` مقابل `open-drain`.

---

## المشروع: وميض الـ LED على PC1

في معظم بوردات تطوير `CH32V003J4M6` (SO8) الـ LED المدمج موصول على **PC1** (Pin 6 على الـ package).

### الخطوات الثلاث

| # | الخطوة | السجل |
|---|---------|--------|
| 1 | تفعيل ساعة Port C | `RCC->APB2PCENR` |
| 2 | تهيئة PC1 كـ Output Push-Pull | `GPIOC->CFGLR` |
| 3 | التحكم بالحالة (HIGH/LOW) | `GPIOC->BSHR` / `GPIOC->BCR` |

---

## الخطوة 1 — تفعيل الساعة للـ Port

### لماذا؟

لتوفير الطاقة، كل طرف (Peripheral) في الشريحة **معطّل افتراضياً**. يعمل فقط الـ CPU + Flash + RAM. أي طرف آخر يحتاج تفعيل ساعته يدوياً.

### السجل المسؤول

`RCC->APB2PCENR` (APB2 Peripheral Clock Enable Register) — جميع أطراف APB2 تُفعَّل من هنا.

```c
// تفعيل ساعة GPIOC
RCC->APB2PCENR |= RCC_APB2Periph_GPIOC;
```

> 💡 الـ macro `RCC_APB2Periph_GPIOC` يساوي `(1 << 4)` لأن `IOPCEN` في بت 4 من السجل. اقرأ الفصل 3.4 من الـ RM لرؤية كل الـ peripherals وبتاتها.

### تحذير شائع

❌ **لا تكتب** `RCC->APB2PCENR = RCC_APB2Periph_GPIOC;` (يمسح كل الـ peripherals الأخرى التي فعّلتها قبل ذلك).

✅ **استخدم دائماً** `|=` لإضافة بت دون مسح غيره.

---

## الخطوة 2 — تهيئة وضع الـ Pin

### السجل المسؤول

`GPIOC->CFGLR` (Configuration Low Register) — يتحكم في الأطراف من 0 إلى 7. **كل طرف ياخذ 4 بتات** (المجموع 32 بت = 8 أطراف).

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
// تنظيف الـ 4 بتات الخاصة بـ PC1 (بتات 4-7)
GPIOC->CFGLR &= ~(0xF << (4 * 1));

// كتابة 0b0011 = Push-Pull, 50MHz
GPIOC->CFGLR |=  (0x3 << (4 * 1));
```

> 💡 **لماذا 50 MHz وليس 10 MHz؟** أعلى slew-rate = أحدّ حواف الإشارة، مفيد جداً لـ PWM و WS2812B. الفرق في استهلاك الطاقة ضئيل لمشاريع الهواية.

### الصيغة العامة (مفيدة للحفظ)

```
GPIOC->CFGLR &= ~(0xF  << (4 * PIN_NUMBER));
GPIOC->CFGLR |=  (VAL  << (4 * PIN_NUMBER));
```

> ✏️ ملاحظة: للأطراف PC8 وما فوق (غير موجودة على CH32V003 لكن موجودة على شرائح WCH أكبر) يُستخدم `CFGHR` بنفس النمط مع `(4 * (PIN_NUMBER - 8))`.

---

## الخطوة 3 — التحكم في الـ LED

### السجل المسؤول

`GPIOC->BSHR` (Bit Set/Reset Register) — أفضل طريقة لتغيير حالة طرف واحد:

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
// PC1 = HIGH (تشغيل LED)
GPIOC->BSHR = (1 << 1);

// PC1 = LOW (إطفاء LED) — طريقتان متكافئتان:
GPIOC->BSHR = (1 << (16 + 1));   // عبر BSHR
GPIOC->BCR  = (1 << 1);          // عبر BCR (أنظف وأشيع)
```

### مقارنة سريعة بين الطرق الثلاث

| الطريقة | ذرّي؟ | يؤثر على البقية؟ | الاستخدام |
|---------|--------|--------------------|------------|
| `BSHR` / `BCR` | ✅ | ❌ | الأفضل لتحريك pin واحد |
| `OUTDR ^= (1<<n)` | ❌ | يمكن (read-modify-write) | للـ toggle المتزامن |
| `OUTDR = value` | ✅ | يمسح كل البقية | لكتابة قيمة كاملة (مثل عداد) |

---

## الكود الكامل

```c
#include "ch32v003fun.h"

int main(void) {
    SystemInit();   // HSI 24 MHz

    // 1) ساعة GPIOC
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC;

    // 2) PC1 = Output Push-Pull 50 MHz
    GPIOC->CFGLR &= ~(0xF << (4 * 1));
    GPIOC->CFGLR |=  (0x3 << (4 * 1));

    while (1) {
        GPIOC->BSHR = (1 << 1);      // ON
        Delay_Ms(500);
        GPIOC->BCR  = (1 << 1);      // OFF
        Delay_Ms(500);
    }
}
```

---

## أخطاء شائعة وحلولها

| الخطأ | السبب | الحل |
|-------|-------|-------|
| الـ LED لا يضيء أبداً | نسيت تفعيل ساعة GPIOC | تأكد من `RCC->APB2PCENR` |
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
