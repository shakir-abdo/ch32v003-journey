---
order: 14
slug: "l14-lowpower"
title: "أوضاع توفير الطاقة"
title_en: "Low-Power Modes"
icon: "i-lucide-battery-low"
track: "pro"
level: "advanced"
minutes: 40
tags: ["power", "sleep", "standby"]
---

# الدرس 14: أوضاع توفير الطاقة (Sleep, Standby, AWU)

> **المرجع:** CH32V003 RM v1.9 — الفصل 2 "Power Control (PWR)" — صفحات 4–10.
>
> **العتاد:** CH32V003 + LED + زر (للإيقاظ).

---

## 0. لماذا أوضاع الطاقة؟

في تطبيقات تعمل ببطارية (sensor node, remote control, IoT)، الـ CPU يكون نائماً 99% من الوقت. كلّ ميكروأمبير تُوفّره يطيل عمر البطارية:

| الوضع | الاستهلاك | متى يستخدم |
|------|------------|------------|
| Run @ 48 MHz | ~10 mA | عمل نشط |
| Sleep | ~3 mA | انتظار حدث قريب |
| Standby | **<10 µA** | انتظار طويل (دقائق-ساعات) |

---

## 1. الأوضاع الثلاثة

### Run Mode (العادي)
كل شيء يعمل. CPU + Flash + RAM + Clock.

### Sleep Mode
- CPU **يتوقف** (لا تنفيذ تعليمات).
- Flash + RAM + Peripherals **تعمل**.
- يستيقظ بأي مقاطعة.
- التوقيت بالنانوثوانٍ.

### Standby Mode
- كل شيء **مغلق** ماعدا (LSI + IWDG + AWU + EXTI).
- RAM والـ registers **تُفقد**.
- يستيقظ بـ NRST, WKUP pin, AWU, IWDG reset.
- التوقيت بالـ µs بعد الاستيقاظ.

> 📖 *RM, §2.3 "Low-power Modes" — صفحة 6.*

---

## 2. السجلات

| السجل | العنوان | الوصف | RM ص. |
|-------|---------|--------|--------|
| `PWR_CTLR` | `0x40007000` | إعدادات PWR العامة | 8 |
| `PWR_CSR` | `0x40007004` | الحالة (WUF, SBF) | 8 |
| `PWR_AWUCSR` | `0x40007008` | تحكم AWU | 9 |
| `PWR_AWUWR` | `0x4000700C` | قيمة المقارنة AWU (6 بتات) | 9 |
| `PWR_AWUPSC` | `0x40007010` | Prescaler AWU | 10 |

### بتات `PWR_CTLR` المهمة

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | LPDS | Low-power deep sleep |
| **1** | **PDDS** | Power-Down Deep Sleep — `1` = Standby, `0` = Sleep |
| 2 | CWUF | Clear wakeup flag |
| 3 | CSBF | Clear standby flag |
| 4 | PVDE | Programmable voltage detector |
| 7:5 | PLS | PVD level select |

### بت في QingKe core الخاص (`PFIC_SCTLR[2]`)

| البت | الاسم | المعنى |
|------|-------|--------|
| 2 | **SLEEPDEEP** | `0` = Sleep, `1` = Standby |

> ⚠️ السلوك يعتمد على **SLEEPDEEP + PDDS** معاً (انظر الجدول أدناه).

| SLEEPDEEP | PDDS | الوضع |
|-----------|------|--------|
| 0 | x | Sleep |
| 1 | 0 | Sleep-deep (نادر) |
| 1 | 1 | **Standby** |

---

## 3. Sleep Mode — أبسط

```c
#include "ch32v003fun.h"

void enter_sleep(void) {
    // امسح SLEEPDEEP
    PFIC->SCTLR &= ~(1 << 2);
    __asm__ volatile ("wfi");
}
```

النتيجة: CPU يتوقف. أي مقاطعة (SysTick, EXTI, UART RX, ...) توقظه فوراً.

> 💎 **هذا ما نستخدمه في معظم المشاريع**. الاستهلاك يهبط من 10mA إلى ~3mA بفضل تعطّل النواة.

---

## 4. Standby Mode — للنوم العميق

```c
void enter_standby(void) {
    // 1) فعّل PDDS
    PWR->CTLR |= (1 << 1);         // PDDS = 1 → Standby
    PWR->CTLR |= (1 << 2);         // CWUF: clear wakeup flag

    // 2) SLEEPDEEP في core
    PFIC->SCTLR |= (1 << 2);

    // 3) نوم
    __asm__ volatile ("wfi");
}
```

> ⚠️ بعد الاستيقاظ من Standby، **النظام يبدأ كأنه Reset**. الـ RAM ضاعت.

### كيفية معرفة أن الاستيقاظ كان من Standby

```c
if (PWR->CSR & (1 << 1)) {      // SBF
    // استيقظنا من Standby
    PWR->CTLR |= (1 << 3);       // CSBF
}
```

---

## 5. الإيقاظ بـ EXTI من زر

```c
// زر على PC2 يوقظ من Sleep (تلقائياً) أو Standby (عبر AWU/WKUP فقط)

void wakeup_button_init(void) {
    // PC2 = Input Pull-Up + EXTI Falling
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_AFIO;
    GPIOC->CFGLR &= ~(0xF << (4*2));
    GPIOC->CFGLR |=  (0x8 << (4*2));
    GPIOC->OUTDR |=  (1 << 2);

    AFIO->EXTICR = (AFIO->EXTICR & ~(0x3 << 4)) | (0x2 << 4);   // PC
    EXTI->INTENR |= (1 << 2);
    EXTI->FTENR  |= (1 << 2);
    NVIC_EnableIRQ(EXTI7_0_IRQn);
}

__attribute__((interrupt))
void EXTI7_0_IRQHandler(void) {
    EXTI->INTFR = (1 << 2);
    // الـ CPU استيقظ تلقائياً، نصبح هنا
}
```

---

## 6. AWU — Auto Wake-Up Timer

ميزة فريدة في CH32V003: ساعة منخفضة (LSI 128 kHz) توقظ الـ CPU من Standby كل فترة محددة.

> 📖 *RM, §2.3.4 "Auto-wakeup" — صفحة 7.*

### المعادلة

```
T_wakeup = (AWUWR + 1) × prescaler / 128000 seconds
```

prescaler يقع في `PWR_AWUPSC[3:0]`:

| AWUPSC | القيمة |
|--------|--------|
| 0001 | /2 |
| 0010 | /4 |
| 0011 | /8 |
| 0100 | /16 |
| 0101 | /32 |
| 0110 | /64 |
| **0111** | **/64** (الافتراضي) |
| 1000 | /128 |
| 1001 | /256 |
| 1010 | /512 |
| 1011 | /1024 |
| 1100 | /2048 |
| 1101 | /4096 |
| 1110 | /10240 |
| 1111 | /61440 |

### مثال: استيقاظ كل ثانية تقريباً

```
prescaler = 1024 (0b1011)
AWUWR    = 124    →  (124+1) × 1024 / 128000 ≈ 1.0 s
```

```c
void awu_init_1s(void) {
    // فعّل LSI (مصدر AWU)
    RCC->RSTSCKR |= (1 << 0);                 // LSION
    while (!(RCC->RSTSCKR & (1 << 1)));      // wait LSIRDY

    RCC->APB1PCENR |= (1 << 28);              // PWR clock

    // فعّل AWU
    PWR->AWUPSC = 0b1011;                      // /1024
    PWR->AWUWR  = 124;                         // ≈ 1 s
    PWR->AWUCSR = (1 << 1);                    // AWUEN

    // EXTI Line 9 (داخلية لـ AWU)
    EXTI->INTENR |= (1 << 9);
    EXTI->RTENR  |= (1 << 9);

    NVIC_EnableIRQ(AWU_IRQn);    // أو PWR_IRQn حسب الـ HAL
}

__attribute__((interrupt))
void AWU_IRQHandler(void) {
    EXTI->INTFR = (1 << 9);
    // نفّذ مهمتك ثم عُد للنوم
}
```

---

## 7. نمط "تشغيل دوري" نموذجي

```c
int main(void) {
    SystemInit();
    awu_init_1s();
    led_init();

    while (1) {
        // عمل سريع
        GPIOC->BSHR = (1 << 1);
        Delay_Us(100);
        GPIOC->BCR  = (1 << 1);

        // نَم حتى الاستيقاظ التالي
        enter_standby();
        // بعد الاستيقاظ من Standby، نبدأ من main!
    }
}
```

> 💡 إذا أردت تعمل بدون فقد الـ RAM، استخدم Sleep بدل Standby وضع `wfi` ببساطة.

---

## 8. PVD — Programmable Voltage Detector

يخبرك إذا VDD انخفض تحت حد معيّن:

```c
PWR->CTLR &= ~(0x7 << 5);
PWR->CTLR |= (0b101 << 5);    // PLS = 2.8V threshold
PWR->CTLR |= (1 << 4);        // PVDE
EXTI->INTENR |= (1 << 16);    // EXTI line 16 = PVD
```

مفيد لـ:
- حفظ بيانات حرجة قبل انقطاع التيار.
- تنبيه المستخدم بضعف البطارية.

> 📖 *RM, §2.2.2 — صفحة 5.*

---

## 9. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| `wfi` لا يستيقظ | كل المقاطعات معطّلة | فعّل واحدة على الأقل |
| Standby يدخل لكن لا يستيقظ | لم تفعّل AWU أو WKUP | تحقق منهما |
| الاستيقاظ سريع جداً | حساب AWUWR/prescaler خطأ | راجع المعادلة |
| الاستهلاك ما زال عالٍ | تركت GPIO floating | اضبط كل pin غير مستخدم كـ Analog أو IPU |
| الاستيقاظ من Standby + Reset | هذا طبيعي — الـ RAM فقدت | احفظ ما تريد في Backup |
| LSI لا يستقر | نسيت `LSION` | فعّله وانتظر `LSIRDY` |

---

## 10. تخفيض استهلاك إضافي

1. **اجعل كل GPIO غير مستخدم Input Pull-Up أو Analog** (تجنب floating).
2. **عطّل ساعة كل peripheral لا تستخدمه** (`RCC_APB...PCENR`).
3. **استخدم HSI بدل PLL** عند عدم الحاجة للسرعة (24MHz بدل 48).
4. **استخدم `wfi` في كل main loop** بدلاً من busy-wait.

---

## 11. تمارين

1. **Sleep Blink**: LED يومض، الـ CPU ينام بين الومضات.
2. **Wake by button**: ينام، يستيقظ بضغطة زر، يومض 5 مرات، يعود للنوم.
3. **Battery sensor**: AWU يوقظ كل 10 ثوانٍ، يقرأ Vref، يطبع mV عبر UART.
4. **Standby + RAM**: تحقق فعلياً أن RAM ضاعت بعد Standby.
5. **قس الاستهلاك** بـ multimeter دقيق: قبل وبعد التحسينات.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §2.2 "Power Management" — صفحة 4
  - §2.3 "Low-power Modes" — صفحات 6-7
  - §2.3.4 "Auto-wakeup (AWU)" — صفحة 7
  - §2.4 "Register Description" — صفحات 8-10
- **CH32V003 Datasheet** — لجداول الاستهلاك الفعلية.
