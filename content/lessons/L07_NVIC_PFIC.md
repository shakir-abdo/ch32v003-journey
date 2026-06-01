---
order: 7
slug: "l07-nvic-pfic"
title: "PFIC و المقاطعات"
title_en: "NVIC / PFIC"
icon: "i-lucide-zap"
track: "io"
level: "beginner"
minutes: 30
tags: ["interrupts", "pfic"]
---

# الدرس 07: PFIC و المقاطعات (Interrupts) — كيف يستجيب المعالج للأحداث

> **المرجع:** CH32V003 Reference Manual v1.9 — الفصل 6 (Interrupt and Events / PFIC) — صفحات 32–47.
>
> **العتاد:** CH32V003J4M6 + LED + زر.

---

## 0. لماذا هذا الدرس أساسي؟

كلّما تعلّمناه حتى الآن كان **متتابعاً (Sequential)**: سطرٌ يتبع سطراً. لكن الحياة العتادية ليست كذلك:

- زر يُضغط في أي لحظة.
- بيانات تصل عبر UART متى وصلت.
- مؤقّت ينتهي عدّه.

نحتاج آلية لـ **"اقطع ما تفعله الآن واستجِب لهذا الحدث"** — هذه هي المقاطعة (Interrupt).

في CH32V003 الوحدة المسؤولة عن إدارة المقاطعات اسمها **PFIC** (Programmable Fast Interrupt Controller). تشبه NVIC في ARM Cortex-M لكنها أبسط.

---

## 1. كيف تعمل المقاطعة — قصة من 5 خطوات

```
  المعالج                          العتاد (Peripheral)
  ──────                            ────────────────────
                                    
  ينفّذ كود main()                  زر يُضغط ← EXTI Line 2 يشتعل
       │
       │           ◄──── إشارة المقاطعة ────
       │
  1) ينهي التعليمة الحالية
  2) يحفظ السياق (PC, regs) على الـ Stack
  3) يقرأ Vector Table → يعرف عنوان المعالج
  4) يقفز إلى ISR (Interrupt Service Routine)
       │
       ▼
  EXTI7_0_IRQHandler() {
      // كودك يستجيب هنا
      // مهم: امسح علم المقاطعة!
  }
       │
       ▼
  5) `mret` (Machine Return)
       │
       ▼
  يستعيد السياق ويُكمل main() من حيث توقف
```

---

## 2. Vector Table — جدول العناوين

هذا جدول في بداية الـ Flash يحتوي على عنوان كل ISR. عندما تحدث مقاطعة رقمها N، المعالج يقفز إلى العنوان في `Vector_Table[N]`.

> 📖 *RM, §6.3 "Vector Table of Interrupts and Exceptions" — صفحات 32-33.*

### القنوات المهمة في CH32V003

| # | الاسم | المصدر |
|---|-------|--------|
| 0 | — | (محجوز) |
| 1 | NMI | Non-Maskable Interrupt |
| 2 | HardFault | خطأ معالج كبير |
| 12 | SysTick | عند CNT==CMP |
| 14 | SW_Handler | Software interrupt |
| 16 | WWDG | Window watchdog |
| 17 | PVD | Programmable Voltage Detector |
| 19 | RCC | تنبيهات RCC |
| 20 | EXTI7_0 | EXTI خطوط 0-7 (كلها معاً!) |
| 22-25 | DMA1 channels 1-4 (وحتى 7) | DMA |
| 26 | ADC | نهاية تحويل ADC |
| 27 | I2C1_EV | I2C events |
| 28 | I2C1_ER | I2C errors |
| 29 | USART1 | UART events |
| 30 | SPI1 | SPI events |
| 31-33 | TIM1 (UP/CC/BRK/TRG_COM) | Timer 1 |
| 34 | TIM2 | Timer 2 |

---

## 3. الـ ISR — كيف نكتبها

في RISC-V (CH32V003)، الـ ISR تحتاج معالجة خاصة لحفظ السجلات. نخبر المُترجم عبر `__attribute__((interrupt))`:

```c
__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    // ... كودك
}
```

هذا الـ attribute يجعل المُترجم يُولّد:
1. حفظ كل السجلات على الـ Stack في البداية.
2. استرجاعها في النهاية.
3. تنتهي بتعليمة `mret` بدل `ret` العادية.

> ⚠️ بدون `__attribute__((interrupt))` تظن أنك دالة عادية، تستعمل `ret` ويتعطل النظام.

### بديل WCH خاص للأداء

WCH عرّفت attribute مخصّص للأداء الأعلى:

```c
__attribute__((interrupt("WCH-Interrupt-fast")))
void TIM2_IRQHandler(void) { ... }
```

يستخدم سجلات الـ "fast interrupt" المتوفرة في QingKe بدل حفظ كل السجلات → أسرع بـ 30% تقريباً.

---

## 4. السجلات الرئيسية في PFIC

| السجل | العنوان | الوصف |
|-------|---------|--------|
| `PFIC_ISR1` | `0xE000E000` | حالة المقاطعات المعلّقة 0-31 |
| `PFIC_IENR1` | `0xE000E100` | تفعيل المقاطعة (1=enable) |
| `PFIC_IRER1` | `0xE000E180` | إلغاء تفعيل (write 1 to disable) |
| `PFIC_IPSR1` | `0xE000E200` | تعيين المقاطعة كـ Pending |
| `PFIC_IPRR1` | `0xE000E280` | مسح Pending |
| `PFIC_IPRIORx` | `0xE000E400+x` | أولوية كل قناة (8-bit) |
| `PFIC_CFGR` | `0xE000E048` | تنفيذ السلوك (NEST, PRI grouping) |

> 📖 *RM, §6.5.2 "PFIC Registers" — صفحات 35-46.*

> 💡 لحسن الحظ، لا نحتاج التعامل مع هذه السجلات مباشرة. الـ macros `NVIC_EnableIRQ()` و `NVIC_DisableIRQ()` من `ch32v003fun.h` تكفي 95% من الحالات.

---

## 5. التحكم في المقاطعات — الأسطر الذهبية

### تفعيل مقاطعة

```c
NVIC_EnableIRQ(EXTI7_0_IRQn);
```

ما يحدث داخلياً: يكتب `1` في البت المناسب من `PFIC_IENR1`.

### إلغاء تفعيل

```c
NVIC_DisableIRQ(EXTI7_0_IRQn);
```

### إعداد أولوية (0=أعلى أولوية)

```c
NVIC_SetPriority(EXTI7_0_IRQn, 0);
```

### تعطيل كل المقاطعات (Global Disable)

```c
__disable_irq();   // = csrci mstatus, 8
// منطقة حرجة
__enable_irq();    // = csrsi mstatus, 8
```

> 💀 **استخدمها فقط لفترات قصيرة جداً**. إذا طوّلت أكثر من بضعة microseconds، ستفقد مقاطعات!

---

## 6. شرح Bitwise — كيف يعمل `NVIC_EnableIRQ` تحت الغطاء

`NVIC_EnableIRQ(20)` (مثلاً للـ EXTI7_0) يفعل ما يلي:

```c
PFIC->IENR[20 / 32] = (1 << (20 % 32));
//          ↑                  ↑
//         IENR1               بت 20 في السجل
```

**شرح**:

1. `20 / 32 = 0` → نستخدم `IENR1` (السجل الأول).
2. `20 % 32 = 20` → نشتعل البت رقم 20.
3. `1 << 20` = قناع للبت 20.
4. الكتابة المباشرة `=` لأن السجل **Write-1-to-Set** خاص: الكتابة `1` تفعّل، الكتابة `0` لا تفعل شيئاً.

> 🎯 لاحظ: هذا السجل من نوع `wo_w1s` (write-only, write-1-to-set). تختلف عن السجلات العادية.

---

## 7. مثال متكامل — SysTick + EXTI مع أولويات

```c
#include "ch32v003fun.h"

volatile uint32_t ticks_ms = 0;
volatile uint8_t  btn_event = 0;

void systick_init(void) {
    SysTick->CTLR = 0; SysTick->CNT = 0; SysTick->SR = 0;
    SysTick->CMP  = 47999;
    SysTick->CTLR = 0xF;     // STE | STIE | STCLK | STRE
    NVIC_EnableIRQ(SysTicK_IRQn);
    NVIC_SetPriority(SysTicK_IRQn, 1);   // أولوية أقل
}

void button_exti_init(void) {
    // ... (نفس الدرس 04)
    NVIC_EnableIRQ(EXTI7_0_IRQn);
    NVIC_SetPriority(EXTI7_0_IRQn, 0);   // أولوية أعلى (الزر أهم)
}

__attribute__((interrupt))
void SysTick_Handler(void) {
    SysTick->SR = 0;
    ticks_ms++;
}

__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    EXTI->INTFR = (1 << 2);
    btn_event = 1;
}

int main(void) {
    SystemInit();
    systick_init();
    button_exti_init();

    while (1) {
        if (btn_event) {
            btn_event = 0;
            GPIOC->OUTDR ^= (1 << 1);
        }
        __asm__ volatile ("wfi");
    }
}
```

> 🔑 إذا حدثت ضغطة زر أثناء معالجة SysTick، الـ EXTI أعلى أولوية → سيقاطع SysTick. هذا ما نريد.

---

## 8. القواعد الذهبية للـ ISR

### القاعدة 1: اجعل الـ ISR قصيراً جداً

```c
// ❌ سيء
void EXTI7_0_IRQHandler(void) {
    EXTI->INTFR = (1<<2);
    Delay_Ms(100);           // ← لا تفعل هذا!
    printf("clicked");        // ← ولا هذا!
    update_oled_display();    // ← ولا هذا!
}

// ✅ جيد
void EXTI7_0_IRQHandler(void) {
    EXTI->INTFR = (1<<2);
    btn_event = 1;            // ← فقط ارفع علم
}
// والـ main() يفعل البقية
```

### القاعدة 2: متغيرات تتبادل مع الـ main يجب أن تكون `volatile`

```c
volatile uint32_t ticks_ms = 0;     // ✅
uint32_t ticks_ms = 0;              // ❌ المُترجم قد يُحسّن القراءة بعيداً
```

### القاعدة 3: امسح علم المقاطعة في بداية الـ ISR

```c
void EXTI7_0_IRQHandler(void) {
    EXTI->INTFR = (1 << 2);   // ← أول شيء
    // ... باقي الكود
}
```

### القاعدة 4: لا تستخدم `printf` أو `malloc` داخل ISR

كلاهما يحجز موارد طويلة + غير reentrant.

### القاعدة 5: انتبه من الـ Re-entry

إذا كان ISR ينفّذ بسرعة بطيئة، قد تحدث مقاطعة ثانية قبل الانتهاء. في CH32V003 بإمكانك تعطيل المقاطعات داخل ISR إذا أردت.

---

## 9. Software Interrupt — `wfi` و الإيقاظ

```c
__asm__ volatile ("wfi");
```

تعليمة RISC-V توقف الـ CPU إلى أن تأتي مقاطعة. تستخدم في:

- بعد كل عمل في `main()` لتوفير الطاقة.
- نمط `event-driven` نقي.

---

## 10. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| المعالج يتعلّق بعد المقاطعة | نسيت `__attribute__((interrupt))` | أضفه |
| المقاطعة تشتعل بلا توقف | لم تمسح علم peripheral | امسح في بداية ISR |
| `printf` يطبع نصف نص | استدعيته من ISR | لا تستدعِ printf من ISR |
| متغير لا يتحدث | نسيت `volatile` | أضف `volatile` |
| النظام بطيء | ISR يفعل عملاً طويلاً | حوّل العمل إلى flag + main |
| مقاطعة عالية الأولوية تفشل | لم تعطها أولوية أصغر رقماً | `NVIC_SetPriority(.., 0)` |

---

## 11. تمارين

1. **متغيّرات مشتركة**: متغير `counter` يُعدّ في ISR ويُقرأ في main. اضمن سلامة القراءة على 32-bit.
2. **أولويات**: مقاطعتان (SysTick + EXTI). تأكد أن EXTI تقاطع SysTick.
3. **Critical Section**: استخدم `__disable_irq()` لتعديل متغيّر 64-bit بأمان.
4. **Re-entry**: اصنع ISR طويل + قس عدد المقاطعات الضائعة.
5. **Software trigger**: استخدم `SysTick->CTLR |= (1 << 31)` (SWIE) لإطلاق مقاطعة برمجياً.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §6.1 "PFIC Main Features" — صفحة 32
  - §6.3 "Vector Table" — صفحات 32-33
  - §6.5.2 "PFIC Registers" — صفحات 35-46
- **QingKe V2 Processor Manual** — لمزيد من تفاصيل تعليمات `mret`, `wfi`, CSRs.
