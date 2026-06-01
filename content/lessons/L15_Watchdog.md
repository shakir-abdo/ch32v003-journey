---
order: 15
slug: "l15-watchdog"
title: "الـ Watchdog (IWDG/WWDG)"
title_en: "Watchdog (IWDG/WWDG)"
icon: "i-lucide-shield-check"
track: "pro"
level: "advanced"
minutes: 40
tags: ["iwdg", "wwdg"]
---

# الدرس 15: الـ Watchdog — IWDG و WWDG لإنقاذ النظام

> **المرجع:** CH32V003 RM v1.9
> - الفصل 4 "Independent Watchdog (IWDG)" — صفحات 25–27
> - الفصل 5 "Window Watchdog (WWDG)" — صفحات 27–32

---

## 0. ما هو الـ Watchdog؟

تخيّل عقرب ساعة يدور ببطء. كل فترة، يجب على البرنامج "إطعامه" (تصفيره). إذا نسي البرنامج (لأنه تعلّق في حلقة لا نهاية أو crash)، الـ Watchdog يصل إلى الصفر و **يُعيد تشغيل الشريحة**.

الهدف: **ضمان عودة النظام للحياة دائماً** حتى إذا حدث خطأ غير متوقع. ضروري لتطبيقات تعمل بدون مراقبة (sensor remote, washer machine, إلخ).

---

## 1. IWDG vs WWDG — الفرق

| الخاصية | IWDG | WWDG |
|---------|------|------|
| المصدر | LSI (128 kHz) | PCLK1 |
| يستمر في Sleep | ✅ | ❌ |
| يستمر في Standby | ✅ (لو فُعِّل) | ❌ |
| نافذة مبكرة | لا توجد | ✅ (مرونة محدودة) |
| الحماية من تسارع البرنامج | ضعيفة | ✅ |
| الاستخدام الشائع | **بيئات حقيقية** | تتبع توقيت دقيق |

> 💡 في 90% من المشاريع: استخدم IWDG.

---

## 2. IWDG — التركيب

### السجلات

| السجل | العنوان | الوصف | RM ص. |
|-------|---------|--------|--------|
| `IWDG_CTLR` | `0x40003000` | المفتاح (Key) | 26 |
| `IWDG_PSCR` | `0x40003004` | Prescaler | 27 |
| `IWDG_RLDR` | `0x40003008` | Reload value | 27 |
| `IWDG_STATR` | `0x4000300C` | الحالة | 27 |

### المفاتيح (Keys)

- `0xAAAA` → "أطعمني" (Reload).
- `0x5555` → "افتح للكتابة" (لتعديل PSCR/RLDR).
- `0xCCCC` → "ابدأ" (Enable).

> 🔐 هذه القيم تمنع التعديل العشوائي بسبب bugs.

---

## 3. حساب فترة الـ IWDG

```
T = (RLDR + 1) × prescaler / 128 kHz
```

prescaler من `PSCR[2:0]`:

| PSCR | القاسم |
|------|--------|
| 000 | /4 |
| 001 | /8 |
| 010 | /16 |
| 011 | /32 |
| 100 | /64 |
| 101 | /128 |
| 110 | /256 |
| 111 | /256 (محجوز) |

### مثال — Watchdog كل 1 ثانية

```
نختار prescaler = /32 (PSCR=011) → LSI/32 = 4 kHz
RLDR = 4000 - 1 = 3999
T    = 4000 / 4000 = 1.0 s
```

### مثال — Watchdog 100 ms

```
prescaler = /4 → 32 kHz
RLDR = 3200 - 1 = 3199
T = 3200 / 32000 = 0.1 s
```

---

## 4. الكود الأساسي

```c
#include "ch32v003fun.h"

void iwdg_init(uint16_t reload, uint8_t prescaler) {
    // 1) افتح للكتابة
    IWDG->CTLR = 0x5555;

    // 2) اضبط prescaler و reload
    IWDG->PSCR = prescaler;
    IWDG->RLDR = reload;

    // 3) أطعم مرة (Reload)
    IWDG->CTLR = 0xAAAA;

    // 4) ابدأ
    IWDG->CTLR = 0xCCCC;
}

static inline void iwdg_feed(void) {
    IWDG->CTLR = 0xAAAA;
}

int main(void) {
    SystemInit();
    iwdg_init(3999, 3);   // 1s timeout

    while (1) {
        do_work();
        iwdg_feed();      // إذا تأخر العمل، الـ MCU يعيد التشغيل
        Delay_Ms(800);     // أقل من 1 ثانية
    }
}
```

> 💀 **بمجرد تشغيل الـ IWDG، لا يمكن إيقافه إلا بـ Reset.** اختر هذا بعناية.

---

## 5. اختبار الـ Watchdog (شيء ممتع)

```c
int main(void) {
    SystemInit();
    led_init();
    iwdg_init(3999, 3);

    GPIOC->BSHR = (1 << 1);    // LED ON عند الإقلاع
    Delay_Ms(500);
    GPIOC->BCR  = (1 << 1);    // LED OFF

    while (1);   // ← متعمدًا: تعطّل
    // النتيجة: IWDG يفجّر Reset بعد 1 ثانية
    // → LED يضيء ثم يُطفئ ثم يعيد الدورة كل ثانية
}
```

---

## 6. WWDG — نظرة سريعة

> 📖 *RM, الفصل 5 — صفحة 27.*

WWDG = Window Watchdog. الفرق:

- يجب الإطعام **داخل نافذة زمنية محددة**:
  - ليس قبل وقت معيّن (`W`).
  - وليس بعد عدّاد ينقص إلى 0.
- يكشف **تسارع البرنامج** (إذا أطعم مبكراً).

### السجلات

| السجل | الوصف |
|------|--------|
| `WWDG_CTLR` | counter T[6:0] + WDGA |
| `WWDG_CFGR` | window W[6:0] + WDGTB + EWI |
| `WWDG_STATR` | EWIF |

### المعادلة

```
T_timeout = T_PCLK1 × 4096 × 2^WDGTB × (T[5:0] + 1)
```

### استخدام نموذجي

```c
void wwdg_init(void) {
    RCC->APB1PCENR |= (1 << 11);                 // WWDG clock
    WWDG->CFGR = (0x7F)                          // W = 0x7F (نافذة كاملة)
               | (0b11 << 7);                    // WDGTB = /8
    WWDG->CTLR = (1 << 7)                        // WDGA: enable
               | (0x7F);                         // T = counter
}

void wwdg_feed(void) {
    WWDG->CTLR = (1 << 7) | (0x7F);
}
```

---

## 7. متى نطعم؟ نمط آمن

```c
while (1) {
    task_A();    // 50ms
    iwdg_feed();
    task_B();    // 100ms
    iwdg_feed();
    task_C();    // 30ms
    iwdg_feed();
    __asm__("wfi");
}
```

> ⚠️ **لا تطعم داخل ISR**. إذا كان الـ main حلقة عالقة لكن ISR يطعم، الـ watchdog يفقد قيمته.

---

## 8. الـ Watchdog أثناء التطوير (Debug)

أثناء الـ debug، الـ MCU قد يتوقف عند breakpoint والـ Watchdog يستيقظ بنفسه فيُعيد التشغيل ويُفسد جلسة debug.

### حل: تجميد الـ Watchdog أثناء debug

```c
DBGMCU->CTLR |= (1 << 0);    // DBG_IWDG_STOP
DBGMCU->CTLR |= (1 << 1);    // DBG_WWDG_STOP
```

> 📖 *RM, §4.2.2 "IWDG Debug Mode" — صفحة 26.*

---

## 9. ماذا تفعل بعد الاستيقاظ من Watchdog Reset؟

عند الاستيقاظ، تستطيع معرفة سبب الـ reset عبر `RCC_RSTSCKR`:

| البت | الاسم | المعنى |
|------|-------|--------|
| 26 | PINRSTF | NRST pin reset |
| 27 | PORRSTF | Power-on reset |
| 28 | SFTRSTF | Software reset |
| 29 | **IWDGRSTF** | IWDG reset |
| 30 | **WWDGRSTF** | WWDG reset |
| 31 | LPWRRSTF | Low-power reset |

```c
if (RCC->RSTSCKR & (1 << 29)) {
    log("Crash recovered by IWDG\n");
    RCC->RSTSCKR |= (1 << 24);    // RMVF: امسح الأعلام
}
```

> 📖 *RM, §3.4.9 — صفحة 23.*

---

## 10. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| الـ MCU يعيد التشغيل عشوائياً | RLDR صغير + مهام طويلة | كبّر RLDR أو أطعم أكثر |
| لا أستطيع إيقاف IWDG | هذه ميزة وليست خطأ | reset كامل |
| WWDG لا يعمل | نسيت ساعة APB1 + WDGA | تحقق |
| Debug جلسة تتلف | لم تجمد الـ IWDG | `DBGMCU->CTLR` |
| الاستيقاظ من crash بسرعة لا يكتشف | RLDR كبير جداً | اضبط حسب أبطأ مهمة |
| المفتاح الخطأ | استخدمت `0xAAAA` لتعديل PSCR | استخدم `0x5555` |

---

## 11. تمارين

1. **Watchdog Demo**: LED يومض بسرعة، ثم crash → IWDG يعيد. كرّر للتحقق.
2. **Reset reason**: بعد كل reset، اطبع السبب على UART.
3. **متى تطعم؟**: إذا لديك 3 مهام بأوقات مختلفة، اختر تردد إطعام مناسب.
4. **WWDG window**: نفّذ النافذة الزمنية الضيقة.
5. **AWU + IWDG**: نام بعمق، استيقظ، اطعم، نام مرة ثانية.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §4.2 "IWDG Function" — صفحات 25-26
  - §4.3 "IWDG Registers" — صفحات 26-27
  - §5.2 "WWDG Function" — صفحات 27-30
  - §5.3 "WWDG Registers" — صفحات 30-32
  - §3.4.9 "RCC_RSTSCKR" — صفحة 23 (لقراءة سبب الـ reset)
