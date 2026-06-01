---
order: 16
slug: "l16-flash"
title: "Flash Programming + EEPROM emulation"
title_en: "Flash + EEPROM Emulation"
icon: "i-lucide-hard-drive"
track: "pro"
level: "advanced"
minutes: 40
tags: ["flash", "eeprom"]
---

# الدرس 16: Flash Programming — كتابة على الـ Flash + EEPROM Emulation

> **المرجع:** CH32V003 RM v1.9 — الفصل: Flash Memory Controller (راجع الفهرس داخل الـ RM).
>
> **العتاد:** CH32V003 فقط.

---

## 📋 تعريفات السجلات لهذا الدرس

انسخ هذا البلوك إلى رأس `main.c` قبل تشغيل أيّ مثال من هذا الدرس. الأمثلة في الأسفل تفترض أنّ هذه التعريفات موجودة.

```c
typedef unsigned int u32;

// ── FLASH ──────────────────────────────────────────────
#define FLASH_BASE    0x40022000
#define FLASH_KEYR      (*(volatile u32*)(FLASH_BASE + 0x04))
#define FLASH_CTLR      (*(volatile u32*)(FLASH_BASE + 0x10))
#define FLASH_STATR     (*(volatile u32*)(FLASH_BASE + 0x0C))
#define FLASH_ADDR      (*(volatile u32*)(FLASH_BASE + 0x14))

// ── PFIC ──────────────────────────────────────────────
#define PFIC_BASE    0xE000E000
#define PFIC_CFGR       (*(volatile u32*)(PFIC_BASE + 0x48))

// تأخير busy-loop بسيط (يكفي للأمثلة الأساسية)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 جميع العناوين مستخرجة من *CH32V003 RM v1.9*، الفصل الخاصّ بكل peripheral. الجدول مرتّب بترتيب الاستخدام في الدرس.

---


## 0. لماذا نكتب على الـ Flash من البرنامج نفسه؟

سيناريوهات شائعة:

1. **Configuration storage**: حفظ إعدادات المستخدم (Brightness, Baud rate, …) بعد الـ Reset.
2. **EEPROM Emulation**: CH32V003 لا يملك EEPROM فعلية. نحاكيها بقطعة من الـ Flash.
3. **Bootloader**: تحديث البرنامج عبر UART أو SPI.
4. **Calibration data**: تخزين قيم معايرة بعد الصنع.

---

## 1. تخطيط الـ Flash في CH32V003

> 📖 *RM, §1.2.1 "Memory Allocation" — صفحة 3.*

```
0x00000000  ┌─────────────────────┐
            │   Main Flash 16 KB  │ ← كود البرنامج + بياناتك
0x00003FFF  └─────────────────────┘

0x1FFFF000  ┌─────────────────────┐
            │  System Memory      │ ← Bootloader (مدمج من المصنع)
0x1FFFF7FF  └─────────────────────┘

0x1FFFF800  ┌─────────────────────┐
            │   Option Bytes      │ ← Config (read protect, watchdog, …)
0x1FFFF80F  └─────────────────────┘
```

- **Page size = 64 bytes** (الحد الأدنى للمسح).
- **Write granularity = 16-bit** (نكتب نصف-كلمة).

---

## 2. السجلات المهمة

| السجل | العنوان | الوصف |
|-------|---------|--------|
| `FLASH_ACTLR` | `0x40022000` | Access control (latency, prefetch) |
| `FLASH_KEYR` | `0x40022004` | Unlock key |
| `FLASH_OBKEYR` | `0x40022008` | Option-byte key |
| `FLASH_STATR` | `0x4002200C` | Status (BSY, EOP, PGERR, WRPRTERR) |
| `FLASH_CTLR` | `0x40022010` | Control (PG, PER, MER, STRT, LOCK) |
| `FLASH_ADDR` | `0x40022014` | Address for erase |
| `FLASH_OBR` | `0x4002201C` | Option Byte Register (read) |
| `FLASH_WPR` | `0x40022020` | Write protection |

### المفاتيح

- `0x45670123` ثم `0xCDEF89AB` → فتح `FLASH_CTLR` للكتابة.
- نفس القيم في `OBKEYR` → فتح Option Bytes.

---

## 3. خطوات الكتابة على Flash

### القاعدة الذهبية

```
Unlock → Erase Page → Wait → Program halfwords → Wait → Lock
```

### تحذير قاتل ⚠️

- **لا تستطيع الكتابة على نفس الـ page التي تشغّل منها**! وإلا تحدث Hard-Fault.
- لذلك ضع الكود في `0x00000000+` والـ data في نهاية الـ Flash (`0x00003FC0+`).

---

## 4. شرح Bitwise — Unlock Sequence

```c
#define FLASH_KEY1  0x45670123U
#define FLASH_KEY2  0xCDEF89ABU

static void flash_unlock(void) {
    if (FLASH_CTLR & (1 << 7)) {            // LOCK bit
        FLASH_KEYR = FLASH_KEY1;
        FLASH_KEYR = FLASH_KEY2;
    }
}

static void flash_lock(void) {
    FLASH_CTLR |= (1 << 7);                  // re-lock
}
```

---

## 5. مسح صفحة (Page Erase)

```c
static void flash_erase_page(uint32_t addr) {
    flash_unlock();
    while (FLASH_STATR & (1 << 0));         // BSY
    FLASH_CTLR |= (1 << 1);                  // PER (Page Erase)
    FLASH_ADDR  = addr;
    FLASH_CTLR |= (1 << 6);                  // STRT
    while (FLASH_STATR & (1 << 0));         // wait BSY
    FLASH_CTLR &= ~(1 << 1);                 // clear PER
}
```

> 📖 *RM, Flash chapter — PER bit at offset 1 of CTLR, STRT bit at offset 6.*

---

## 6. كتابة Half-Word

```c
static void flash_write_halfword(uint32_t addr, uint16_t data) {
    flash_unlock();
    while (FLASH_STATR & (1 << 0));
    FLASH_CTLR |= (1 << 0);                  // PG bit
    *(volatile uint16_t *)addr = data;
    while (FLASH_STATR & (1 << 0));
    FLASH_CTLR &= ~(1 << 0);                 // clear PG
}
```

> ⚡ الكتابة على عنوان `addr` تكون بـ **store عادي** (نصف-كلمة). الـ peripheral يلتقط الكتابة لأن `PG=1`.

---

## 7. مثال كامل — حفظ إعدادات

```c
// نحجز آخر page من الـ Flash للـ config
#define CFG_PAGE_ADDR  0x00003FC0   // 16K - 64 = آخر page

typedef struct {
    uint16_t magic;          // للتحقق من سلامة البيانات
    uint16_t brightness;
    uint16_t baud_index;
    uint16_t reserved;
} config_t;

#define MAGIC  0xC003

void config_save(const config_t *c) {
    flash_erase_page(CFG_PAGE_ADDR);
    uint16_t *src = (uint16_t *)c;
    for (int i = 0; i < sizeof(config_t)/2; i++) {
        flash_write_halfword(CFG_PAGE_ADDR + i*2, src[i]);
    }
    flash_lock();
}

void config_load(config_t *c) {
    config_t *src = (config_t *)CFG_PAGE_ADDR;
    if (src->magic == MAGIC) {
        *c = *src;
    } else {
        // إعدادات افتراضية لأول مرة
        c->magic = MAGIC;
        c->brightness = 128;
        c->baud_index = 0;
    }
}
```

---

## 8. EEPROM Emulation الذكية (Wear Leveling)

الـ Flash يدعم ~10,000 دورة كتابة لكل خلية. إذا تحفظ متغيراً كل ثانية يستهلك في 3 ساعات!

### الحل: Wear Leveling

استخدم عدة pages بالتناوب:

```
Page 0 [USED][USED][NEW...] ← الكتابة الحالية
Page 1 [USED][USED][USED]
Page 2 [USED]
```

كل سجل يحمل counter متزايد. القراءة تأخذ السجل بأعلى counter.

```c
typedef struct {
    uint16_t magic;
    uint16_t counter;        // كل كتابة +1
    uint16_t data;
    uint16_t crc;
} record_t;

void log_save(uint16_t data) {
    // ابحث عن أول record فارغ (0xFFFF)
    record_t *rec = find_next_empty();
    if (!rec) {
        // كل الـ pages ممتلئة — امسحها وابدأ من جديد
        erase_all_pages();
        rec = (record_t *)PAGE0;
    }
    write_record(rec, data);
}
```

> 💎 هذه فكرة الـ EEPROM emulation. مكتبات جاهزة موجودة (ST AN2594).

---

## 9. Option Bytes — إعدادات بعيدة المدى

`Option Bytes` تتحكم في سلوك الشريحة على مستوى Reset:

| البايت | الوظيفة |
|--------|---------|
| RDPR | Read Protection (0xAA = no protect, others = protect) |
| USER | IWDG_SW, nRST_STOP, nRST_STDBY |
| Data0/1 | بيانات حرة (16 بت) |
| WRP0..3 | Write Protection للـ pages |

> ⚠️ **تحذير**: تفعيل RDPR ≠ 0xAA يمنع القراءة عبر debugger! استخدمها في الإنتاج فقط.

---

## 10. تحديث البرنامج عبر UART (Bootloader Mini)

فكرة مبسّطة:

```c
// في الـ main:
// 1) إذا الزر مضغوط عند الـ boot → ادخل وضع update
// 2) في وضع update: استقبل bytes عبر UART وضعها في Flash بدءاً من 0x800

void update_firmware(void) {
    uint32_t addr = 0x00000800;     // Reserve أول 2KB للـ bootloader
    while (!end_of_file) {
        uint8_t b1 = uart_getc_blocking();
        uint8_t b2 = uart_getc_blocking();
        uint16_t hw = b1 | (b2 << 8);
        flash_write_halfword(addr, hw);
        addr += 2;
    }
    // أعد التشغيل لتشغيل البرنامج الجديد
    PFIC_CFGR = 0xFA050000 | (1 << 7);    // SYSRESET
}
```

> 🏗️ **بناء bootloader كامل** هو مشروع كبير (تحقق CRC، signature، fallback، …). راجع مكتبات WCH `iap` كنموذج.

---

## 11. أخطاء شائعة

| العَرَض | السبب | الحل |
|---------|------|------|
| Hard-Fault عند الكتابة | تكتب على نفس الـ page التي تشغّل منها | استخدم page نهاية |
| PGERR في STATR | محاولة كتابة على خلية غير ممسوحة | امسح الـ page أولاً |
| WRPRTERR | كتابة على page محمي | عدّل WRP في Option Bytes |
| المفتاح يفشل | كتبت المفتاحين على شكل خاطئ | KEY1 ثم KEY2 بترتيب |
| السطر `*(volatile uint16_t *)addr = data;` يفشل | نسيت `PG=1` | فعّله |
| البيانات تختفي بعد reset | اخترت RAM بدل Flash | تحقق من العنوان |

---

## 12. تمارين

1. **Counter persisting**: يعدّ كل reset ويحفظ القيمة في Flash.
2. **LED state**: ضغطة زر تبدّل LED، الحالة تحفظ بين الـ resets.
3. **Wear Leveling**: نفّذ نظاماً يستخدم 4 pages بالتناوب.
4. **Config menu**: عبر UART، اضبط brightness وbaud، احفظ.
5. **CRC على بيانات Flash**: تحقق من سلامة البيانات بـ CRC16.

---

## 📖 المراجع

- **CH32V003 RM v1.9**:
  - §1.2.1 "Memory Allocation" — صفحة 3
  - فصل Flash Memory Controller (راجع الفهرس)
- **WCH AN-IAP** — In-Application Programming guide.
- **ST AN2594** — EEPROM Emulation (المبدأ ينطبق على CH32V003).
