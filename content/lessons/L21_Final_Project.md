---
order: 21
slug: "l21-final-project"
title: "المشروع النهائي — لوحة LED + UART"
title_en: "Final Project — LED Matrix + UART"
icon: "i-lucide-flag"
track: "capstone"
level: "advanced"
minutes: 90
tags: ["project"]
---

# الدرس 21: المشروع النهائي — لوحة عرض LED بتحكم UART

> **العتاد المطلوب:**
> - CH32V003J4M6
> - مصفوفة 5×5 LEDs (إما 25× LED عادية + درايفر، أو شريط WS2812B بـ 25 بكسل)
> - USB-UART adapter (CH340/FTDI)
> - زر ضغط
> - مقاومات وأسلاك

---

## 0. هدف المشروع

نبني نظاماً متكاملاً يستعمل **كلّما تعلّمناه** في الدروس السابقة:

1. **GPIO** — للـ LEDs و الزر (L03, L04)
2. **SysTick** — تحديث العرض كل 1ms (L06)
3. **Interrupts** — الزر يبدّل النمط فوراً (L07)
4. **Timers** — PWM للتحكم في السطوع العام (L08)
5. **UART** — استقبال أوامر من PC (L09)
6. **Flash** — حفظ آخر نمط بعد إعادة التشغيل (L16)
7. **Watchdog** — ضمان عدم تعلّق النظام (L15)
8. **Low Power** — وضع نوم بين الأوامر (L14)

---

## 1. تخطيط الأطراف

| الإشارة | Pin | الدور |
|---------|-----|------|
| Rows[0..4] | PC0..PC4 | صفوف Matrix (Output Push-Pull) |
| Cols[0..4] | PD0..PD4 | أعمدة (Output) |
| UART TX | PD5 | إخراج للـ host |
| UART RX | PD6 | إدخال من host |
| Button | PD7 | تبديل نمط (EXTI) |
| LED status | PA1 | نبض القلب |

> 💡 على J4M6 الأطراف محدودة. تكييف التخطيط للحزمة المتوفّرة لديك ضروري.

---

## 2. البنية البرمجية

```
        ┌─────────────────────────┐
        │   main loop             │
        │  - process commands     │
        │  - update state         │
        │  - sleep (wfi)          │
        └────────┬────────────────┘
                 │
   ┌─────────────┼─────────────┬─────────────┐
   ▼             ▼             ▼             ▼
SysTick        EXTI          USART1         IWDG
1ms tick    button press   rx interrupt    timeout
   │             │             │             │
update        pattern      parse char      reset!
matrix        toggle       add to buf
```

---

## 3. الـ State Machine الرئيسي

```c
typedef enum {
    PATTERN_OFF = 0,
    PATTERN_HEART,
    PATTERN_X,
    PATTERN_SCROLL_TEXT,
    PATTERN_COUNT
} pattern_t;

typedef struct {
    pattern_t current;
    uint8_t   brightness;     // 0-255
    char      text[16];       // نص للـ scroll
    uint32_t  last_update;
} display_state_t;

display_state_t state;
```

---

## 4. الـ Matrix Multiplexing

```c
const uint8_t patterns[PATTERN_COUNT][5] = {
    [PATTERN_OFF]   = {0x00, 0x00, 0x00, 0x00, 0x00},
    [PATTERN_HEART] = {0x0A, 0x1F, 0x1F, 0x0E, 0x04},  // ❤
    [PATTERN_X]     = {0x11, 0x0A, 0x04, 0x0A, 0x11},  // X
};

volatile uint8_t active_pattern[5];   // ما يُعرض حالياً
volatile uint8_t current_row = 0;

void __attribute__((interrupt))
SysTick_Handler(void) {
    STK_SR = 0;

    // أطفئ الصف السابق
    GPIOC_BCR = 0b11111;

    // اضبط أعمدة الصف الجديد
    uint8_t cols = active_pattern[current_row];
    GPIOD_OUTDR = (GPIOD_OUTDR & ~0b11111) | (cols & 0b11111);

    // شغّل الصف الجديد
    GPIOC_BSHR = (1 << current_row);

    current_row = (current_row + 1) % 5;
}
```

> 💡 على 1ms tick × 5 صفوف = refresh 200Hz → بدون flicker مرئي.

---

## 5. التحكم بالسطوع عبر PWM Global

```c
void brightness_init(void) {
    RCC_APB2PCENR |= (1u << 11) /* TIM1EN */;
    TIM1_PSC = 48 - 1;        // 1MHz
    TIM1_ATRLR = 255;
    TIM1_CHCTLR1 = (0b110 << 4);   // CH1 PWM mode 1
    TIM1_CCER  = (1 << 0);
    TIM1_BDTR  = (1 << 15);   // MOE
    TIM1_CH1CVR = state.brightness;
    TIM1_CTLR1 = 1;
}
```

ثم سلك TIM1_CH1 (PD2) كـ Enable العام للـ matrix transistor.

---

## 6. UART Command Parser

```c
char cmd_buf[32];
uint8_t cmd_len = 0;

void process_cmd(void) {
    cmd_buf[cmd_len] = 0;

    if (strcmp(cmd_buf, "heart") == 0) {
        state.current = PATTERN_HEART;
    } else if (strcmp(cmd_buf, "x") == 0) {
        state.current = PATTERN_X;
    } else if (strcmp(cmd_buf, "off") == 0) {
        state.current = PATTERN_OFF;
    } else if (strncmp(cmd_buf, "bright ", 7) == 0) {
        state.brightness = atoi(cmd_buf + 7);
        TIM1_CH1CVR = state.brightness;
    } else if (strncmp(cmd_buf, "text ", 5) == 0) {
        strncpy(state.text, cmd_buf + 5, 15);
        state.current = PATTERN_SCROLL_TEXT;
    } else if (strcmp(cmd_buf, "save") == 0) {
        save_state_to_flash();
        uart_puts("Saved\r\n");
    } else if (strcmp(cmd_buf, "?") == 0) {
        uart_puts("Cmds: heart, x, off, bright N, text S, save\r\n");
    } else {
        uart_puts("Unknown cmd. Try '?'\r\n");
    }

    memcpy((uint8_t*)active_pattern, patterns[state.current], 5);
    cmd_len = 0;
}

void __attribute__((interrupt))
USART1_IRQHandler(void) {
    if (USART1_STATR & (1 << 5)) {
        uint8_t c = USART1_DATAR;
        uart_putc(c);   // echo
        if (c == '\r' || c == '\n') {
            uart_putc('\n');
            process_cmd();
        } else if (cmd_len < 31) {
            cmd_buf[cmd_len++] = c;
        }
    }
}
```

---

## 7. الزر يبدّل النمط

```c
void __attribute__((interrupt))
EXTI7_0_IRQHandler(void) {
    if (EXTI_INTFR & (1 << 7)) {
        EXTI_INTFR = (1 << 7);
        state.current = (state.current + 1) % PATTERN_COUNT;
        memcpy((uint8_t*)active_pattern, patterns[state.current], 5);
    }
}
```

---

## 8. حفظ الحالة في Flash

```c
#define STATE_ADDR 0x00003FC0

typedef struct {
    uint16_t magic;
    uint8_t  pattern;
    uint8_t  brightness;
} saved_state_t;

void save_state_to_flash(void) {
    flash_erase_page(STATE_ADDR);
    saved_state_t s = {0xC003, state.current, state.brightness};
    uint16_t *p = (uint16_t *)&s;
    for (int i = 0; i < sizeof(s)/2; i++) {
        flash_write_halfword(STATE_ADDR + i*2, p[i]);
    }
    flash_lock();
}

void load_state_from_flash(void) {
    saved_state_t *s = (saved_state_t *)STATE_ADDR;
    if (s->magic == 0xC003) {
        state.current    = s->pattern;
        state.brightness = s->brightness;
    } else {
        state.current = PATTERN_HEART;
        state.brightness = 128;
    }
}
```

---

## 9. main()

```c
int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    clock_48mhz();          // L05 من Clock Guide

    gpio_init_matrix();
    uart_init(115200);
    button_exti_init();
    brightness_init();
    systick_init();         // 1ms tick
    iwdg_init(3999, 3);     // 1s watchdog

    load_state_from_flash();
    memcpy((uint8_t*)active_pattern, patterns[state.current], 5);

    uart_puts("CH32V003 Matrix ready. '?' for help.\r\n");

    while (1) {
        iwdg_feed();
        __asm__ volatile ("wfi");    // نَم حتى المقاطعة
    }
}
```

---

## 10. نمط Scroll Text (تمرين متقدم)

```c
extern const uint8_t font5x5[][5];   // font صغير

uint8_t scroll_buf[200];
uint16_t scroll_pos = 0;
uint16_t scroll_len = 0;

void build_scroll_buf(const char *text) {
    scroll_len = 0;
    while (*text && scroll_len < 195) {
        for (int col = 0; col < 5; col++) {
            scroll_buf[scroll_len++] = font5x5[*text - 32][col];
        }
        scroll_buf[scroll_len++] = 0;    // فاصل
        text++;
    }
}

void scroll_step(void) {
    if (state.current != PATTERN_SCROLL_TEXT) return;
    for (int row = 0; row < 5; row++) {
        active_pattern[row] = scroll_buf[(scroll_pos + row) % scroll_len];
    }
    scroll_pos = (scroll_pos + 1) % scroll_len;
}
```

استدعِ `scroll_step()` كل 200ms من SysTick.

---

## 11. التحقق النهائي

عند الانتهاء، يجب أن يكون لديك:

- ✅ المصفوفة تعرض النمط الافتراضي عند الإقلاع.
- ✅ الزر يبدّل النمط فوراً.
- ✅ كتابة `heart` أو `x` أو `off` عبر UART تغيّر العرض.
- ✅ `bright 50` يخفت الإضاءة.
- ✅ `text HELLO` يبدأ scroll.
- ✅ `save` يحفظ الحالة، ولا تضيع بعد إعادة التشغيل.
- ✅ إذا علّقت البرنامج عمداً، الـ Watchdog يعيد التشغيل بعد ثانية.
- ✅ بين الأوامر، الـ CPU في `wfi` (تستطيع قياسه بـ multimeter).

---

## 12. مهام إضافية

1. **Animation engine**: استخدم timer لتنفيذ frame-by-frame animation.
2. **Brightness via ADC**: potentiometer يتحكم بالسطوع.
3. **Temp sensor display**: اعرض درجة حرارة الشريحة على الـ matrix.
4. **Game**: Pong بسيط على 5×5.
5. **OTA update**: تحديث الـ patterns عبر UART.

---

## 13. الخلاصة

أنت الآن:

- ✅ تفهم register-level على CH32V003.
- ✅ تستطيع قراءة الـ Reference Manual.
- ✅ تستخدم interrupts بكفاءة.
- ✅ تربط أطرافاً (UART, SPI, I2C, ADC, DMA).
- ✅ تتعامل مع low-power.
- ✅ تكتب bootloader / firmware من الصفر.
- ✅ تشخّص bugs دون printf.
- ✅ بنيت مشروعاً متكاملاً من 0 إلى المُنتَج.

**هذا هو المستوى الاحترافي**. التطبيق المستمر والـ projects الواقعية تأخذك للقمة. 🚀

---

## 📖 المصادر القياسية (للرجوع المستقبلي)

- **CH32V003 Reference Manual v1.9** — السلطة العتادية.
- **CH32V003 Datasheet** — الكهربائيات والـ pinout.
- **WCH AN-IAP** — In-Application Programming.
- **ch32v003fun** — مكتبة مرجعية minimal.
- **NXP UM10204** — I2C spec.
- **Hacker's Delight** (Henry S. Warren) — bitwise wizardry.

---

## بعد الإنتهاء — أين تتجه؟

| الاتجاه | المصدر |
|---------|--------|
| RTOS على CH32V003 | FreeRTOS port للـ RISC-V |
| Motor control | CH32V103/V20x (لها مساحة أكبر) |
| RF + bluetooth | CH32V208 / CH582 |
| Linux SBC | StarFive VisionFive 2 |
| FPGA + Verilog | iCEBreaker, TinyFPGA |

**حظاً موفقاً في رحلتك! 🎓**
