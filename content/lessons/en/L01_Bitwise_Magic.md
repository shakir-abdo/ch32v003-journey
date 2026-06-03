---
order: 1
slug: "l01-bitwise-magic"
title: "Bitwise Magic — the wizard's handbook"
title_en: "Bitwise Magic"
icon: "i-lucide-binary"
track: "foundation"
level: "beginner"
minutes: 20
tags: ["bitwise", "foundation"]
---

# Lesson 01: The wizard's handbook for register control 🧙

> **Revised edition** | Full focus on building visual intuition for bit operations before touching any register.

---

## Intro: decoding the numbers

There's one shared frustration when you move into hardware programming: reading and understanding bit expressions like `(1 << N)` or `(1 << (16 + 1))` is hard.

This handbook is your shortcut to flipping your mental model — from seeing numbers as **"values"** to seeing them as **"banks of light switches"**.

---

## The core trick: picture a register as a panel of switches

Imagine any 32-bit register (like `GPIOC_CFGLR` or `GPIOC_BSHR`) as a long electrical panel with **32 switches**, numbered **from right to left** (0 to 31).

```
[switch 31] [switch 30] ... [switch 2] [switch 1] [switch 0]
```

Your job is always to control a specific switch (or group of switches) **without touching the rest**.

> 💡 **Reminder**: on modern processors a register is "Little-Endian conceptually" — the least significant bit (LSB) is bit 0 on the right.

---

## The main tool: `<<` (Left Shift) — "go to switch number…"

This is the most important tool in your toolbox. It's how you target a specific switch.

```c
1 << N
```

**Plain English**: "give me a mask with exactly one switch on — number N."

```
1 << 0  →  0...00001    (targets switch 0)
1 << 1  →  0...00010    (targets switch 1)
1 << 5  →  0...100000   (targets switch 5)
1 << 17 →  ...10000000000000000  (targets switch 17)
```

> ⚠️ **Common mistake**: some people think `1 << 5` means "shift the number 5 five places left". The correct reading: **shift the number 1 five places left** → result is 32.

---

## Three magic recipes to control the panel

Once you know how to target a switch, you only need these three recipes.

### Recipe 1: turning a bit ON (SET)

- **The task**: turn switch N on without affecting the rest.
- **The tool**: `|` (Bitwise OR) — this tool **"adds" but never "removes"**.
- **The recipe**:

```c
REGISTER |= (1 << N);
```

- **Translation**: "panel, keep all your current lights on, and just add the light at switch N."

#### Visual example

```
Task: turn bit 1 ON in 0b00000100

  0000 0100   (current state)
| 0000 0010   ← (1 << 1)
─────────────
= 0000 0110   ✨ bit 1 is now on + bit 2 untouched
```

---

### Recipe 2: turning a bit OFF (CLEAR)

- **The task**: turn switch N off without affecting the rest.
- **The tools**: `&` (Bitwise AND) and `~` (Bitwise NOT).
- **The recipe**:

```c
REGISTER &= ~(1 << N);
```

#### Step by step

```
1. (1 << N)         →  ...00100...   (mask targeting switch N)
2. ~(1 << N)        →  ...11011...   (inverted: everything is 1 except N)
3. REGISTER &= ...  →  every bit & 1 = itself, but bit N & 0 = 0
```

- **Translation**: "panel, keep everything as is, but **make sure switch N is off**."

#### Visual example

```
Task: clear bit 1 in 0b00000110

  0000 0110   (current state)
& 1111 1101   ← ~(1 << 1)
─────────────
= 0000 0100   ✨ bit 1 is now off + bit 2 untouched
```

---

### Recipe 3: flipping a bit (TOGGLE)

- **The task**: flip switch N (on → off, off → on).
- **The tool**: `^` (Bitwise XOR).
- **The recipe**:

```c
REGISTER ^= (1 << N);
```

- **Translation**: "panel, go to switch N **and flip its current state**."

#### XOR rule

```
0 ^ 0 = 0      0 ^ 1 = 1
1 ^ 0 = 1      1 ^ 1 = 0   ← the magic: a 1 flips the state
```

> ⚠️ On peripherals, `^=` is not atomic. There's no direct toggle on `BSHR`/`BCR` — use a state variable so you always know the current value.

---

## Decoding the "magic numbers" in real code

The reason for those arithmetic expressions inside the parentheses is the **clever register layout** designed to make life easier for the programmer.

### Case 1: `(PIN_NUMBER * 4)` in CFGLR

**Why**: the `CFGLR` register is the configuration register for 8 pins (PC0–PC7). Each pin needs **4 bits** to set its mode (MODE + CNF). So the register is split into 8 groups of 4 bits each.

**The arithmetic trick**: to reach **the start of any pin's group**, multiply its number by 4.

| Pin | Group start | Math |
|--------|----------------|---------|
| PC0 | bit 0 | `4 * 0` |
| PC1 | bit 4 | `4 * 1` |
| PC2 | bit 8 | `4 * 2` |
| PC7 | bit 28 | `4 * 7` |

```c
// Clear PC1's configuration (4 bits starting at bit 4):
GPIOC_CFGLR &= ~(0xF << (4 * 1));
//                ↑    ↑   ↑
//                │    │   └── multiply pin number by 4 to reach the group's start
//                │    └────── shift the mask to the pin's location
//                └─────────── a mask of 4 bits on
```

**Translation**: "give me a 4-bit mask (`0xF`), shift it to start at switch 4 (PC1's group start), invert it (`~`), then use it to clear those four bits."

---

### Case 2: `(PIN_NUMBER + 16)` in BSHR

**Why**: this register is genius and designed **with two halves** to enable atomic operations:

| Half | Bits | Function | Meaning of writing `1` |
|--------|---------|---------|------------------|
| **Upper** | `[31:16]` | RESET — the clear half  | The pin goes `LOW` |
| **Lower** | `[15:0]`  | SET — the set half      | The pin goes `HIGH` |

**The arithmetic trick**:

| Task | Math | Code |
|--------|--------|-------|
| Turn PC1 on | switch 1 in the SET half | `(1 << 1)` |
| Turn PC1 off via BSHR | switch (1 + 16) in the RESET half | `(1 << (16 + 1))` |
| Turn PC1 off via BCR (cleaner) | switch 1 in BCR | `BCR = (1 << 1)` |

```c
GPIOC_BSHR = (1 << (16 + 1));
```

**Translation**: "target switch number 17, which means to this register: **turn pin number 1 off**."

> 💡 **Why have both `BSHR` and `BCR`?** `BSHR` can do SET + RESET in one write (useful). `BCR` is a simpler clear-only version — fewer mistakes possible.

---

## More useful recipes

### Read the state of a specific bit

```c
if (GPIOC_INDR & (1 << 1)) {
    // PC1 = HIGH
}
```

### Write several bits at once (clean Read-Modify-Write)

```c
// Write 0b1010 into bits [7:4] of a register:
REGISTER = (REGISTER & ~(0xF << 4)) | (0b1010 << 4);
```

### Test multiple bits together

```c
// All the bits must be 1:
if ((REG & mask) == mask) { /* all ones */ }

// Any bit is 1:
if (REG & mask) { /* any one */ }
```

---

## Common mistakes and traps

| The mistake | Why it's wrong | The fix |
|-------|-----------|---------|
| `REG = (1 << N)` | Wipes every other bit | `REG \|= (1 << N)` |
| `REG &= (1 << N)` | Clears everything **except** N | `REG &= ~(1 << N)` |
| `1 << 32` | Undefined behavior in C | Use a wider type, or lower the value |
| `int x = 1 << 31` | On a 32-bit `int` this overflows | Use `unsigned` |
| `(1 << N) - 1` for masks | Fine for N≤30, breaks at N=31 | Use `~0u >> (32-N)` |

---

## One-picture summary

```
                   ┌─────────────────────────┐
                   │      bit operations     │
                   └─────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
           set a bit       clear a bit     toggle a bit
              │               │               │
          x |= mask      x &= ~mask      x ^= mask
              │               │               │
            mask =          mask =          mask =
          (1 << N)        (1 << N)        (1 << N)
```

---

## 📖 Further reading

- *CH32V003 Reference Manual* — every GPIO + RCC register.
- The book **"Hacker's Delight"** (for the deep dive) — endless bitwise tricks.
- *Bit Twiddling Hacks* — https://graphics.stanford.edu/~seander/bithacks.html
