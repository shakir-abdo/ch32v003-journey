---
order: 15
slug: "l15-watchdog"
title: "Watchdogs (IWDG/WWDG)"
title_en: "Watchdog (IWDG/WWDG)"
icon: "i-lucide-shield-check"
track: "pro"
level: "advanced"
minutes: 40
tags: ["iwdg", "wwdg"]
---

# Lesson 15: Watchdogs — IWDG and WWDG to Rescue the System

> **Reference:** CH32V003 RM v1.9
> - Chapter 4 "Independent Watchdog (IWDG)" — pages 25–27
> - Chapter 5 "Window Watchdog (WWDG)" — pages 27–32

---

## 📋 Register definitions for this lesson

Copy this block to the top of `main.c` before running any example from this lesson. The examples below assume these definitions are present.

```c
typedef unsigned int u32;

// ── RCC ──────────────────────────────────────────────
#define RCC_BASE    0x40021000
#define RCC_APB1PCENR   (*(volatile u32*)(RCC_BASE + 0x1C))
#define RCC_RSTSCKR     (*(volatile u32*)(RCC_BASE + 0x20))

// ── GPIOC ──────────────────────────────────────────────
#define GPIOC_BASE    0x40011000
#define GPIOC_BSHR      (*(volatile u32*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile u32*)(GPIOC_BASE + 0x14))

// ── IWDG ──────────────────────────────────────────────
#define IWDG_BASE    0x40003000
#define IWDG_CTLR       (*(volatile u32*)(IWDG_BASE + 0x00))
#define IWDG_PSCR       (*(volatile u32*)(IWDG_BASE + 0x04))
#define IWDG_RLDR       (*(volatile u32*)(IWDG_BASE + 0x08))

// ── WWDG ──────────────────────────────────────────────
#define WWDG_BASE    0x40002C00
#define WWDG_CTLR       (*(volatile u32*)(WWDG_BASE + 0x00))
#define WWDG_CFGR       (*(volatile u32*)(WWDG_BASE + 0x04))

// ── DBGMCU ──────────────────────────────────────────────
#define DBGMCU_BASE    0xE000D004
#define DBGMCU_CTLR     (*(volatile u32*)(DBGMCU_BASE + 0x00))

// Simple busy-loop delay (enough for basic examples)
static void delay(volatile u32 cycles) {
    while (cycles--) { __asm__ volatile ("nop"); }
}
```

> 💡 All addresses are pulled from *CH32V003 RM v1.9*, the chapter for each peripheral. The block is ordered by usage in this lesson.

---


## 0. What is a Watchdog?

Picture a slow countdown timer. Every so often, the program has to **reset it**. If the program forgets (because it's stuck in an infinite loop or has crashed), the watchdog hits zero and **reboots the chip**.

The goal: **guarantee the system comes back to life** no matter what unexpected error occurs. Essential for unsupervised devices (sensor remotes, washing machines, etc.).

---

## 1. IWDG vs WWDG — the difference

| Feature | IWDG | WWDG |
|---------|------|------|
| Source | LSI (128 kHz) | PCLK1 |
| Runs in Sleep | ✅ | ❌ |
| Runs in Standby | ✅ (if enabled) | ❌ |
| Early window | None | ✅ (limited flexibility) |
| Catches program acceleration | Weak | ✅ |
| Common use | **Real-world deployments** | Strict timing |

> 💡 In 90% of projects: use IWDG.

---

## 2. IWDG — anatomy

### Registers

| Register | Address | Description | RM page |
|-------|---------|--------|--------|
| `IWDG_CTLR` | `0x40003000` | Key | 26 |
| `IWDG_PSCR` | `0x40003004` | Prescaler | 27 |
| `IWDG_RLDR` | `0x40003008` | Reload value | 27 |
| `IWDG_STATR` | `0x4000300C` | Status | 27 |

### Keys

- `0xAAAA` → "reload" (kick the dog).
- `0x5555` → "open for writes" (to edit PSCR/RLDR).
- `0xCCCC` → "start" (enable).

> 🔐 These values prevent accidental modification due to bugs.

---

## 3. Computing the IWDG period

```
T = (RLDR + 1) × prescaler / 128 kHz
```

The prescaler is in `PSCR[2:0]`:

| PSCR | Divider |
|------|--------|
| 000 | /4 |
| 001 | /8 |
| 010 | /16 |
| 011 | /32 |
| 100 | /64 |
| 101 | /128 |
| 110 | /256 |
| 111 | /256 (reserved) |

### Example — a 1-second watchdog

```
Pick prescaler = /32 (PSCR=011) → LSI/32 = 4 kHz
RLDR = 4000 - 1 = 3999
T    = 4000 / 4000 = 1.0 s
```

### Example — 100 ms watchdog

```
prescaler = /4 → 32 kHz
RLDR = 3200 - 1 = 3199
T = 3200 / 32000 = 0.1 s
```

---

## 4. Core code

```c
void iwdg_init(uint16_t reload, uint8_t prescaler) {
    // 1) Open for writes
    IWDG_CTLR = 0x5555;

    // 2) Set prescaler and reload
    IWDG_PSCR = prescaler;
    IWDG_RLDR = reload;

    // 3) Reload once
    IWDG_CTLR = 0xAAAA;

    // 4) Start
    IWDG_CTLR = 0xCCCC;
}

static inline void iwdg_feed(void) {
    IWDG_CTLR = 0xAAAA;
}

int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    iwdg_init(3999, 3);   // 1s timeout

    while (1) {
        do_work();
        iwdg_feed();      // if work takes too long, the MCU reboots
        delay(800 * 8000);     // less than 1 second
    }
}
```

> 💀 **Once the IWDG starts, you can't stop it without a Reset.** Pick deliberately.

---

## 5. Testing the watchdog (a fun demo)

```c
int main(void) {
    // HSI = 24 MHz by default at boot — no clock init needed here
    led_init();
    iwdg_init(3999, 3);

    GPIOC_BSHR = (1 << 1);    // LED ON at boot
    delay(500 * 8000);
    GPIOC_BCR  = (1 << 1);    // LED OFF

    while (1);   // ← deliberately: hang
    // Result: IWDG triggers a Reset after 1 second
    // → LED lights up, turns off, then repeats the cycle every second
}
```

---

## 6. WWDG — a quick look

> 📖 *RM, Chapter 5 — page 27.*

WWDG = Window Watchdog. The difference:

- You must **reload the counter inside a specific time window**:
  - Not before a certain time (`W`).
  - And not after the counter decrements to 0.
- It catches **program acceleration** (if you reload too early).

### Registers

| Register | Description |
|------|--------|
| `WWDG_CTLR` | counter T[6:0] + WDGA |
| `WWDG_CFGR` | window W[6:0] + WDGTB + EWI |
| `WWDG_STATR` | EWIF |

### The equation

```
T_timeout = T_PCLK1 × 4096 × 2^WDGTB × (T[5:0] + 1)
```

### Typical use

```c
void wwdg_init(void) {
    RCC_APB1PCENR |= (1 << 11);                 // WWDG clock
    WWDG_CFGR = (0x7F)                          // W = 0x7F (full window)
               | (0b11 << 7);                    // WDGTB = /8
    WWDG_CTLR = (1 << 7)                        // WDGA: enable
               | (0x7F);                         // T = counter
}

void wwdg_feed(void) {
    WWDG_CTLR = (1 << 7) | (0x7F);
}
```

---

## 7. When do we feed the counter? A safe pattern

```c
while (1) {
    task_A();    // 50ms
    iwdg_feed();
    task_B();    // 100ms
    iwdg_feed();
    task_C();    // 30ms
    iwdg_feed();
    __asm__("wfi");
}
```

> ⚠️ **Don't feed the counter inside an ISR**. If the main loop is stuck but the ISR is kicking the dog, the watchdog is useless.

---

## 8. The watchdog while debugging

While debugging, the MCU may halt at a breakpoint and the watchdog quietly counts down on its own, then triggers a reset that wrecks your session.

### Solution: freeze the watchdog during debug

```c
DBGMCU_CTLR |= (1 << 0);    // DBG_IWDG_STOP
DBGMCU_CTLR |= (1 << 1);    // DBG_WWDG_STOP
```

> 📖 *RM, §4.2.2 "IWDG Debug Mode" — page 26.*

---

## 9. What to do after a Watchdog Reset

When the chip boots, you can determine the cause via `RCC_RSTSCKR`:

| Bit | Name | Meaning |
|------|-------|--------|
| 26 | PINRSTF | NRST pin reset |
| 27 | PORRSTF | Power-on reset |
| 28 | SFTRSTF | Software reset |
| 29 | **IWDGRSTF** | IWDG reset |
| 30 | **WWDGRSTF** | WWDG reset |
| 31 | LPWRRSTF | Low-power reset |

```c
if (RCC_RSTSCKR & (1 << 29)) {
    log("Crash recovered by IWDG\n");
    RCC_RSTSCKR |= (1 << 24);    // RMVF: clear flags
}
```

> 📖 *RM, §3.4.9 — page 23.*

---

## 10. Common mistakes

| Symptom | Cause | Fix |
|---------|------|------|
| MCU reboots at random | RLDR too small + long tasks | Increase RLDR or feed more often |
| Can't stop IWDG | This is a feature, not a bug | Full reset |
| WWDG doesn't work | Forgot the APB1 clock + WDGA | Check both |
| Debug session corrupts | You didn't freeze IWDG | `DBGMCU_CTLR` |
| Crash recovery doesn't trigger | RLDR way too large | Tune it to the slowest task |
| Wrong key | Used `0xAAAA` to edit PSCR | Use `0x5555` |

---

## 11. Exercises

1. **Watchdog Demo**: LED blinks fast, then crash → IWDG reboots. Repeat to verify.
2. **Reset reason**: after every reset, print the cause over UART.
3. **When to feed?**: if you have 3 tasks with different timings, pick a suitable feed rate.
4. **WWDG window**: implement the tight time window.
5. **AWU + IWDG**: sleep deeply, wake, feed, sleep again.

---

## 📖 References

- **CH32V003 RM v1.9**:
  - §4.2 "IWDG Function" — pages 25-26
  - §4.3 "IWDG Registers" — pages 26-27
  - §5.2 "WWDG Function" — pages 27-30
  - §5.3 "WWDG Registers" — pages 30-32
  - §3.4.9 "RCC_RSTSCKR" — page 23 (to read the reset cause)
