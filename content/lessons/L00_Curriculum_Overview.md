---
order: 0
slug: "l00-curriculum-overview"
title: "الخريطة الكاملة للمسار"
title_en: "Curriculum Overview"
icon: "i-lucide-map"
track: "foundation"
level: "beginner"
minutes: 20
tags: ["intro", "roadmap"]
---

# الدرس 00: منهج CH32V003 Bare-Metal — الخريطة الكاملة 🎓

> **النسخة المراجَعة** | المسارات والـ pinouts تم تدقيقها على *CH32V003 Reference Manual v1.9*.
> تصحيحات رئيسية: USART1 افتراضياً على **PD5/PD6** (وليس PA9/PA10 المنقول من STM32)،
> تذكير بـ Flash Latency عند 48 MHz، وتثبيت تردد HSI = **24 MHz**.

**المستوى المستهدف:** Full-stack developer عنده أساسيات C وبنى مكتبات `CH32V003` بمساعدة الذكاء الاصطناعي — يريد أن يفهم الـ registers بنفسه.

**الهدف:** الانتقال من *"أوجّه AI يكتب لي register manipulation"* إلى *"أنا أكتب السجلات بثقة وأفهم كل بت"*.

**المدة:** 3–4 أسابيع (كل مرحلة يومين إلى أسبوع).

---

## 📚 المرحلة ٠: المصادر الأساسية

قبل أن نبدأ، حمّل:

1. **CH32V003 Reference Manual (v1.9)** — أهم شي، فيه شرح كل register.
2. **CH32V003 Datasheet** — المواصفات الكهربائية والـ pinout.
3. **كود Mdot2Matrix** — مفتوح أمامك دائماً كمرجع.
4. **ch32v003fun** (اختياري) — مكتبة minimal مفيدة كقدوة، لكن نحن نكتب بالـ registers مباشرة.

### نصيحة ذهبية

كلّما تمر على register ما تفهمه → افتح الـ Reference Manual وابحث عنه. مع الوقت ستعرفهم كأنّهم رفاق درب.

### اختصارات سنستخدمها كثيراً

| الاختصار | المعنى |
|----------|--------|
| RCC | Reset and Clock Control |
| GPIO | General Purpose I/O |
| APB | Advanced Peripheral Bus |
| AHB | Advanced High-performance Bus |
| BSHR | Bit Set/Reset Register (الذرّي) |
| CFGLR | Configuration Low Register |

---

## 🟢 المرحلة الأولى: GPIO بالمكشوف (يومين)

**الهدف:** تفهم كيف تتحكم في pins مباشرة بدون دوال مساعدة.

### القراءة المطلوبة

- Reference Manual — الفصل 7 (GPIO + Alternate Function I/O).
- الصفحات الخاصة بـ `CFGLR`, `INDR`, `OUTDR`, `BSHR`, `BCR`, `LCKR`.

### Task 1.1 — Blink بدون مكتبات

اكتب برنامج يشغّل LED ويُطفئه كل 500ms باستخدام السجلات فقط:

```c
#include "ch32v003fun.h"

int main(void) {
    SystemInit();   // تعطيك HSI 24 MHz

    // TODO: شغّل clock الـ GPIOC عبر RCC->APB2PCENR
    // TODO: اضبط PC1 كـ output push-pull 50MHz (CFGLR)

    while (1) {
        // TODO: شغّل PC1 باستخدام BSHR
        Delay_Ms(500);
        // TODO: طفّي PC1 باستخدام BCR
        Delay_Ms(500);
    }
}
```

### Task 1.2 — ٣ LEDs على pins مختلفة

شغّل ٣ LEDs على `PC1, PC2, PC4` بنفس البرنامج — كل واحد يشتغل لحاله بالدور.

> 💡 على J4M6 (SO8) الأطراف المتاحة محدودة. تأكد من الـ datasheet أن الـ pin الذي اخترته فعلاً موجود على الـ package الخاص بك.

### Task 1.3 — LED Binary Counter

استخدم `OUTDR` مباشرة لعرض عداد 0–7 على 3 LEDs.

```c
for (uint8_t n = 0; n < 8; n++) {
    GPIOC->OUTDR = (GPIOC->OUTDR & ~0x16) | ((n & 0x7) << 1);
    Delay_Ms(500);
}
```

### الأسئلة

1. لماذا نستخدم `BSHR` بدل `OUTDR` كي نشغّل pin واحد؟
   - تلميح: `|=` مع `OUTDR` = read-modify-write (٣ تعليمات + ليست ذرية).
   - `BSHR = (1<<n)` = كتابة واحدة + ذرية.
2. ما الفرق بين `push-pull` و `open-drain`؟
3. كل pin ياخذ 4 bits في `CFGLR`. لماذا 4 بالضبط؟ (Hint: 2 MODE + 2 CNF.)

### التحقق

شغّل البرنامج ولاحظ الـ LEDs. إذا لم يعمل، أول شيء تتحقق منه: هل ساعة GPIOC مفعّلة؟

---

## 🟡 المرحلة الثانية: الساعات والمؤقتات (٣ أيام)

**الهدف:** تفهم Clock Tree + SysTick + PWM، وتنتقل من HSI 24 MHz إلى PLL 48 MHz.

### القراءة

- الفصل 3 (RCC) من الـ Reference Manual.
- الفصل 11 (SysTick).
- الفصل 14 (TIM1).

### Task 2.1 — التحويل إلى 48 MHz

> ⚠️ **نقطة كثيراً ما تُنسى:** عند التشغيل على > 24 MHz يجب إضافة **Flash wait state**، وإلا يتعطل النظام عشوائياً.

```c
void clock_48mhz(void) {
    // 1) HSI ready (افتراضي شغال)
    while (!(RCC->CTLR & RCC_HSIRDY));

    // 2) PLL source = HSI (CH32V003 يضرب ×2 ثابت)
    RCC->CFGR0 &= ~RCC_PLLSRC;

    // 3) PLL on + ready
    RCC->CTLR |= RCC_PLLON;
    while (!(RCC->CTLR & RCC_PLLRDY));

    // 4) Flash latency = 1 wait state
    FLASH->ACTLR = (FLASH->ACTLR & ~FLASH_ACTLR_LATENCY) | FLASH_ACTLR_LATENCY_1;

    // 5) SYSCLK = PLL
    RCC->CFGR0 = (RCC->CFGR0 & ~RCC_SW) | RCC_SW_PLL;
    while ((RCC->CFGR0 & RCC_SWS) != RCC_SWS_PLL);
}
```

### Task 2.2 — SysTick Blink (بدون Delay_Ms)

```c
volatile uint32_t ticks = 0;

void SysTick_Handler(void) __attribute__((interrupt));
void SysTick_Handler(void) {
    ticks++;
    SysTick->SR = 0;  // مسح علم الـ count
    // TODO: كل 500 tick = شغّل/طفّي الـ LED
}
```

> 💡 على CH32V003 الـ SysTick هو SysTick_QingKe (مش ARM Cortex-M). الـ counter 32-bit مع `CMP` للمقارنة. اقرأ الفصل 11 بدقّة.

### Task 2.3 — PWM على TIM1_CH4 = PC4

```c
// تفعيل الساعات
RCC->APB2PCENR |= RCC_APB2Periph_GPIOC | RCC_APB2Periph_TIM1;

// PC4 كـ Alternate Function Push-Pull
GPIOC->CFGLR &= ~(0xF << (4*4));
GPIOC->CFGLR |=  (GPIO_CNF_OUT_PP_AF | GPIO_Speed_50MHz) << (4*4);

// PWM @ 48MHz / 256 / (PSC+1)
TIM1->ATRLR = 255;       // ARR (auto-reload)
TIM1->CH4CVR = 128;      // 50% duty
TIM1->CHCTLR2 |= (0b110 << 12);  // OC4M = PWM mode 1
TIM1->CCER  |= TIM_CC4E;          // Channel 4 enable
TIM1->BDTR  |= TIM_MOE;           // Main output enable (مهم لـ TIM1!)
TIM1->CTLR1 |= TIM_CEN;           // Counter enable
```

### Task 2.4 — LED Fading

اربط الـ PWM مع لوب يغيّر `TIM1->CH4CVR` ببطء (0→255→0) كي تسوي fade in/out.

### الأسئلة

1. ما فايدة `__attribute__((interrupt))`؟ (Hint: save/restore registers + `mret`).
2. لماذا يجب أن تكتب `volatile` للمتغيرات الذي تتغير داخل interrupt؟
3. كيف تستطيع تحكم في تردد PWM دون أن تغيّر الـ duty cycle؟ (Hint: `PSC` أو `ARR`).
4. لماذا `TIM1` يحتاج `BDTR.MOE = 1` بينما `TIM2` لا يحتاج؟

---

## 🟠 المرحلة الثالثة: UART على السجلات (يومين)

**الهدف:** تتواصل مع الكمبيوتر بدون دوال جاهزة.

> ⚠️ **نقطة تصحيح من النسخة السابقة:** الـ USART1 الافتراضي على `CH32V003` هو **TX = PD5, RX = PD6** — وليس PA9/PA10 (تلك مواصفة STM32). على الـ J4M6 (SO8) أصلاً لا يوجد PA9. اقرأ الفصل 7، جدول 7-10 (USART1 Alternate Function Remapping).

### خريطة USART1 (من الـ RM)

| Mapping | TX | RX | CK | CTS | RTS | RM1:RM[0] |
|---------|------|------|------|-------|-------|------------|
| Default | **PD5** | **PD6** | PD4 | PD3 | PC2 | 0:00 |
| Remap 1 | PD0 | PD1 | PD7 | PC3 | PC2 | 0:01 |
| Remap 2 | PD6 | PD5 | PD7 | PC6 | PC7 | 1:00 |
| Remap 3 | PC0 | PC1 | PC5 | PC6 | PC7 | 1:01 |

### Task 3.1 — Hello World عبر USART1

```c
void uart_init_115200(void) {
    // ساعات
    RCC->APB2PCENR |= RCC_APB2Periph_USART1 | RCC_APB2Periph_GPIOD | RCC_APB2Periph_AFIO;

    // PD5 = TX (AF Push-Pull, 50MHz)
    GPIOD->CFGLR &= ~(0xF << (4*5));
    GPIOD->CFGLR |=  (GPIO_CNF_OUT_PP_AF | GPIO_Speed_50MHz) << (4*5);

    // PD6 = RX (Input Floating)
    GPIOD->CFGLR &= ~(0xF << (4*6));
    GPIOD->CFGLR |=  (GPIO_CNF_IN_FLOATING) << (4*6);

    // BRR لـ 115200 على APB2 = 48 MHz
    // BRR = APB2 / Baud = 48e6 / 115200 ≈ 416 = 0x1A0
    USART1->BRR = 0x1A0;

    // تفعيل USART, TX, RX
    USART1->CTLR1 |= USART_CTLR1_UE | USART_CTLR1_TE | USART_CTLR1_RE;
}

void uart_putc(char c) {
    while (!(USART1->STATR & USART_STATR_TXE));
    USART1->DATAR = c;
}

void uart_puts(const char *s) {
    while (*s) uart_putc(*s++);
}

int main(void) {
    clock_48mhz();
    uart_init_115200();
    while (1) {
        uart_puts("Hello World\r\n");
        Delay_Ms(1000);
    }
}
```

### Task 3.2 — UART Echo

استقبل أي حرف وأرسله مرة ثانية:

```c
while (1) {
    if (USART1->STATR & USART_STATR_RXNE) {
        uint8_t c = USART1->DATAR;
        uart_putc(c);
    }
}
```

### Task 3.3 — UART Command

استقبل أمر من حرف واحد: `'1'` يشغّل LED، `'0'` يُطفئه، `'t'` يبدّل.

### الأسئلة

1. كيف تحسب قيمة `BRR`؟ (المعادلة: `BRR = f_PCLK / Baud`).
2. ما الفرق بين `polling` و `interrupt` في الاستقبال؟ متى تختار أيهما؟
3. لماذا `TX (PD5)` يحتاج `Alternate Function Push-Pull` وليس `Output Push-Pull` عادي؟
4. لماذا فعّلنا ساعة `AFIO` رغم أننا لم نستخدم Remap؟ (Hint: في بعض الإصدارات ضرورية حتى للـ default mapping؛ تحقق من إصدار الـ RM لديك).

---

## 🔴 المرحلة الرابعة: WS2812B — معركة النانوثانية! (٣ أيام)

**الهدف:** تفهم الـ bit-banging الخاصّ بـ WS2812B الذي أنت كتبته بمساعدة الذكاء الاصطناعي.

### تقنية النانوثانية

WS2812B يحتاج توقيت دقيق جداً (specs الأصلية ± تسامح ~150ns):

| البت | High (T1H) | Low (T1L) | الإجمالي |
|------|------------|-----------|-----------|
| `1` | **800 ns** | 450 ns | 1.25 µs |
| `0` | **400 ns** | 850 ns | 1.25 µs |
| Reset | — | ≥ 50 µs | — |

على CH32V003 بسرعة **48 MHz**: كل دورة ≈ **20.83 ns**. التعليمة `nop` غالباً 1 دورة، لكن قد تتأثر بـ pipeline. الأفضل تقيس بالـ logic analyzer.

> 💡 حساب سريع: 800 ns ÷ 20.83 ns/cycle ≈ **38 cycles** لـ T1H.

### Task 4.1 — قس التوقيت

استخدم oscilloscope أو logic analyzer:

- كم مدة `nop` واحدة فعلياً على 48 MHz؟
- انظر الفرق بين `send_bit` و `send_bit_2` في كودك القديم.

### Task 4.2 — اعد كتابة `send_bit` من الصفر

اكتب `send_bit` بنفسك بدون AI:

```c
static inline void send_bit(uint8_t bit) {
    if (bit) {
        led_port->BSHR = led_pin_mask;   // HIGH
        // ~ 38 nops لـ 800ns
        __asm__ volatile (
            "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
            // ... كرر حتى تصل إلى ~38
        );
        led_port->BCR = led_pin_mask;    // LOW
        // ~ 21 nops لـ 450ns
    } else {
        led_port->BSHR = led_pin_mask;   // HIGH
        // ~ 19 nops لـ 400ns
        led_port->BCR = led_pin_mask;    // LOW
        // ~ 40 nops لـ 850ns
    }
}
```

### Task 4.3 — حرّك Pixel واحد

شغّل WS2812B واحد وتنقّل بين الأحمر والأخضر والأزرق كل ثانية.

### الأسئلة

1. لماذا كودك فيه `send_bit` و `send_bit_2`؟ ما الفرق؟
2. لماذا الزم نعطّل المقاطعات (`csrci mstatus, 8` على RISC-V) أثناء إرسال البيانات؟
3. إذا أردتُ تشغّل 16 LED بدل 5، ماذا سيصير للتوقيت؟ (Hint: لاتنسي T_reset بين الإطارات).

---

## 🟣 المرحلة الخامسة: Matrix Multiplexing (أسبوع)

**الهدف النهائي:** تبني LED matrix تشتغل بنفس مبدأ Mdot2Matrix.

### Task 5.1 — 3x3 Matrix ثابت

ابنِ 3×3 LED matrix (9 LEDs مع 6 pins فقط: 3 صفوف + 3 أعمدة). ارسم شكل X في المنتصف.

### Task 5.2 — Matrix Scan مع SysTick

استخدم SysTick interrupt لتشغيل multiplexing — الصف الواحد يُنوَّر في كل tick. تردد المسح يجب أن يكون ≥ 60 Hz لتجنب الـ flicker.

### Task 5.3 — Double Buffering

أضف double buffer: ترسم في buffer والـ interrupt يعرض من الآخر.

### الأسئلة

1. لماذا نحتاج multiplexing بدل ما نشبك كل LED في pin مستقل؟
2. ما فايدة الـ double buffering؟
3. ما الذي يحدث إذا كان الـ SysTick أبطأ من اللازم؟ أسرع من اللازم؟

---

## 🏆 المشروع النهائي

ابنِ LED matrix 5×5 (تستطيع ستخدم 25 WS2812B أو LEDs عادية مع multiplexing) تعرض:

- اسمك "SHAKIR" حرف حرف (scrolling).
- أنيميشن بسيط (قلب ينبض ❤).
- تتحكم فيها عبر UART (`r` = red, `g` = green, الخ).

---

## 📋 ملاحظات للمسار

1. **كل مرحلة:** اقرأ الـ Reference Manual أولاً، ثم طبّق، ثم جاوب الأسئلة.
2. **الـ oscilloscope/logic-analyzer صديقك:** استخدمه دائماً للتحقق من الإشارات (خاصة في WS2812B).
3. **لا تستخدم AI في الكتابة:** استخدمه للسؤال والشرح فقط — الكتابة بإيدك.
4. **خطأ؟ عادي:** الـ CH32V003 ما ينحرق بسهولة. ولو انحجز (locked)، عندك `minichlink -u` للـ unbrick.
5. **سجّل تقدّمك:** بعد كل task، اكتب جملة واحدة عن "ما تعلمت" في ملف progress.

---

## 📖 المصادر

- *CH32V003 Reference Manual v1.9* — `./CH32V003RM.txt`
- *CH32V003 Datasheet* — موقع WCH.
- *ch32v003fun* repo — مثال minimal للـ startup + linker.
- *Mdot2Matrix* — https://github.com/bitluni/Mdot2Matrix
