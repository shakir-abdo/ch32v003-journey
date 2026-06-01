---
order: 8
slug: "l08-timers-pwm"
title: "المؤقّتات (TIM1/TIM2) و PWM"
title_en: "Timers + PWM"
icon: "i-lucide-waveform"
track: "io"
level: "beginner"
minutes: 30
tags: ["tim1", "pwm"]
---

# الدرس 08: المؤقّتات (TIM1 و TIM2) — PWM، Input Capture، Output Compare

> **المرجع:** CH32V003 RM v1.9
> - الفصل 10 "Advanced-control Timer (ADTM)" = TIM1 — صفحات 83–114
> - الفصل 11 "General-purpose Timer (GPTM)" = TIM2 — صفحات 114–138
>
> **العتاد:** CH32V003 + LED على TIM1_CH4 = PC4.

---

## 0. ما هو المؤقّت أصلاً؟

تخيّل **عدّاد رقمي** يدور تلقائياً بسرعة ساعة معيّنة. عندما يبلغ قيمة محدّدة (`ARR` = Auto-Reload Register)، إما يُطفئ/يشغّل دبوس، أو يطلق مقاطعة، أو يبدأ من جديد.

```

  CNT: 0 → 1 → 2 → ... → ARR → 0 → 1 → ...
                              ↑
                          إعادة + حدث
```

من هذه الفكرة البسيطة نبني:
- **PWM** (تحكم بسطوع LED أو سرعة محرّك).
- **Input Capture** (قياس مدة إشارة خارجية).
- **Output Compare** (إطلاق إشارة بعد زمن محدّد).
- **Counter** (عدّ نبضات من حساس).

---

## 1. الفرق بين TIM1 و TIM2

| الميزة | TIM1 (Advanced) | TIM2 (General) |
|--------|------------------|-----------------|
| القنوات | 4 + Complementary | 4 |
| Dead-time | ✅ | ❌ |
| Brake input | ✅ | ❌ |
| Encoder mode | ✅ | ✅ |
| الـ bus | APB2 | APB2 (CH32V003 الخاص) |
| الأشهر للـ | محركات BLDC, motor control | PWM عام, قياس |

> 📖 *RM, §11.2.2 "Difference between General and Advanced" — صفحة 115.*

في هذا الدرس سنركز على **TIM1** لتشغيل PWM على PC4.

---

## 2. مفاهيم أساسية يجب فهمها قبل أي كود

### PSC — Prescaler

يقسم ساعة الـ APB قبل إدخالها للعدّاد.

```
TIM_CLK = APB_CLK / (PSC + 1)
```

مثال: APB=48 MHz, PSC=47 → TIM_CLK = 48e6/48 = 1 MHz (1µs لكل tick).

### ARR — Auto-Reload (الحد الأقصى للعدّاد)

```
PWM Period = (ARR + 1) / TIM_CLK
PWM Freq   = TIM_CLK / (ARR + 1)
```

مثال: TIM_CLK=1MHz, ARR=999 → period=1ms, freq=1kHz.

### CCRx — Compare/Capture Register

في PWM، يحدّد **متى** يتغيّر مستوى الإشارة في كل دورة.

```
Duty cycle (%) = CCRx / (ARR + 1) × 100
```

مثال: ARR=999, CCRx=500 → 50% duty.

> 📖 *RM, §10.3.5 "PWM Output Mode" — صفحة 100.*

---

## 3. مثال هدف: PWM 1kHz بـ 50% على PC4

**معطيات**:
- SysCLK = 48 MHz
- نريد period = 1ms (1 kHz)
- نريد duty = 50%

**حسابات**:
- نختار TIM_CLK = 1 MHz → PSC = 48-1 = 47
- ARR = 1000-1 = 999 (لكل ms عند 1MHz)
- CCR4 = 500 (50%)

---

## 4. السجلات التي سنستخدمها

| السجل | العنوان | الوصف | RM ص. |
|-------|---------|--------|--------|
| `RCC_APB2PCENR` | `0x40021018` | تفعيل ساعة TIM1 + GPIO + AFIO | 21 |
| `GPIOC_CFGLR` | `0x40011000` | تهيئة PC4 كـ AF Push-Pull | 56 |
| `TIM1_PSC` | `0x40012828` | Prescaler 16-bit | 109 |
| `TIM1_ATRLR` | `0x4001282C` | Auto-Reload (ARR) | 110 |
| `TIM1_CH4CVR` | `0x40012840` | Compare value channel 4 | 111 |
| `TIM1_CHCTLR2` | `0x4001281C` | تهيئة قنوات 3 و 4 (وضع PWM) | 100 |
| `TIM1_CCER` | `0x40012820` | تفعيل القنوات (output enable) | 101 |
| `TIM1_BDTR` | `0x40012844` | Break & Dead-Time (MOE) | 112 |
| `TIM1_CTLR1` | `0x40012800` | التحكم العام (CEN) | 92 |

---

## 5. شرح بتات `CHCTLR2` للقناة 4 — PWM Mode

سجل `CHCTLR2` يتحكم بالقنوات 3 و 4. القناة 4 تشغل البتات `[15:8]`:

| البت(ات) | الحقل | الوظيفة |
|----------|--------|---------|
| `[15]`   | `OC4CE`    | Output Compare Clear Enable |
| `[14:12]`| `OC4M[2:0]`| وضع المقارنة (`110` = PWM Mode 1, `111` = PWM Mode 2) |
| `[11]`   | `OC4PE`    | Preload Enable — يحدّث `CH4CVR` في الـ update event |
| `[10]`   | `OC4FE`    | Fast Enable |
| `[9:8]`  | `CC4S[1:0]`| Capture/Compare select (`00` = output) |

> 📖 *RM, §10.4.8 "Compare/Capture Control Register 2" — صفحة 100.*

### العملية Bitwise لضبط PWM Mode 1 + Preload

```c
TIM1->CHCTLR2 = (TIM1->CHCTLR2 & ~(0xFF << 8))      // امسح بتات القناة 4
              | (0b110 << 12)                       // OC4M = PWM Mode 1
              | (1 << 11);                          // OC4PE = preload
```

**شرح**:

1. `0xFF << 8` = `0x0000_FF00` — قناع لبتات القناة 4 في CHCTLR2.
2. `&= ~...` ينظّف هذه البتات.
3. `0b110 << 12` يضع OC4M = 110 (PWM mode 1).
4. `1 << 11` يفعّل preload.
5. `|` يكتب القيمتين دون التأثير على القناة 3.

---

## 6. الكود الكامل

```c
#include "ch32v003fun.h"

void pwm_pc4_init(void) {
    // 1) ساعات: GPIOC + TIM1 + AFIO
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_TIM1 | RCC_APB2Periph_AFIO;

    // 2) PC4 = Alternate Function Push-Pull, 50 MHz
    GPIOC->CFGLR &= ~(0xF << (4 * 4));
    GPIOC->CFGLR |=  (0b1011 << (4 * 4));   // CNF=10 (AF-PP), MODE=11 (50MHz)

    // 3) TIM1 base time: PSC=47 → 1 MHz tick
    TIM1->PSC   = 48 - 1;
    TIM1->ATRLR = 1000 - 1;       // ARR لـ 1 kHz

    // 4) Channel 4 PWM Mode 1 + Preload
    TIM1->CHCTLR2 = (TIM1->CHCTLR2 & ~(0xFF << 8))
                  | (0b110 << 12)            // OC4M = PWM Mode 1
                  | (1 << 11);               // OC4PE = preload

    // 5) Output enable للقناة 4 (بت 12 في CCER)
    TIM1->CCER |= (1 << 12);                 // CC4E = 1

    // 6) Main Output Enable — مهم جداً لـ TIM1!
    TIM1->BDTR |= (1 << 15);                 // MOE = 1

    // 7) Duty cycle 50%
    TIM1->CH4CVR = 500;

    // 8) شغّل العدّاد
    TIM1->CTLR1 |= (1 << 0);                 // CEN = 1
}

int main(void) {
    SystemInit();
    pwm_pc4_init();
    while (1) __asm__("wfi");
}
```

> 🔑 **MOE (Main Output Enable) في TIM1 هو سبب صداع كثيرين**. بدونه، حتى إذا ضبطت كل شيء صحيحاً، لا تخرج إشارة! TIM2 لا يحتاج هذا البت.

---

## 7. تغيير السطوع تدريجياً (LED Fading)

```c
void fade_loop(void) {
    int dir = 1;
    uint16_t brightness = 0;

    while (1) {
        TIM1->CH4CVR = brightness;
        delay_ms(2);                 // SysTick من الدرس 06
        brightness += dir;
        if (brightness == 1000 || brightness == 0) dir = -dir;
    }
}
```

---

## 8. Input Capture — قياس مدة إشارة خارجية

نريد قياس فترة (period) إشارة قادمة على PC4 (TIM1_CH4):

```c
void input_capture_init(void) {
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_TIM1 | RCC_APB2Periph_AFIO;

    // PC4 = Input Floating (نستقبل إشارة خارجية)
    GPIOC->CFGLR &= ~(0xF << (4*4));
    GPIOC->CFGLR |=  (0b0100 << (4*4));   // CNF=01 (floating), MODE=00

    TIM1->PSC = 48 - 1;        // 1 MHz tick = 1µs دقة
    TIM1->ATRLR = 0xFFFF;       // أقصى حد

    // إعداد القناة 4 كـ Input Capture على CC4S=01
    // (في CHCTLR2 بتات [9:8] = CC4S)
    TIM1->CHCTLR2 = (TIM1->CHCTLR2 & ~(0x3 << 8)) | (0x1 << 8);

    // Rising edge polarity + enable (بت 13 = CC4P, بت 12 = CC4E)
    TIM1->CCER &= ~(1 << 13);     // CC4P=0 → rising
    TIM1->CCER |=  (1 << 12);     // CC4E=1

    TIM1->CTLR1 |= 1;             // CEN
}

uint32_t capture_period_us(void) {
    while (!(TIM1->INTFR & (1 << 4)));     // انتظر CC4IF
    uint32_t t1 = TIM1->CH4CVR;
    TIM1->INTFR &= ~(1 << 4);

    while (!(TIM1->INTFR & (1 << 4)));
    uint32_t t2 = TIM1->CH4CVR;
    TIM1->INTFR &= ~(1 << 4);

    return (t2 - t1) & 0xFFFF;    // wraparound-safe
}
```

> 📖 *RM, §10.3.1 "Input Capture Mode" — صفحة 96.*

---

## 9. خرائط القنوات الافتراضية في CH32V003

> 📖 *RM, الجدول 7-8 — صفحة 55.*

| TIM | CH1 | CH2 | CH3 | CH4 |
|-----|-----|-----|-----|-----|
| TIM1 (default) | PD2 | PA1 | PC3 | **PC4** |
| TIM1 (remap full) | PC4 | PC7 | PC5 | PD4 |
| TIM2 (default) | PD4 | PD3 | PC0 | PD7 |
| TIM2 (remap full) | PC5 | PC2 | PD2 | PC1 |

---

## 10. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| PWM لا يخرج رغم كل شيء صحيح | نسيت `BDTR.MOE = 1` على TIM1 | `TIM1->BDTR |= (1 << 15)` |
| التردد غير المتوقع | نسيت `-1` على PSC أو ARR | تذكر `actual = N - 1` |
| Duty cycle غير سلس | نسيت `OCxPE` (preload) | فعّله |
| الإشارة على pin خاطئ | نسيت Remap | اضبط `AFIO_PCFR1` |
| PWM mode 2 معكوس | اخترت `0b111` بالخطأ | استخدم `0b110` لـ PWM 1 |
| مقاطعة تشتعل بلا توقف | لم تمسح `TIM1->INTFR` | امسح في ISR |

---

## 11. تمارين

1. **3 قنوات PWM** بـ 3 سطوعات مختلفة على PC4, PC5, PD4.
2. **RGB LED**: استخدم 3 قنوات لتحريك لون عبر دائرة الألوان.
3. **Servo Motor**: PWM بـ 50Hz, duty 1-2ms لتحريك servo.
4. **Frequency Counter**: استخدم Input Capture لقياس تردد إشارة على PC4.
5. **Tone Generator**: PWM 50% duty بترددات مختلفة (لـ buzzer).
6. **Encoder Mode**: TIM2 في encoder mode لقراءة rotary encoder.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §10.2 "Principle and Structure" — صفحة 83
  - §10.3.5 "PWM Output Mode" — صفحة 100
  - §10.4 "Register Description (TIM1)" — صفحات 92-114
  - §11.4 "Register Description (TIM2)" — صفحات 119-138
  - الجدول 7-8 "TIM1 Alternate Function Remapping" — صفحة 55
