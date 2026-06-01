---
order: 6
slug: "l06-systick"
title: "SysTick — التوقيت غير الحاجب"
title_en: "SysTick Timing"
icon: "i-lucide-timer"
track: "io"
level: "beginner"
minutes: 30
tags: ["systick", "timer"]
---

# الدرس 06: SysTick — التوقيت الدقيق بدون Delay_Ms

> **المرجع:** CH32V003 Reference Manual v1.9
> - الفصل 6.5.4 "STK Register Description" — صفحات 47-50
> - الفصل 6.2 "System Timer" — صفحة 32
>
> **العتاد:** CH32V003J4M6 + LED.
> **مهم:** SysTick في CH32V003 هو **QingKe SysTick** ولا يشبه ARM Cortex-M SysTick. السجلات مختلفة عن STM32.

---

## 📋 تعريفات السجلات لهذا الدرس

انسخ هذا البلوك إلى رأس `main.c` قبل تشغيل أيّ مثال من هذا الدرس. الأمثلة في الأسفل تفترض أنّ هذه التعريفات موجودة.

```c
typedef unsigned int u32;

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_OUTDR     (*(volatile u32*)(GPIOC_BASE + 0x0C))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_IENR1      (*(volatile u32*)(PFIC_BASE + 0x100))

// ── SysTick ──────────────────────────────────────────────
#define SysTick_BASE    0xE000F000
#define STK_CTLR        (*(volatile u32*)(SysTick_BASE + 0x00))
#define STK_SR          (*(volatile u32*)(SysTick_BASE + 0x04))
#define STK_CNT         (*(volatile u32*)(SysTick_BASE + 0x08))
#define STK_CMP         (*(volatile u32*)(SysTick_BASE + 0x10))

// تأخير busy-loop بسيط (يكفي للأمثلة الأساسية)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 جميع العناوين مستخرجة من *CH32V003 RM v1.9*، الفصل الخاصّ بكل peripheral. الجدول مرتّب بترتيب الاستخدام في الدرس.

---


## 0. تذكير سريع

> **Register** = صندوق 32 بت داخل الشريحة، له عنوان رقمي.
> **Memory-Mapped I/O** = نتحكم بالعتاد عن طريق الكتابة على عناوين معيّنة.

في هذا الدرس، السجلات تقع في منطقة خاصة تسمى **Core Private Peripherals** عند `0xE0000000`. هذه ليست في منطقة `0x40xxxxxx` لأنها جزء من نواة المعالج نفسه (QingKe Core)، وليست peripheral عادي.

---

## 1. ما هو SysTick؟ ولماذا نحتاجه؟

تخيّل ساعة رقمية صغيرة بداخل المعالج تعدّ تلقائياً وتزيد رقماً كل ضربة ساعة. **هذا هو SysTick**.

### المشكلة مع `Delay_Ms`

```c
delay(500 * 8000);   // الـ CPU "في سُبات" 500ms — لا يفعل شيء!
```

أثناء هذه المدة:
- ❌ لا تستطيع قراءة الزر.
- ❌ لا تستطيع تحديث UART.
- ❌ لا تستطيع توفير الطاقة.

### الحلّ: SysTick

عدّاد يدور **خلفياً** على مستوى العتاد. يطلق **مقاطعة** كل فترة محدّدة (مثلاً كل 1ms). يبقى الـ CPU حراً يفعل أشياء أخرى بينما الوقت يُحسب تلقائياً.

---

## 2. معمارية SysTick

عدّاد **32 بت** يعدّ تصاعدياً. سجل **CMP** (Compare) يحدّد متى نريد الحدث.

```
   ┌──────────────────────┐
   │  العدّاد (CNT)        │ ← يزيد بـ +1 كل ضربة ساعة
   │     0, 1, 2, 3 …     │
   └──────────────────────┘
              │
              ▼ (مقارنة)
   ┌──────────────────────┐
   │  CMP = 47999         │ ← القيمة الهدف
   └──────────────────────┘
              │
   عندما CNT == CMP:
       1. علم CNTIF = 1
       2. مقاطعة (إذا STIE=1)
       3. (لو STRE=1) إعادة العدّ من 0
```

---

## 3. السجلات الأربعة

| السجل | العنوان | الوصف | المرجع في RM |
|-------|---------|--------|---------------|
| `STK_CTLR` | `0xE000F000` | التحكم (Enable, IRQ, Source, Auto-reload) | §6.5.4.1, ص.47 |
| `STK_SR` | `0xE000F004` | علم الحدث `CNTIF` | §6.5.4.2, ص.48 |
| `STK_CNTL` | `0xE000F008` | قيمة العدّاد الحالية (32 بت) | §6.5.4.3, ص.48 |
| `STK_CMPLR` | `0xE000F010` | قيمة المقارنة (32 بت) | §6.5.4.4, ص.49 |

> 📝 لاحظ القفزة من `0x008` إلى `0x010` (بدل `0x00C`) — هكذا تصميم WCH.

### تشريح STK_CTLR (الأهم)

> 📖 *RM, §6.5.4.1 — صفحة 47.*

| البت | الاسم | الوظيفة |
|------|-------|---------|
| 0 | **STE** | System Counter Enable — `1` يشغّل العدّاد |
| 1 | **STIE** | System Counter Interrupt Enable — `1` يفعّل المقاطعة عند `CNT == CMP` |
| 2 | **STCLK** | Source Select — `1`=HCLK, `0`=HCLK/8 |
| 3 | **STRE** | Auto-Reload — `1` يعيد العدّ من 0 عند بلوغ CMP |
| 31 | SWIE | Software trigger للاختبار |

---

## 4. حساب قيمة CMP لـ 1ms tick

### المعادلة الأساسية

```
CMP = (تردد المصدر × الزمن المطلوب) - 1
```

### على 48 MHz (PLL) مع STCLK=1 (HCLK مباشر):

```
CMP لـ 1ms = (48,000,000 × 0.001) - 1 = 47,999
```

### على 24 MHz (HSI افتراضي):

```
CMP لـ 1ms = (24,000,000 × 0.001) - 1 = 23,999
```

> 💡 الـ `-1` لأن العدّ يبدأ من 0. إذا CMP=0 ستنطلق المقاطعة بعد تكّة واحدة.

### قيم مفيدة جاهزة (على 48 MHz, STCLK=1)

| الزمن | CMP |
|-------|-----|
| 1 µs | 47 |
| 100 µs | 4,799 |
| 1 ms | 47,999 |
| 10 ms | 479,999 |
| 1 s | 47,999,999 |

---

## 5. شرح العمليات Bitwise لتهيئة CTLR

نريد ضبط: `STE=1, STIE=1, STCLK=1, STRE=1`.

```c
STK_CTLR = (1 << 0)  | (1 << 1) | (1 << 2) | (1 << 3);
//              ─STE──     ─STIE─    ─STCLK─    ─STRE──
//                ↓         ↓         ↓          ↓
//              0b0001 | 0b0010 | 0b0100 | 0b1000  =  0b1111  =  0xF
```

**النتيجة**: `CTLR = 0xF`.

### لماذا نكتب مباشرة `=` وليس `|=`؟

لأن السجل بعد الـ Reset = 0. نريد كل البتات الأخرى = 0 أيضاً (محجوزة). الكتابة المباشرة أوضح.

---

## 6. الكود الكامل — مقاطعة كل 1ms

```c
volatile uint32_t ticks_ms = 0;

void systick_init(void) {
    // امسح كل شيء أولاً
    STK_CTLR = 0;
    STK_CNT  = 0;
    STK_SR   = 0;

    // 1ms على 48 MHz
    STK_CMP  = 48000 - 1;

    // STE=1, STIE=1, STCLK=1 (HCLK), STRE=1 (auto-reload)
    STK_CTLR = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3);

    // فعّل المقاطعة في PFIC (NVIC)
    PFIC_IENR1 |= (1u << 12); /* SysTicK_IRQn = 12 */
}

__attribute__((interrupt))
void SysTick_Handler(void) {
    STK_SR = 0;       // مسح علم CNTIF (write 0)
    ticks_ms++;
}
```

> ⚠️ **مسح CNTIF**: التوثيق غامض ويقول "write 0 to clear, write 1 to invalidate" — نكتب `0` (الواقع العملي).

---

## 7. الدوال الذهبية: `millis()` و `delay_ms()`

```c
static inline uint32_t millis(void) {
    return ticks_ms;
}

void delay_blocking_ms(uint32_t ms) {
    uint32_t start = ticks_ms;
    while ((ticks_ms - start) < ms) {
        __asm__ volatile ("wfi");   // نَم حتى المقاطعة التالية
    }
}
```

### لماذا `wfi`؟

`wfi` = **Wait For Interrupt** — تعليمة RISC-V توقف الـ CPU إلى أن تأتي مقاطعة. أثناء هذه الفترة:
- الـ CPU في وضع توفير طاقة.
- لا يحرق دورات ساعة.
- يستيقظ تلقائياً عند المقاطعة.

> 💎 الفرق الكبير بين `wfi` و `for(i=0;i<N;i++)`:
> - `for` يحرق طاقة بلا فائدة.
> - `wfi` يضع الـ CPU في "خفيف-النوم".

### لماذا `(ticks_ms - start) < ms` وليس `ticks_ms < start + ms`؟

لتفادي مشاكل الـ overflow في 32-بت. الطرح يعمل صحيحاً حتى عند overflow بسبب الحساب الدائري للـ `unsigned`.

---

## 8. نمط Multi-Tasking البسيط (Scheduler Cooperative)

```c
uint32_t last_blink = 0, last_button = 0;

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    led_init();
    button_init();
    systick_init();

    while (1) {
        uint32_t now = millis();

        if (now - last_blink >= 500) {       // كل 500ms
            last_blink = now;
            GPIOC_OUTDR ^= (1 << 1);        // toggle LED
        }

        if (now - last_button >= 10) {       // كل 10ms
            last_button = now;
            // poll button + debouncing
        }

        __asm__ volatile ("wfi");
    }
}
```

> 💎 هذا النمط (state machine + millis) هو **أساس** كل firmware احترافي. لاحقاً عندما تتعلم RTOS، ستفهم لماذا هذا النمط يفتح الأبواب.

---

## 9. توقيت ميكروثانية (للـ WS2812B وما شابه)

لتوقيت دقيق أقل من 1ms، نقرأ `CNT` مباشرة:

```c
void delay_us_busy(uint32_t us) {
    uint32_t start = STK_CNT;
    uint32_t cycles = us * (SYSTEM_CORE_CLOCK / 1000000);   // 48 على 48MHz
    while ((STK_CNT - start) < cycles);
}
```

> ⚡ **busy-wait** لكن دقيق جداً ومفيد لـ bit-banging.

---

## 10. شرح Bitwise لمسح علم CNTIF

```c
STK_SR = 0;
```

نكتب 0 على كامل السجل. لكن `SR` بت 0 فقط منه قابل للكتابة (CNTIF). البتات 1-31 محجوزة وكتابة أي شيء لها مهملة.

> ✏️ كتابة `0` تساوي مسح. كتابة `1` تساوي "إلغاء" (write 1 to invalidate — حالة نادرة الاستخدام).

---

## 11. الفروقات عن ARM Cortex-M SysTick (لمن جاء من STM32)

| الفرق | ARM SysTick | CH32V003 SysTick |
|-------|-------------|-------------------|
| العدّاد | 24-bit | **32-bit** |
| الاتجاه | Down (من LOAD → 0) | **Up** (من 0 → CMP) |
| السجلات | `LOAD/VAL/CTRL` | `CMP/CNT/CTLR` |
| المسح | تلقائي عند القراءة | يدوي (write 0 to SR) |
| موضع IRQ | NVIC #15 | PFIC #12 |

> 📖 *RM, §6.3 جدول 6-3 — صفحة 32.*

---

## 12. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| المقاطعة لا تشتعل أبداً | نسيت تفعيل المقاطعة في `PFIC_IENR1` | `PFIC_IENR1 |= (1u << 12); /* SysTicK_IRQn = 12 */` |
| `millis()` تنمو ببطء غريب | اخترت STCLK=0 (HCLK/8) بالخطأ | ضع `STCLK=1` |
| العدّاد لا يبدأ | `STE=0` | فعّل `STE` |
| المقاطعة تشتعل مرة واحدة فقط | نسيت `STRE` | فعّل auto-reload |
| `ticks_ms` تتذبذب في القراءة من الـ main | متغير 32-bit مقروء جزئياً أثناء IRQ | اقرأ في متغير محلي مرة واحدة |
| `wfi` لا يستيقظ | المقاطعة معطّلة في PFIC | تحقق من بت المقاطعة في `PFIC_IENR1` |

---

## 13. تمارين

1. **3 LEDs بترددات مختلفة**: PC1 يومض 1Hz، PC2 يومض 2Hz، PC4 يومض 5Hz — كلها بـ SysTick واحد.
2. **Stopwatch**: ابدأ العدّ عند ضغطة زر، أوقف عند ضغطة ثانية، اعرض الزمن عبر UART.
3. **PWM يدوي بـ SysTick**: شغّل LED بسطوع متغير عبر duty-cycle.
4. **نبضة قلب**: نمط `طويل-قصير-طويل` كل 1.5 ثانية.
5. **Time-based debouncing**: استخدم `millis()` كما في الدرس 04 لمعالجة الزر بدون delay.

---

## 📖 المراجع (مع أرقام الصفحات)

- **CH32V003 RM v1.9**:
  - §6.2 "System Timer" — صفحة 32
  - §6.5.4.1 STK_CTLR — صفحة 47
  - §6.5.4.2 STK_SR — صفحة 48
  - §6.5.4.3 STK_CNTL — صفحة 48
  - §6.5.4.4 STK_CMPLR — صفحة 49
  - §6.3 "Vector Table" (لمعرفة IRQ #12) — صفحة 32
- **QingKe V2 RISC-V Processor Manual** — للتفاصيل النواوية إذا أردت العمق.
- **ch32v003fun**: `ch32v003_systick.c` كنموذج بسيط جداً للاستخدام.
