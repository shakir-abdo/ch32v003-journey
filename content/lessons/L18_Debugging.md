---
order: 18
slug: "l18-debugging"
title: "Debugging — تشخيص بدون printf"
title_en: "Debugging Workflows"
icon: "i-lucide-bug"
track: "pro"
level: "advanced"
minutes: 40
tags: ["debug", "minichlink"]
---

# الدرس 18: Debugging — تشخيص الـ bugs بدون printf

> **العتاد:** CH32V003 + WCH-LinkE (programmer/debugger) + USB-UART.

---

## 0. لماذا الـ Debugging مهم؟

لأن `printf` ليست دائماً متاحة (لا يوجد UART، أو الـ bug في الـ early init قبل تهيئة UART، أو الـ bug في الـ ISR). نحتاج أدوات أخرى:

1. **WCH-LinkE + minichlink**: تنزيل، debug عبر GDB، semihosting.
2. **LED breadcrumbs**: تشغيل/إطفاء LED في نقاط معيّنة.
3. **GPIO toggle مع oscilloscope/LA**: قياس توقيت دقيق.
4. **MCO على pin**: مراقبة الساعة.
5. **Hard-Fault analysis**: قراءة سجلات النواة.
6. **Static analysis**: المُترجم نفسه يجد bugs.

---

## 1. الأداة الذهبية: WCH-LinkE

WCH-LinkE هو programmer + SWD/SDI debugger للشرائح WCH. يدعم:

- ✅ Flash برنامج جديد.
- ✅ Reset الشريحة.
- ✅ Halt/Run/Step عبر GDB.
- ✅ قراءة/كتابة الذاكرة الحية.
- ✅ Breakpoints.

### الأمر الأساسي

```bash
# Flash + reset
minichlink -w firmware.bin flash -b

# اقرأ كامل الذاكرة
minichlink -r dump.bin

# unbrick (إذا بقت الشريحة محبوسة)
minichlink -u
```

> 💡 على نظام PlatformIO: `pio run -t upload` يستخدم minichlink تلقائياً.

---

## 2. Semihosting — `printf` عبر الـ Debugger

بدل UART، الشريحة تطبع رسائل عبر WCH-LinkE → الـ Linux/Windows host. لا تحتاج UART نهائياً.

في PlatformIO:

```ini
[env:dev]
upload_flags = -b
monitor_speed = 115200
build_flags = -DUSE_PRINTF_VIA_DEBUG
```

ثم في الكود:

```c
extern int SDI_Printf_Enable(void);
extern int printf(const char *fmt, ...);

int main(void) {
    SDI_Printf_Enable();
    printf("Booted!\n");
    while (1) {
        printf("Counter: %u\n", millis());
        delay(1000 * 8000);
    }
}
```

شاهد الإخراج في الـ Serial Monitor.

> ⚠️ Semihosting بطيء — لا تستخدمه في حلقات سريعة.

---

## 3. LED Breadcrumbs — أبسط طريقة

عندما يتعطّل النظام، لا تعرف **أين** توقّف. الحل: ضع LED toggle في نقاط مختلفة:

```c
#define BREAD(N) do { GPIOC_OUTDR = (N); } while (0)

int main(void) {
    // HSI = 24 MHz بشكل افتراضي عند الإقلاع — لا حاجة لتهيئة هنا
    led_init_4bits();   // 4 LEDs على PC0-PC3

    BREAD(1); init_uart();
    BREAD(2); init_i2c();
    BREAD(3); init_sensor();   // ← إذا تعلّق هنا، LED يبقى يعرض "3"
    BREAD(4); loop();
}
```

عند الـ crash، رقم LED يخبرك آخر نقطة وصلتها.

---

## 4. GPIO Toggle + Logic Analyzer

أدق طريقة لقياس توقيت:

```c
#define DBG_HIGH()  GPIOC_BSHR = (1 << 0)
#define DBG_LOW()   GPIOC_BCR  = (1 << 0)

void critical_function(void) {
    DBG_HIGH();
    // الكود الذي نريد قياسه
    DBG_LOW();
}
```

ثم على الـ Logic Analyzer، عرض PC0 وقياس عرض النبضة = مدة التنفيذ.

> ⏱️ لـ CH32V003 على 48MHz: كل دورة = 20.83ns. تستطيع قياس دقيق.

---

## 5. MCO — مراقبة الساعة بـ Scope

لتأكيد أن نظام الساعة يعمل صحيحاً:

```c
// أخرج SYSCLK على PC4
RCC_CFGR0 = (RCC_CFGR0 & ~RCC_CFGR0_MCO) | (0b100 << 24);

// PC4 = AF Push-Pull
GPIOC_CFGLR &= ~(0xF << (4*4));
GPIOC_CFGLR |=  (0b1011 << (4*4));
```

اربط oscilloscope على PC4 وقس التردد:
- إذا رأيت 24MHz → أنت على HSI.
- إذا رأيت 48MHz → PLL يعمل.
- إذا رأيت تردداً غير متوقع → خطأ في إعداد RCC.

> 📖 *RM, §3.3.5.4 — صفحة 15.*

---

## 6. Hard-Fault Handler — التعامل مع crashes

كل crash في RISC-V (mret من سياق خربان، نسخ على عنوان غير صالح، …) يقفز إلى `Default_Handler`. حسّن هذا:

```c
__attribute__((interrupt))
void HardFault_Handler(void) {
    // ضوّء كل الـ LEDs لتنبّه المستخدم بالـ crash
    GPIOC_BSHR = 0xFF;
    while (1);
}
```

أو احفظ سياق الـ CPU في موقع معروف:

```c
volatile uint32_t mcause, mepc, mtval;

__attribute__((interrupt))
void HardFault_Handler(void) {
    mcause = __read_csr(0x342);   // mcause
    mepc   = __read_csr(0x341);   // عنوان التعليمة التي فجّرت
    mtval  = __read_csr(0x343);
    while (1);
}
```

بعد الـ reset، اقرأها عبر debugger:

```bash
minichlink -m | grep mepc
```

---

## 7. تحذيرات المُترجم = أصدقاؤك

```bash
-Wall -Wextra -Werror -Wshadow -Wundef
```

أمثلة على bugs يكشفها:

```c
int x;
if (x = 5) { ... }   // ⚠️ assignment in if (تقصد ==)

uint8_t a = 256;     // ⚠️ overflow

void foo(int n) {
    int arr[n];      // ⚠️ VLA (Variable Length Array) — قد يفجر stack
}
```

---

## 8. أخطاء ذاكرة شائعة

### Stack Overflow

```c
void deep_recursion(int n) {
    char buf[256];   // ← كل استدعاء 256 byte
    deep_recursion(n + 1);  // ← BOOM (RAM=2KB!)
}
```

اكتشف عبر:

```c
extern uint32_t _my_top_stack;
extern uint32_t _bss_end;

uint32_t stack_used(void) {
    uint32_t sp;
    __asm__("mv %0, sp" : "=r"(sp));
    return _my_top_stack - sp;
}
```

### NULL Pointer

```c
char *p = NULL;
*p = 0;     // ⚠️ كتابة على 0x00 → الـ vector table!
```

### Out-of-bounds

```c
uint8_t buf[10];
buf[10] = 0;   // ⚠️ خارج الحدود → يكتب على متغير مجاور
```

---

## 9. Debug Workflow Recommended

```
1. اكتب الكود
   ↓
2. ابنِ بـ -Wall -Wextra (لا تتجاهل warnings)
   ↓
3. اشغّل على hardware
   ↓
4. إذا لم يعمل:
   a. LED breadcrumbs (تتبع التدفق)
   b. printf via UART/semihosting (قيم متغيرات)
   c. GPIO toggle + LA (توقيت)
   d. GDB step-through (آخر حلّ)
   ↓
5. إذا crash:
   a. Hard-Fault Handler (سجّل mepc)
   b. اقرأ Stack
```

---

## 10. أدوات Linux مفيدة

```bash
# objdump - الـ assembly
riscv-none-elf-objdump -d firmware.elf | less

# nm - الرموز
riscv-none-elf-nm --size-sort firmware.elf

# size - حجم الأقسام
riscv-none-elf-size firmware.elf

# readelf - تفاصيل ELF
riscv-none-elf-readelf -a firmware.elf
```

---

## 11. تمارين

1. **Hard-Fault demo**: اكتب على NULL pointer، التقط الـ crash، اطبع `mepc`.
2. **LED breadcrumb**: أضف breadcrumbs لكل init step.
3. **MCO check**: قس SYSCLK على scope.
4. **Stack peak**: قس أقصى استخدام للـ stack في برنامج معقد.
5. **Semihosting**: استخدم `printf` عبر WCH-LinkE وأعرض النتائج.
6. **Assembly view**: افتح `firmware.objdump` وحلل `main()`.

---

## 📖 المراجع

- **minichlink** — https://github.com/cnlohr/ch32v003fun/tree/master/minichlink
- **WCH-LinkE Manual** — موقع WCH.
- **QingKe V2 Manual** — لتفاصيل CSRs.
- **CH32V003 RM v1.9, §3.3.5.4 (MCO)** — صفحة 15.
