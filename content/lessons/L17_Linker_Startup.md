---
order: 17
slug: "l17-linker-startup"
title: "Linker Script + Startup"
title_en: "Linker + Startup"
icon: "i-lucide-file-code"
track: "pro"
level: "advanced"
minutes: 40
tags: ["linker", "startup"]
---

# الدرس 17: Linker Script + Startup العميقان

> **المرجع:** GNU ld manual + CH32V003 RM v1.9 §1.2 (Memory Map).
> **المثال العملي:** ملفّاكَ `link.ld` و `startup.c` الموجودان في هذا المشروع.

---

## 0. لماذا هذا الدرس مهم؟

كل لمسة `Reset` على الشريحة، يبدأ تنفيذ كود قبل `main()`. هذا الكود اسمه **Startup**. يحدد:

- ✅ أين يبدأ الـ Stack Pointer.
- ✅ كيف تُنسخ المتغيرات المُهيَّأة من Flash إلى RAM.
- ✅ كيف يُصفَّر الـ BSS.
- ✅ كيف نقفز إلى `main()`.

والـ **Linker Script** هو الذي يخبر الـ Linker:

- ✅ أين تقع الذاكرة (Flash و RAM).
- ✅ أين توضع كل قطعة من الكود (`.text`, `.data`, `.bss`).
- ✅ كيف نُولّد الرموز (`_data_start`, `_bss_end`, …).

بدون فهم هذين، أنت تبني على رمال متحركة.

---

## 1. خريطة الذاكرة في CH32V003

> 📖 *RM, §1.2 "Memory Image" — صفحات 2-3.*

```
0x00000000  ┌────────────────────────┐
            │   Flash 16 KB          │ ← code + read-only data
0x00003FFF  └────────────────────────┘

0x20000000  ┌────────────────────────┐
            │   SRAM 2 KB            │ ← stack + heap + data + bss
0x200007FF  └────────────────────────┘

0x40000000  ┌────────────────────────┐
            │   Peripheral Registers │
            └────────────────────────┘

0xE0000000  ┌──────────────────────────────────┐
            │   Core Private (PFIC,SysTick)    │
            └──────────────────────────────────┘
```

---

## 2. الـ Linker Script — تشريح `link.ld`

```ld
MEMORY
{
    FLASH (rx) : ORIGIN = 0x00000000, LENGTH = 16K
    RAM   (rw) : ORIGIN = 0x20000000, LENGTH = 2K
}
```

نُعرّف منطقتين:
- **FLASH**: `(rx)` تعني read + execute (الكود).
- **RAM**: `(rw)` تعني read + write (المتغيرات).

### نقطة الدخول

```ld
ENTRY(Reset_Handler)
```

تخبر الـ Linker أن الدالة `Reset_Handler` هي البداية. تُكتب في رأس الـ ELF كنقطة الدخول.

### قسم `.vectors`

```ld
SECTIONS
{
    .vectors :
    {
        KEEP(*(.vectors))
    } > FLASH
```

- `KEEP` تمنع الـ linker من حذف هذا القسم حتى إذا "بدا" غير مستخدم.
- يجب أن يكون **أوّل شيء في Flash** (عند 0x00000000) لأن المعالج يقرأ Vector Table من هذا العنوان عند الـ Reset.

### قسم `.text`

```ld
    .text :
    {
        *(.text*)
    } > FLASH
```

- يجمع كل أقسام `.text` من كل ملفات الـ object.
- توضع في FLASH.

### قسم `.rodata` — البيانات الثابتة

```ld
    .rodata :
    {
        *(.rodata*)
    } > FLASH
```

مثل `const char *msg = "hello";` تقع هنا.

### قسم `.data` — المتغيرات المُهيَّأة

```ld
    _data_load = LOADADDR(.data);
    .data :
    {
        _data_start = .;
        *(.data*)
        _data_end = .;
    } > RAM AT> FLASH
```

**التفسير المعقد**:

- `> RAM AT> FLASH` تعني: "مكان التشغيل في RAM، لكن الصورة المخزنة في FLASH".
- `_data_load` يستخرج العنوان في FLASH (LOAD address).
- `_data_start` و `_data_end` يحددان حدود الـ data في RAM.

> 🧠 **لماذا التعقيد؟** المتغيرات المُهيَّأة (`int counter = 5;`) قيمتها يجب أن تنجو من انقطاع الكهرباء → تخزن في FLASH. لكن نريد تعديلها → تنسخ إلى RAM عند الإقلاع.

### قسم `.bss` — المتغيرات غير المُهيَّأة

```ld
    .bss :
    {
        _bss_start = .;
        *(.bss*)
        _bss_end = .;
    } > RAM
```

كل `int x;` (بلا تهيئة) يقع هنا. الـ ABI يقول: يجب أن تكون قيمته الابتدائية = 0.

### Stack Pointer

```ld
    _my_top_stack = ORIGIN(RAM) + LENGTH(RAM);
    /* = 0x20000000 + 0x800 = 0x20000800 */
}
```

تعرّف الـ Stack ليبدأ من **أعلى** RAM وينمو **للأسفل** (تقليد كل المعالجات).

---

## 3. الـ Startup — تشريح `startup.c`

### Vector Table

```c
__attribute__((section(".vectors"), used))
const u32 vector_table[] = {
    (u32)&_my_top_stack,    // [0] = Initial SP
    (u32)&Reset_Handler,    // [1] = Entry point
    ...
};
```

- `section(".vectors")` يضع المصفوفة في القسم الذي حدّدناه في `link.ld`.
- `used` تمنع المُترجم من حذفه إذا لم يُستخدم مباشرة.

> 🔑 **لاحظ**: الإدخال الأول هو قيمة SP (وليس عنوان)، والثاني فما بعد هي عناوين معالجات.

### Reset Handler

```c
void Reset_Handler(void) {
    u32 *src, *dst;

    // 1. انسخ .data من Flash إلى RAM
    src = &_data_load;
    dst = &_data_start;
    while (dst < &_data_end)
        *dst++ = *src++;

    // 2. صفّر .bss
    for (dst = &_bss_start; dst < &_bss_end; dst++)
        *dst = 0;

    // 3. ادخل main
    main();

    // 4. لا ترجع أبداً
    while (1);
}
```

---

## 4. سيناريو: ماذا يحدث عند الإقلاع (خطوة بخطوة)

```
1. NRST pin = HIGH أو POR
   ↓
2. المعالج يقرأ word في 0x00000000 → يضعه في SP
   ↓
3. المعالج يقرأ word في 0x00000004 → يقفز إليه (= Reset_Handler)
   ↓
4. Reset_Handler ينسخ .data, يصفّر .bss
   ↓
5. Reset_Handler يستدعي main()
   ↓
6. main() يهيّئ الأطراف ويدخل while(1)
```

---

## 5. تحسين الـ Startup — Init Arrays (لـ C++ أو constructors)

في C++ مثلاً، قد تحتاج تشغيل constructors قبل `main()`:

```ld
.init_array :
{
    __init_array_start = .;
    KEEP(*(.init_array))
    __init_array_end = .;
} > FLASH
```

```c
extern void (*__init_array_start)(void);
extern void (*__init_array_end)(void);

void Reset_Handler(void) {
    // ... data/bss copy

    for (void (**fn)(void) = &__init_array_start; fn < &__init_array_end; fn++)
        (*fn)();    // ينفّذ constructors

    main();
}
```

---

## 6. حجز قسم خاص (مثل buffer كبير في موقع محدد)

أحياناً تريد buffer في نهاية RAM:

```c
__attribute__((section(".big_buf")))
uint8_t big_buffer[512];
```

```ld
.big_buf 0x20000600 :
{
    *(.big_buf)
} > RAM
```

> 💡 مفيد لـ DMA buffers, double buffers, audio.

---

## 7. تحقق من خريطة الـ Output

بعد البناء، استخدم:

```bash
riscv-none-elf-size firmware.elf
# text  data  bss   total
# 1234   16   200   1450

riscv-none-elf-objdump -h firmware.elf | head
# اعرض كل الأقسام مع عناوينها
```

أو ملف map:

```bash
gcc ... -Wl,-Map=firmware.map
# ثم اقرأ firmware.map ترى كل رمز ومكانه
```

---

## 8. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| المتغير المهيّأ قيمته 0 | لم تنسخ `.data` في startup | راجع loop النسخ |
| crash عند الإقلاع فوراً | Vector Table ليس في 0x00000000 | تحقق من `> FLASH` ومكان `.vectors` |
| المتغير العام يأخذ قيمة خربشة | `.bss` لم يُصفَّر | راجع loop التصفير |
| Stack overflow | RAM ممتلئ + Stack ينمو | كبّر RAM أو قلّل المتغيرات |
| `Hard Fault` بدون سبب | كتابة على FLASH عبر مؤشر | تحقق من نوع الذاكرة |
| Linker error: undefined `_data_start` | اسم الرمز خطأ في startup | تأكد من المطابقة مع linker |

---

## 9. تمارين

1. **اقرأ `firmware.map`**: حدد عنوان `main` و `vector_table` و `_my_top_stack`.
2. **حجز BSS كبير**: ضع buffer 1KB في BSS وتحقق أنه = 0 عند الإقلاع.
3. **حجز DATA كبير**: ضع array مهيّأ + اطبع قيمته.
4. **Section مخصص**: ضع متغير في نهاية RAM بـ attribute.
5. **اقرأ Vector Table** عبر debugger: اقرأ memory at 0x00000000 وقارن.

---

## 📖 المراجع

- **GNU ld manual** — `info ld`.
- **RISC-V ABI Specification** — للسلوك القياسي.
- **CH32V003 RM v1.9, §1.2** — Memory map صفحات 2-3.
- ملفّاكَ في هذا المشروع: `link.ld` و `src/startup.c`.
