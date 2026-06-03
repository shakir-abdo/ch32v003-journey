---
order: 2
slug: "l02-registers-intro"
title: "Registers and Bit Operations"
title_en: "Registers Intro"
icon: "i-lucide-cpu"
track: "foundation"
level: "beginner"
minutes: 20
tags: ["registers", "mmio"]
---

# Lesson 02: Registers and Bit Operations (the fundamentals)

> **Revised edition** | Addresses and offsets verified against Reference Manual v1.9.

---

## 1. What even is a register?

Picture the MCU as a tiny computer — and like any computer, it has memory (RAM).

But here's the fun twist 🎁:

In a regular computer, every memory address is just RAM. In an MCU, some addresses aren't memory at all — they're **hardware control knobs**:

| Address | On a regular computer | On the `CH32V003` |
|---------|--------------------|------------------|
| `0x20000000` | Regular RAM | Start of RAM (2 KB) |
| `0x40011000` | Regular RAM | Start of the `GPIOC` registers 😱 |
| `0x4001100C` | Regular RAM | `GPIOC_OUTDR` — the pins' value |
| `0x40011010` | Regular RAM | `GPIOC_BSHR` — atomic Set/Reset |

So on an MCU, some memory addresses aren't memory — **they're hardware control knobs!** 🎛

Write a value to a specific address → an LED lights up. Write to another → it turns off.

These special addresses are called **registers**.

> 💡 **Term**: this style of addressing is called **Memory-Mapped I/O (MMIO)**. The CPU doesn't distinguish between RAM and a register — it writes to an address, and the bus decoder decides whether the access lands on RAM or on a peripheral.

---

## 2. The REST API analogy (for the web developers)

Imagine the MCU has an internal REST API:

```js
// POST /gpioc/bshr — turn a pin on
await fetch('0x40011010', { method: 'POST', body: 0b0010 });
// PC1 → is now HIGH!

// POST /gpioc/bcr — turn a pin off
await fetch('0x40011014', { method: 'POST', body: 0b0010 });
// PC1 → is now LOW!
```

Except instead of HTTP… you use memory directly. You write to an address… and the hardware reacts!

> 🔑 The difference: a REST call needs a network round-trip (milliseconds). Here a write takes **one clock cycle** (~20 nanoseconds at 48 MHz).

---

## 3. Why write `GPIOC_BSHR` instead of `0x40011010`?

Because nobody wants to memorize numbers! 🫠

WCH's official files provide ready-made `structs`:

```c
// This struct ships in the WCH headers:
typedef struct {
    volatile uint32_t CFGLR;    // 0x00 — pin configuration
    volatile uint32_t CFGHR;    // 0x04 — high-pin configuration (unused on CH32V003)
    volatile uint32_t INDR;     // 0x08 — pin readback
    volatile uint32_t OUTDR;    // 0x0C — pin write
    volatile uint32_t BSHR;     // 0x10 — set pins (atomic)
    volatile uint32_t BCR;      // 0x14 — clear pins (atomic)
    volatile uint32_t LCKR;     // 0x18 — lock configuration
} GPIO_TypeDef;

// Then a ready-made pointer:
#define GPIOC    ((GPIO_TypeDef *)0x40011000)
```

So when you write:

```c
GPIOC_BSHR = (1 << 1);
```

It's exactly the same as:

```c
*(volatile uint32_t *)0x40011010 = (1 << 1);
```

But `GPIOC_BSHR` is easier and clearer! ✨

> 💡 **Why is `volatile` important?** Without `volatile` the compiler may delete the read/write because it "looks pointless". With `volatile` it's forced to execute every operation exactly as written.

---

## 4. Every peripheral has a clock… RCC (the breaker panel)

**RCC = Reset and Clock Control**

Picture the RCC as your home's electrical breaker panel:

| Peripheral | State |
|------------|--------|
| `GPIOA`    | ⚡ ON  |
| `GPIOC`    | ⚡ ON  |
| `USART1`   | ⚡ ON  |
| `SPI1`     | ❌ OFF |
| `TIM1`     | ⚡ ON  |

If you don't flip the breaker for a particular room, the lights won't work. Same on the MCU — if you don't set the `GPIOC` bit in the `APB2PCENR` register, the pins don't work!

### APB2PCENR register (bit layout on CH32V003)

| Bit | Peripheral |
|------|----------------|
| 0 | AFIO |
| 2 | IOPAEN (GPIOA) |
| 4 | **IOPCEN (GPIOC)** |
| 5 | IOPDEN (GPIOD) |
| 9 | ADC1EN |
| 11 | TIM1EN |
| 12 | SPI1EN |
| 14 | USART1EN |

> 🎯 **Bit number 4 = IOPCEN = PC port clock enable**.

```c
// Enable GPIOC:
RCC_APB2PCENR |= (1 << 4);
// Or the cleaner form:
RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */;
```

---

## 5. GPIO registers

| Register | Abbreviation expanded | Meaning |
|------|-------------|--------|
| `CFGLR` | **C**on**F**i**G**uration **L**ow **R**egister | Config for the first 8 pins (PC0–PC7) |
| `CFGHR` | **C**on**F**i**G**uration **H**igh **R**egister | Config for the remaining pins (unused on CH32V003) |
| `BSHR` | **B**it **S**et/Reset / **H**igh **R**egister | Turn a pin on instantly (atomic) |
| `BCR` | **B**it **C**lear **R**egister | Turn a pin off instantly (atomic) |
| `OUTDR` | **OUT**put **D**ata **R**egister | The pins' current output value |
| `INDR` | **IN**put **D**ata **R**egister | Read the pins |

### CFGLR — every pin has 4 config bits

```
PC0 = bits  0-3       PC4 = bits 16-19
PC1 = bits  4-7       PC5 = bits 20-23
PC2 = bits  8-11      PC6 = bits 24-27
PC3 = bits 12-15      PC7 = bits 28-31
```

---

## 6. Bit Operations — the symbols on bits

### `<<` and `>>` — bit shifts

```c
1 << 0  =  1    (0001)
1 << 1  =  2    (0010)
1 << 2  =  4    (0100)
1 << 3  =  8    (1000)
1 << 4  = 16    (0001 0000)
```

> 🎯 **The right reading**: `1 << N` means "take the number 1 and shift it N places to the left" → result: a mask with only one bit on — bit number N.

### `|` (OR) and `|=` — add without erasing the rest

```
  0001 0000  (GPIOC)
| 0000 0100  (GPIOA)
= 0001 0100  ← both together!
```

```c
// ❌ wrong — wipes everything:
RCC_APB2PCENR = (1u << 4)  /* IOPCEN */;

// ✅ right — adds to the list:
RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */;
```

> 🧠 Golden rule: `x |= y` ≡ `x = x | y` ≡ "take the old + add to it".

### `&` (AND) and `&= ~` — clear the targeted bits, keep the rest

```
~ = NOT = flip every bit:
~0b00001111 = 0b11110000
```

```c
GPIOC_CFGLR &= ~(0xF << (4 * 1));
//                 ↑       ↑
//                 │       │
//                 │       └─ shift them to PC1's slot (starts at bit 4)
//                 └────── 0xF = 0b1111 = 4 bits
// ~(...) = invert them
// &=     = clear only PC1 (the rest stays as it was)
```

> 🧠 Golden rule: `x &= ~y` ≡ "take the old - remove `y` from it".

### `^` (XOR) and `^=` — flip the state (toggle)

```c
GPIOC_OUTDR ^= (1 << 1);   // if PC1=1 it becomes 0, and vice versa
```

> ⚠️ **Warning**: applying this to `OUTDR` isn't atomic (read-modify-write). For an atomic toggle, use `BSHR` and `BCR` along with a known state.

---

## 7. Summary — the symbols table

| Symbol | What does it do? | Example | Meaning |
|-------|-----------|------|--------|
| `(1 << N)` | Makes bit N = 1 | `(1 << 4) = 16` | "Turn on bit number N only" |
| `x \|= y` | Add `y` onto `x` | `a \|= 0b0100` | Turn bits on… everything else stays |
| `x &= ~y` | Clear `y` from `x` | `a &= ~0b0100` | Clear bits… everything else stays |
| `x ^= y` | Flip `y`'s bits in `x` | `a ^= 0b0100` | toggle (not atomic) |
| `0xF` | The number 15 (4 bits all 1) | `= 0b1111` | hex shorthand |
| `0xFF` | 8 bits all 1 | `= 255` | a full byte |

---

## 8. Practical code — Task 1.1: Blink LED

```c
int main(void) {
    // HSI = 24 MHz by default at boot — no clock setup needed here

    // 1. Turn on the GPIOC breaker
    RCC_APB2PCENR |= (1u << 4)  /* IOPCEN */;

    // 2. Configure PC1 = output push-pull 50MHz
    GPIOC_CFGLR &= ~(0xF << (4 * 1));     // clear PC1
    GPIOC_CFGLR |=  (0b0011 << (4 * 1));  // 50MHz push-pull

    while (1) {
        GPIOC_BSHR = (1 << 1);     // turn PC1 on
        delay(500 * 8000);
        GPIOC_BCR  = (1 << 1);     // turn PC1 off
        delay(500 * 8000);
    }
}
```

---

## 9. Comprehension questions

1. If you wanted to drive an LED on PC4 instead of PC1, which numbers in the code would change?
   - Hint: 3 numbers change (twice in `CFGLR`, and in `BSHR`/`BCR`).
2. Why did we use `|=` with `APB2PCENR` and not just `=`?
3. Why do we first clear `CFGLR` with `&= ~(…)` and then write with `|=`?
4. What's the difference between `BSHR = (1<<1)` and `OUTDR |= (1<<1)`? When does it matter? (Hint: interrupts.)
5. If we write `GPIOC_BSHR = (1<<1) | (1<<17);` — what happens? (The same pin gets a SET and a RESET request.)

---

## 📖 Sources

- *CH32V003 Reference Manual* — Chapter 3 (RCC) + Chapter 7 (GPIO).
- *CH32V003 Datasheet* — from WCH's website.
- *Mdot2Matrix* — https://github.com/bitluni/Mdot2Matrix
