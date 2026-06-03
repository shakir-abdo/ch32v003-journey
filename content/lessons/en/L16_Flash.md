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

# Lesson 16: Flash Programming — Writing to Flash + EEPROM Emulation

> **Reference:** CH32V003 RM v1.9 — chapter: Flash Memory Controller (consult the index inside the RM).
>
> **Hardware:** CH32V003 only.

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example from this lesson. The examples below assume these definitions are present.

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

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. Why write to Flash from the running program?

Common scenarios:

1. **Configuration storage**: keep user settings (brightness, baud rate, …) across resets.
2. **EEPROM emulation**: the CH32V003 has no real EEPROM. We fake it with a slice of Flash.
3. **Bootloader**: update firmware over UART or SPI.
4. **Calibration data**: store factory calibration values.

---

## 1. Flash layout on the CH32V003

> 📖 *RM, §1.2.1 "Memory Allocation" — page 3.*

```
0x00000000  ┌─────────────────────┐
            │   Main Flash 16 KB  │ ← program code + your data
0x00003FFF  └─────────────────────┘

0x1FFFF000  ┌─────────────────────┐
            │  System Memory      │ ← bootloader (mask-programmed)
0x1FFFF7FF  └─────────────────────┘

0x1FFFF800  ┌─────────────────────┐
            │   Option Bytes      │ ← config (read protect, watchdog, …)
0x1FFFF80F  └─────────────────────┘
```

- **Page size = 64 bytes** (the minimum erasable unit).
- **Write granularity = 16-bit** (we program a half-word at a time).

---

## 2. Important registers

| Register | Address | Description |
|-------|---------|--------|
| `FLASH_ACTLR` | `0x40022000` | Access control (latency, prefetch) |
| `FLASH_KEYR` | `0x40022004` | Unlock key |
| `FLASH_OBKEYR` | `0x40022008` | Option-byte key |
| `FLASH_STATR` | `0x4002200C` | Status (BSY, EOP, PGERR, WRPRTERR) |
| `FLASH_CTLR` | `0x40022010` | Control (PG, PER, MER, STRT, LOCK) |
| `FLASH_ADDR` | `0x40022014` | Address for erase |
| `FLASH_OBR` | `0x4002201C` | Option Byte Register (read) |
| `FLASH_WPR` | `0x40022020` | Write protection |

### Keys

- `0x45670123` then `0xCDEF89AB` → unlocks `FLASH_CTLR` for writes.
- Same values for `OBKEYR` → unlocks the Option Bytes.

---

## 3. Steps to write to Flash

### The golden rule

```
Unlock → Erase Page → Wait → Program halfwords → Wait → Lock
```

### Fatal warning ⚠️

- **You cannot write to the same page you're executing from**! Otherwise you'll trigger a Hard-Fault.
- So put code at `0x00000000+` and data at the end of Flash (`0x00003FC0+`).

---

## 4. Bitwise walkthrough — Unlock sequence

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

## 5. Page Erase

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

## 6. Half-Word write

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

> ⚡ The write to `addr` uses a **normal half-word store**. The peripheral picks it up because `PG=1`.

---

## 7. Full example — saving settings

```c
// Reserve the last page of Flash for the config
#define CFG_PAGE_ADDR  0x00003FC0   // 16K - 64 = the last page

typedef struct {
    uint16_t magic;          // to validate data integrity
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
        // First-time defaults
        c->magic = MAGIC;
        c->brightness = 128;
        c->baud_index = 0;
    }
}
```

---

## 8. Smart EEPROM emulation (Wear Leveling)

Flash supports about 10,000 write cycles per cell. If you save a variable every second, it dies in 3 hours!

### Solution: Wear Leveling

Use multiple pages in rotation:

```
Page 0 [USED][USED][NEW...] ← current write
Page 1 [USED][USED][USED]
Page 2 [USED]
```

Each record carries an incrementing counter. Reads pick the record with the highest counter.

```c
typedef struct {
    uint16_t magic;
    uint16_t counter;        // +1 on every write
    uint16_t data;
    uint16_t crc;
} record_t;

void log_save(uint16_t data) {
    // Find the first empty slot (0xFFFF)
    record_t *rec = find_next_empty();
    if (!rec) {
        // All pages full — erase them and start over
        erase_all_pages();
        rec = (record_t *)PAGE0;
    }
    write_record(rec, data);
}
```

> 💎 This is the core idea of EEPROM emulation. Ready-made libraries exist (ST AN2594).

---

## 9. Option Bytes — long-lived configuration

`Option Bytes` control chip behavior at reset:

| Byte | Function |
|--------|---------|
| RDPR | Read Protection (0xAA = no protect, anything else = protect) |
| USER | IWDG_SW, nRST_STOP, nRST_STDBY |
| Data0/1 | Free-form data (16 bits) |
| WRP0..3 | Write Protection for pages |

> ⚠️ **Warning**: setting RDPR ≠ 0xAA blocks reads via debugger! Use only in production.

---

## 10. Firmware update over UART (mini bootloader)

The idea in simplified form:

```c
// Inside main:
// 1) If the button is held at boot → enter update mode
// 2) In update mode: receive bytes over UART and program them into Flash starting at 0x800

void update_firmware(void) {
    uint32_t addr = 0x00000800;     // Reserve the first 2KB for the bootloader
    while (!end_of_file) {
        uint8_t b1 = uart_getc_blocking();
        uint8_t b2 = uart_getc_blocking();
        uint16_t hw = b1 | (b2 << 8);
        flash_write_halfword(addr, hw);
        addr += 2;
    }
    // Reset to run the new firmware
    PFIC_CFGR = 0xFA050000 | (1 << 7);    // SYSRESET
}
```

> 🏗️ **Building a full bootloader** is a big project (CRC check, signature, fallback, …). See the WCH `iap` libraries as a template.

---

## 11. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| Hard-Fault on write | You're writing to the page you're executing from | Use a page at the end |
| PGERR in STATR | Tried to write to a non-erased cell | Erase the page first |
| WRPRTERR | Writing to a protected page | Adjust WRP in Option Bytes |
| Key sequence fails | Wrote the two keys incorrectly | KEY1 then KEY2 in order |
| `*(volatile uint16_t *)addr = data;` fails | Forgot `PG=1` | Enable it |
| Data vanishes after reset | You picked RAM instead of Flash | Check the address |

---

## 12. Exercises

1. **Counter persisting**: increments on every reset, stored in Flash.
2. **LED state**: a button toggles an LED; the state survives resets.
3. **Wear leveling**: implement a system that rotates between 4 pages.
4. **Config menu**: over UART, tune brightness and baud, save.
5. **CRC over Flash data**: verify integrity with CRC16.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §1.2.1 "Memory Allocation" — page 3
  - Flash Memory Controller chapter (consult the index)
- **WCH AN-IAP** — In-Application Programming guide.
- **ST AN2594** — EEPROM Emulation (the same principle applies to the CH32V003).
