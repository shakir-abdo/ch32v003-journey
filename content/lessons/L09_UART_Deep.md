---
order: 9
slug: "l09-uart-deep"
title: "UART العميق"
title_en: "UART Deep Dive"
icon: "i-lucide-cable"
track: "comm"
level: "intermediate"
minutes: 35
tags: ["uart", "serial"]
---

# الدرس 09: UART العميق — Interrupts, Ring Buffer, printf مخصّص

> **المرجع:** CH32V003 RM v1.9 — الفصل 12 "USART" — صفحات 138–150.
>
> **العتاد:** CH32V003 + USB-UART adapter (CH340/FTDI) موصول بـ TX=PD5, RX=PD6.

---

## 0. ما هو UART؟

**UART = Universal Asynchronous Receiver/Transmitter**.

بروتوكول تسلسلي بسيط لتبادل بايتات بين جهازين عبر سلكين (TX و RX) دون ساعة مشتركة. كل بايت يُرسل كـ:

```
   Idle = HIGH
   ─────┐ ┌─┬─┬─┬─┬─┬─┬─┬─┐ ┌──── Idle
        │ │D│D│D│D│D│D│D│D│ │
        └─┴─┴─┴─┴─┴─┴─┴─┴─┘─┘
       Start  8 Data bits  Stop
       LOW                  HIGH
```

**كيف يتفق الطرفان على السرعة؟** عبر **Baud Rate** متفق عليه مسبقاً (مثل 115200 bps). كلاهما يستخدم ساعة داخلية بدقة كافية.

---

## 1. ما الذي نتعلمه في هذا الدرس؟

- UART بـ **polling** (الأبسط) — `هل البايت جاهز؟`
- UART بـ **interrupts** — لا يضيع الـ CPU وقت
- **Ring Buffer** للاستقبال المتواصل
- إعادة توجيه `printf` للـ UART (طباعة سهلة)

---

## 2. خرائط الأطراف لـ USART1 في CH32V003

> 📖 *RM, الجدول 7-10 "USART1 Alternate Function Remapping" — صفحة 56.*

| Mapping | TX | RX | CK | CTS | RTS | RM1:RM[0] |
|---------|------|------|------|-------|-------|------------|
| **Default** | **PD5** | **PD6** | PD4 | PD3 | PC2 | 0:00 |
| Remap 1 | PD0 | PD1 | PD7 | PC3 | PC2 | 0:01 |
| Remap 2 | PD6 | PD5 | PD7 | PC6 | PC7 | 1:00 |
| Remap 3 | PC0 | PC1 | PC5 | PC6 | PC7 | 1:01 |

> ❗ **ملاحظة مهمة جداً:** الخريطة الافتراضية في `CH32V003` ليست `PA9/PA10` كما في STM32. هذا خطأ شائع عند نسخ كود STM32. **الصحيح: PD5 (TX) و PD6 (RX).**

---

## 3. حساب Baud Rate

`USART1_BRR` سجل 16 بت يحدّد قيمة قسمة الـ APB لتوليد ساعة الـ baud.

### المعادلة (في 16× oversampling — الافتراضي)

```
BRR = APBx_CLK / Baud_Rate
```

### أمثلة

| APB | Baud | BRR (عشري) | BRR (هكس) |
|-----|------|------------|------------|
| 48 MHz | 9600 | 5000 | 0x1388 |
| 48 MHz | 115200 | 417 (≈416) | 0x1A0 |
| 24 MHz | 115200 | 208 | 0xD0 |
| 24 MHz | 9600 | 2500 | 0x9C4 |

> 📖 *RM, §12.3 "Baud Rate Generator" — صفحة 142, §12.10.3 BRR — صفحة 145.*

> ⚠️ القيمة الكسريّة: إذا الناتج `417.5` الـ hardware يدعم 4 بت كسرية في `BRR[3:0]` — استخدمها لتحسين الدقة.

---

## 4. السجلات الأساسية

| السجل | العنوان | الوصف |
|-------|---------|--------|
| `USART1_STATR` | `0x40013800` | حالة (TXE, RXNE, TC, ...) |
| `USART1_DATAR` | `0x40013804` | بيانات الإرسال/الاستقبال |
| `USART1_BRR` | `0x40013808` | Baud Rate |
| `USART1_CTLR1` | `0x4001380C` | UE, TE, RE, IRQ enables |
| `USART1_CTLR2` | `0x40013810` | Stop bits, LIN, CK |
| `USART1_CTLR3` | `0x40013814` | DMA, error IRQ |
| `AFIO_PCFR1` | `0x40010004` | Remap selection |

---

## 5. بتات `STATR` المهمة

> 📖 *RM, §12.10.1 — صفحة 144.*

| البت | الاسم | المعنى |
|------|-------|--------|
| 0 | PE | Parity error |
| 1 | FE | Framing error |
| 2 | NE | Noise error |
| 3 | ORE | Overrun error |
| 4 | IDLE | Idle line detected |
| **5** | **RXNE** | **Receive Buffer Not Empty** — بايت جاهز للقراءة |
| 6 | TC | Transmission Complete |
| **7** | **TXE** | **Transmit Buffer Empty** — جاهز لبايت جديد |

### بتات `CTLR1` المهمة

| البت | الاسم | المعنى |
|------|-------|--------|
| 13 | **UE** | USART Enable |
| 3 | **TE** | Transmitter Enable |
| 2 | **RE** | Receiver Enable |
| 5 | RXNEIE | RXNE interrupt enable |
| 7 | TXEIE | TXE interrupt enable |

---

## 6. كود Polling — الحد الأدنى للعمل

```c
void uart_init(uint32_t baud) {
    RCC_APB2PCENR |= (1u << 14) /* USART1EN */ | (1u << 5)  /* IOPDEN */ | (1u << 0)  /* AFIOEN */;

    // PD5 = TX → AF Push-Pull, 50 MHz
    GPIOD_CFGLR &= ~(0xF << (4 * 5));
    GPIOD_CFGLR |=  (0b1011 << (4 * 5));    // CNF=10 (AF-PP), MODE=11

    // PD6 = RX → Input Pull-Up (لتجنب floating)
    GPIOD_CFGLR &= ~(0xF << (4 * 6));
    GPIOD_CFGLR |=  (0x8 << (4 * 6));       // CNF=10 (Input Pull)
    GPIOD_OUTDR |=  (1 << 6);               // Pull-Up

    // Baud
    USART1_BRR = SYSTEM_CORE_CLOCK / baud;

    // UE | TE | RE
    USART1_CTLR1 = (1 << 13) | (1 << 3) | (1 << 2);
}

void uart_putc(char c) {
    while (!(USART1_STATR & (1 << 7)));    // انتظر TXE
    USART1_DATAR = c;
}

void uart_puts(const char *s) {
    while (*s) uart_putc(*s++);
}

int uart_getc(void) {
    if (USART1_STATR & (1 << 5))            // RXNE
        return USART1_DATAR;
    return -1;
}

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    uart_init(115200);

    while (1) {
        uart_puts("Hello World!\r\n");
        delay(1000 * 8000);
    }
}
```

---

## 7. شرح Bitwise لتفعيل CTLR1

```c
USART1_CTLR1 = (1 << 13) | (1 << 3) | (1 << 2);
```

**ماذا يحدث**:

1. `1 << 13` = `0x2000` → بت 13 (UE).
2. `1 << 3` = `0x0008` → بت 3 (TE).
3. `1 << 2` = `0x0004` → بت 2 (RE).
4. OR كل البتات: `0x200C` = 8204.

**النتيجة في السجل** (البتات التي صارت `1` فقط):

| البت | القيمة | الحقل | الوظيفة |
|------|---------|--------|---------|
| `13` | `1` | **UE** | USART Enable |
| `3`  | `1` | **TE** | Transmitter Enable |
| `2`  | `1` | **RE** | Receiver Enable |

كل البتات الأخرى = `0`. الناتج الكامل: `0x200C`.

> 🎯 **لماذا الكتابة المباشرة `=` وليس `|=`؟** لأن السجل عند الـ Reset = 0، ونحن نعرف القيمة الكاملة المطلوبة.

---

## 8. استقبال بـ Interrupt

```c
#define RX_BUF_SIZE 64

volatile uint8_t  rx_buf[RX_BUF_SIZE];
volatile uint8_t  rx_head = 0, rx_tail = 0;

void uart_init_irq(uint32_t baud) {
    // ... (نفس uart_init)
    USART1_CTLR1 |= (1 << 5);          // RXNEIE
    PFIC_IENR1 |= (1u << 29); /* USART1_IRQn = 29 */
}

__attribute__((interrupt))
void USART1_IRQHandler(void) {
    if (USART1_STATR & (1 << 5)) {                     // RXNE
        uint8_t b = USART1_DATAR;                      // قراءة تمسح RXNE
        uint8_t next = (rx_head + 1) % RX_BUF_SIZE;
        if (next != rx_tail) {                           // الحوض غير ممتلئ
            rx_buf[rx_head] = b;
            rx_head = next;
        }
        // وإلا: نتجاهل (overrun) — وسّع الحوض إذا حدث كثيراً
    }
}

int uart_read(void) {
    if (rx_head == rx_tail) return -1;                  // فارغ
    uint8_t b = rx_buf[rx_tail];
    rx_tail = (rx_tail + 1) % RX_BUF_SIZE;
    return b;
}
```

> 🔄 هذا يُسمى **Ring Buffer** (الحوض الدائري). يستخدم `head` للكتابة و `tail` للقراءة.

---

## 9. تحويل printf للـ UART

في GCC + newlib-nano، يمكن إعادة كتابة `_write` لتُوجِّه الإخراج إلى UART:

```c
#include <unistd.h>

int _write(int fd, const char *buf, int len) {
    for (int i = 0; i < len; i++) {
        if (buf[i] == '\n') uart_putc('\r');
        uart_putc(buf[i]);
    }
    return len;
}

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    uart_init(115200);
    printf("Temp: %d.%02d °C\n", t/100, t%100);
}
```

> 💡 **انتباه على الحجم**: `printf` كاملة تأكل 8-12 KB من الـ Flash (CH32V003 عنده 16KB فقط!). استخدم `printf` المصغرة (`-u _printf_float -DPRINTF_DISABLE_SUPPORT_FLOAT`).

---

## 10. أوامر عبر UART (Mini Shell)

```c
char line[32]; int line_len = 0;

void process_line(void) {
    line[line_len] = 0;
    if (line[0] == '1') GPIOC_BSHR = (1 << 1);
    else if (line[0] == '0') GPIOC_BCR  = (1 << 1);
    else if (line[0] == 'r') { printf("LED state\n"); }
    line_len = 0;
}

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    while (1) {
        int c = uart_read();
        if (c < 0) { __asm__("wfi"); continue; }
        uart_putc(c);          // echo
        if (c == '\r' || c == '\n') {
            uart_putc('\n');
            process_line();
        } else if (line_len < 31) {
            line[line_len++] = c;
        }
    }
}
```

---

## 11. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| لا يخرج شيء على الطرف الآخر | TX على PA9 بالخطأ | تأكد أنك على PD5 |
| الحروف "ك" غير المتوقّع | Baud خطأ | تحقق `BRR = APBCLK/baud` |
| يصل حرف واحد فقط ثم يتعطّل | فيه ORE (Overrun) | اقرأ `STATR` ثم `DATAR` لتنظيف |
| Echo يطبع حروف مكررة | في وضع AF Open-Drain | استخدم AF **Push-Pull** |
| RX لا يقرأ شيئاً | نسيت RE في CTLR1 | فعّل `RE` (بت 2) |
| المقاطعة لا تشتعل | نسيت RXNEIE | فعّل `(1 << 5)` في CTLR1 |
| Buffer overflow | معالجة بطيئة | كبّر الـ ring buffer أو فعّل DMA |

---

## 12. تمارين

1. **Echo Server**: استقبل أي حرف وأرسله مرة ثانية + اطبع "OK".
2. **عداد ميلي ثانية**: اطبع `millis()` كل ثانية.
3. **Command parser**: `led on`, `led off`, `read temp` (مع ADC في الدرس 12).
4. **printf مع DMA**: عند تعلم DMA في الدرس 13، حسّن الـ TX ليكون non-blocking.
5. **Binary frame**: ابتكر بروتوكول بايت-آدم: `<sync><len><payload><CRC>`.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §12.1 "Main Features" — صفحة 138
  - §12.3 "Baud Rate Generator" — صفحة 142
  - §12.10 "Register Description" — صفحات 144-150
  - الجدول 7-10 "USART1 Alternate Function Remapping" — صفحة 56
- **CH32V003 Datasheet** — لمواصفات الكهربائية للـ UART.
