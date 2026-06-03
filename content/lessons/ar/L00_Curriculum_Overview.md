---
order: 0
slug: "l00-curriculum-overview"
title: "الخريطة الكاملة للمسار"
title_en: "Curriculum Overview"
icon: "i-lucide-map"
track: "foundation"
level: "beginner"
minutes: 15
tags: ["intro", "roadmap"]
---

# الدرس 00: خريطة المنهج 🗺

مرحباً. هذا المنهج رحلة من 22 درساً تأخذك من سطر `Blinky` الأول إلى بناء firmware احترافي على المتحكّم **CH32V003J4M6** — كل ذلك على مستوى السجلات، بلا HAL ولا مكتبات وسيطة، مع إشارات صريحة إلى صفحات Reference Manual في كل خطوة.

---

## ❓ لمن هذا المنهج؟

- **مطوّر** يعرف أساسيات لغة C ويريد فهم العتاد من الأسفل إلى الأعلى.
- **هاوي إلكترونيات** يَعبر من Arduino إلى عالم السجلات والـ bit manipulation.
- **طالب علوم حاسب** يطلب تطبيقاً عمليّاً للـ RISC-V.
- **كلّ مَن مَلَّ من القراءة وأراد البناء**.

**الهدف الجوهري**: الانتقال من *"أُملي على الذكاء الاصطناعي ليكتب لي السجلات"* إلى *"أكتب السجلات بنفسي وأفهم كل بِت"*.

---

## 🛠 فلسفة الكتابة — Bare-Metal خالص

كل أمثلة الكود في هذا المنهج تتبع نمطاً واحداً صارماً:

- **لا `#include "ch32v003fun.h"`** ولا أي إطار. نُعرّف كل سجل بأنفسنا.
- **لا `SystemInit()`، لا `Delay_Ms()`، لا `NVIC_EnableIRQ()`** — نكتب على السجلات مباشرة.
- **كل عنوان مرئي**: مثلاً `#define RCC_APB2PCENR (*(volatile u32*)(0x40021018))`، لا `RCC->APB2PCENR` خلف struct.
- **كل بت معروف**: مثلاً `(1u << 4)  /* IOPCEN */`، لا `RCC_APB2Periph_GPIOC` غامض.
- **التأخير يدوي** قبل [L06 SysTick](/lessons/l06-systick): `void delay(volatile u32 c) { while(c--); }`. وبعد L06 نستخدم العدّاد العتادي.

> 🎯 **لماذا؟** الهدف من المنهج أن تفهم *العتاد*، لا أن تتقن إطاراً معيناً. عندما تكتب العنوان `0x40021018` بنفسك، تعرف بالضبط ما يحصل. الـ struct والـ macros تخفي هذا.

---

## 📚 قبل أن نبدأ — حمّل هذه

1. **CH32V003 Reference Manual (v1.9)** — السلطة. مرجعك في كل سؤال.
2. **CH32V003 Datasheet** — للمواصفات الكهربائية والـ pinout.
3. **ch32v003fun** — مكتبة minimal للمعرفة كقدوة (لن نستعملها مباشرة، لكنّ مصدرها مرجع نظيف).
4. **WCH-LinkE** — المُبرمِج الرسمي من WCH. مع شريحة جاهزة على breadboard، السعر الإجمالي أقلّ من 3 دولارات. انظر [صفحة المصادر](/resources) للتفاصيل.

> 💡 **النصيحة الذهبية**: كلّما مررت بسجلٍّ لا تفهمه، افتح الـ RM وابحث عنه فوراً. مع الوقت ستحفظ السجلات كأنّها رفاق درب.

---

## 🛤 المسارات السبعة

المنهج مقسوم إلى سبعة مسارات، يبني كلٌّ منها على ما قبله.

---

### 🟢 المسار الأوّل: **Foundation** — الأساسيات

**كل ما تحتاج معرفته قبل أن تكتب bit واحد على عتاد حقيقي.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L00](/lessons/l00-curriculum-overview) | الخريطة | (أنت هنا) | 15 د |
| [L01](/lessons/l01-bitwise-magic) | دليل السحر — العمليات على البتات | `<<`, `&`, `\|`, `~`, `^` بحدسٍ بصري | 20 د |
| [L02](/lessons/l02-registers-intro) | الـ Registers و Bit Operations | المفهوم العتاديّ، MMIO، RCC | 20 د |
| [L03](/lessons/l03-gpio-output) | GPIO كـ Output — مشروع Blinky | تشغيل LED على PC1 بالسجلات المجرّدة | 20 د |

---

### 🔵 المسار الثاني: **Core I/O** — دخل/خرج النواة

**كل ما يجعل المعالج "حيّاً" — مقاطعات، توقيت، مؤقّتات، وقراءة الأزرار.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L04](/lessons/l04-gpio-input) | GPIO كـ Input + EXTI | الأزرار، pull-ups الداخلية، debouncing | 30 د |
| [L05](/lessons/l05-clock-system) | نظام الساعة (RCC) | HSI / HSE / PLL، الانتقال إلى 48 MHz | 30 د |
| [L06](/lessons/l06-systick) | SysTick — التوقيت بدون حظر المعالج | عدّاد 32-بت + millis() + wfi | 30 د |
| [L07](/lessons/l07-nvic-pfic) | PFIC — وحدة المقاطعات | Vector Table، الـ ISRs، الأولويات | 30 د |
| [L08](/lessons/l08-timers-pwm) | TIM1 / TIM2 — PWM + Input Capture | Output Compare، Encoder mode | 30 د |

---

### 🟣 المسار الثالث: **Comms** — بروتوكولات الاتصال

**ربط المتحكّم بالعالم الخارجي.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L09](/lessons/l09-uart-deep) | UART العميق | Interrupts + Ring Buffer + printf مخصّص | 35 د |
| [L10](/lessons/l10-spi) | SPI — Master mode | حسّاسات سريعة، ذواكر EEPROM | 35 د |
| [L11](/lessons/l11-i2c-oled) | I2C + تشغيل OLED SSD1306 | نص حيّ على شاشة | 35 د |

---

### 🟡 المسار الرابع: **Analog** — الإشارات التماثلية

**قراءة الجهد والنقل السريع للبيانات.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L12](/lessons/l12-adc) | ADC — قراءة الحساسات التماثلية | Potentiometer، Temp Sensor الداخلي | 35 د |
| [L13](/lessons/l13-dma) | DMA — نقل بدون CPU | ADC streaming، UART async | 35 د |

---

### 🔴 المسار الخامس: **Pro** — مهارات احترافية

**كل ما يميّز firmware جادّ عن مشروع هاوي.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L14](/lessons/l14-lowpower) | أوضاع توفير الطاقة | Sleep، Standby، AWU — للبطاريات | 40 د |
| [L15](/lessons/l15-watchdog) | IWDG و WWDG | إعادة الإنعاش الذاتي لأنظمة الإنتاج | 40 د |
| [L16](/lessons/l16-flash) | Flash Programming + EEPROM emulation | حفظ الإعدادات بعد الـ Reset | 40 د |
| [L17](/lessons/l17-linker-startup) | Linker Script + Startup العميق | `link.ld`، Vector Table، ما قبل main() | 40 د |
| [L18](/lessons/l18-debugging) | Debugging بلا printf | minichlink، GDB، LED breadcrumbs | 40 د |

---

### 🟠 المسار السادس: **Bonus** — تقنيات متقدّمة

**عرض كل ما تعلّمناه بسيطرة على إشارات النانوثانية والـ matrices.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L19](/lessons/l19-ws2812b) | WS2812B — معركة النانوثانية | Bit-banging دقيق، تعطيل المقاطعات، nop counting | 45 د |
| [L20](/lessons/l20-matrix-multiplexing) | Matrix Multiplexing | شبكة LEDs مع SysTick scan + double buffering | 45 د |

---

### 🏆 المسار السابع: **Capstone** — المشروع النهائي

**تركيب كل المعرفة في firmware يعمل ويُعرَض.**

| # | الدرس | الموضوع | المدّة |
|---|------|---------|-------|
| [L21](/lessons/l21-final-project) | المشروع النهائي | لوحة LED 5×5 + UART + Flash + Watchdog | 90 د |

---

## 🧭 ترتيب القراءة المُوصى به

```
                   L00 ───┐  (أنت هنا)
                          ▼
   Foundation:  L01 → L02 → L03               ← 3 أيّام
                          │
                          ▼
   Core I/O:    L04 → L05 → L06 → L07 → L08   ← 5 أيّام
                          │
                          ▼
   Comms:          L09 → L10 → L11            ← 3 أيّام
                          │
                          ▼
   Analog:            L12 → L13               ← 2 يوم
                          │
                          ▼
   Pro:        L14 → L15 → L16 → L17 → L18    ← 5 أيّام
                          │
                          ▼
   Bonus:            L19 → L20                ← 3 أيّام
                          │
                          ▼
   Capstone:             L21                  ← 2-3 أيّام
```

**الإجمالي**: حوالي 4 أسابيع بمعدّل ساعة في اليوم. يمكن أسرع لمن يكرّس وقتاً، وأبطأ لمن يأخذ راحته.

---

## 📋 قواعد المسار

1. **اقرأ الـ Reference Manual أوّلاً، ثم طبّق، ثم جاوب الأسئلة.** لا تتسرّع.
2. **الـ oscilloscope/logic-analyzer صديقك.** خاصةً في WS2812B والـ Matrix.
3. **لا تستعمل الذكاء الاصطناعي في الكتابة.** استعمله للسؤال والشرح — أمّا الكتابة فبيدك.
4. **خطأ؟ عاديّ.** الـ CH32V003 لا يحترق بسهولة. لو "تَجَمَّد" (lock)، عندك [ch32v003-unbrick](https://github.com/shakir-abdo/ch32v003-unbrick) ينقذه.
5. **سَجِّل تقدُّمك.** بعد كل درس، اكتب جملة في ملف `progress.md` خاصّ بك عن "ما تعلمت".

---

## 🧰 العتاد المطلوب

| العنصر | الاستخدام |
|---------|-----------|
| CH32V003J4M6 (أو F4P6) | المتحكّم |
| WCH-LinkE | برمجة و debug |
| LED + مقاومة 220Ω | كل درس تقريباً |
| Push-button | L04 وما بعدها |
| USB-UART (CH340/FTDI) | L09 وما بعدها |
| SSD1306 OLED 128×64 | L11 |
| Potentiometer 10kΩ | L12 |
| WS2812B (LED واحد على الأقل) | L19 |
| 9 LEDs عاديّة | L20 و L21 |

التفاصيل والصور في [صفحة المصادر](/resources).

---

## 📖 المصادر الأساسية

- **CH32V003 Reference Manual v1.9** — الكتاب المقدّس.
- **CH32V003 Datasheet** — للمواصفات الكهربائية والـ pinout الفعليّ.
- **[ch32v003fun](https://github.com/cnlohr/ch32v003fun)** — مكتبة Charles Lohr، استلهام نظيف للـ startup والـ linker.
- **[Mdot2Matrix](https://github.com/bitluni/Mdot2Matrix)** — مشروع `bitluni` للـ LED matrix، تطبيق فعليّ لما يُدرَّس هنا.
- **[ch32v003j4m6-libraries](https://github.com/shakir-abdo/ch32v003j4m6-libraries)** — مشروعي الموازي: مكتبات على مستوى السجلات للحسّاسات الشائعة.

---

> 🚀 **جاهز؟** ابدأ من [الدرس 01: دليل الساحر](/lessons/l01-bitwise-magic).
