# CH32V003J4M6 Simulator — Plan

Branch: `feat/simulator` (do NOT merge to main until v1 is done)
Goal: a separate page where the learner writes register-level C-like code and watches the chip react pin-by-pin, step-by-step.

## Scope of v1

- Chip: **CH32V003J4M6 only** (8-pin SOP-8). 6 usable GPIOs: PD6, PA2, PC1, PC2, PC4, PD4.
- Peripherals simulated: **GPIO + RCC only** (covers L00–L05).
- Code fidelity: **C-like DSL** (not real C). Same syntax the lessons already use — no toolchain in browser.
- Execution: **manual Step** (Run/Step/Pause/Reset), one statement per click; current line highlighted, changed registers flashed.

Out of scope for v1: SysTick, EXTI, TIM, UART, SPI, I2C, ADC, interrupts, pointers beyond `*(volatile u32*)addr`, structs, malloc.

## Page

- Route: `/playground` (Arabic title: "المختبر"). Hide from main nav until v1 ships.
- 3-pane layout (registers are the centerpiece — no virtual LEDs/buttons):
  - **Left**: code editor (CodeMirror 6 minimal).
  - **Center**: chip SVG (8 pins arranged like the J4M6 photo). Each GPIO pin shows a small badge with its **current status**:
    - `HIGH` / `LOW` for digital output
    - `INPUT` (floating / pull-up / pull-down sub-tag)
    - `AF` (Alternate Function — annotate with which peripheral: USART, I2C, SPI…)
    - `ADC` for analog input
    - `HI-Z` when port clock is off or pin not configured
    - `VCC` / `GND` for the two power pins (static labels)
  - **Right**: register inspector — **all** simulated registers listed. Each register row shows:
    - **Name + hex value** (e.g. `RCC_APB2PCENR  0x00000010`)
    - **32 individual bit cells**, MSB→LSB, each cell is a small square showing `0` or `1`. Bit position numbers above (`31 30 29 … 1 0`).
    - **Field labels** under groups of bits per the RM (e.g. for `GPIOC_CFGLR`: `CNF7|MODE7 | CNF6|MODE6 | … | CNF0|MODE0`).
    - **Real-time bit-level highlighting**: when a step changes the register, only the bits that flipped flash (green = 0→1, red = 1→0) for ~600 ms then settle. This is the centrepiece — the learner should *see* which bits the line they just executed turned on or off.
  - Both panels (pin status + register inspector) update inside the same step transaction so a pin going HIGH and the bit in `OUTDR` flipping are visually synchronised.
- **Bottom strip**: control bar (Run / Step / Pause / Reset / speed slider) + console for errors and informational messages.

## Engine architecture

```
app/sim/
  parser.ts          recursive-descent → AST (statements + expressions)
  interpreter.ts     AST walker, one step = one statement
  registers.ts       address ↔ name dictionary (single source of truth)
  bus.ts             MMIO read/write router
  peripherals/
    rcc.ts           RCC_CTLR, CFGR0, APB2PCENR, RSTSCKR + ready-bit autoset
    gpio.ts          GPIOA/C/D CFGLR, OUTDR, BSHR, BCR, INDR
  types.ts
app/composables/
  useSimulator.ts    reactive bridge between engine and Vue components
app/components/sim/
  ChipDiagram.vue
  CodeEditor.vue
  RegisterPanel.vue
  ControlBar.vue
  Console.vue
app/pages/
  playground.vue
```

### Parser subset

Statements: `#define NAME value`, declaration (`u32 x = …`), assignment, compound assignment (`|= &= ^= <<= >>=`), `if/else`, `while`, `for`, function definition (only `main`), function call (`Delay_Ms` etc. — built-ins).

Expressions: integer literals (dec/hex `0x..`/bin `0b..`), identifiers, `( … )`, unary `~ - !`, binary `+ - * / % << >> & | ^ < <= > >= == != && ||`, ternary, cast `(volatile u32*)expr`, dereference `*expr`.

Built-ins (host-provided): `Delay_Ms(ms)`, `Delay_Us(us)` — advance simulated time and update pin states; nothing else.

### Interpreter contract

`step()` → executes one statement → returns:

```ts
{
  lineRange: [start, end],
  writes: Array<{
    register: string,        // e.g. "RCC_APB2PCENR"
    address: number,
    oldValue: number,
    newValue: number,
    bitsFlipped: number[]    // exact bit positions that changed — drives the per-bit flash animation
  }>,
  pinChanges: Array<{pin: string, oldStatus: PinStatus, newStatus: PinStatus}>,
  log?: string
}
```

The UI consumes this diff and animates each flipped bit (red/green) and each pin status badge synchronously.

MMIO writes detected by address range:
- `0x40021000–0x4002103F` → RCC
- `0x40010800–0x4001083F` → GPIOA
- `0x40011000–0x4001103F` → GPIOC
- `0x40011400–0x4001143F` → GPIOD

Anything else → silent (or warning in console).

### Pin model

Each pin has: `{name, mode, cnf, level, status}` where `status` is the user-facing label (HIGH, LOW, INPUT, AF, ADC, HI-Z). Computed from:
1. RCC clock enabled for that port? if no → `HI-Z`
2. Mode bits (2-bit): `00` = input → resolve to `INPUT` + sub-status (floating/PU/PD via CNF + ODR)
3. CNF bits (2-bit) when mode≠00: `00/01` = push-pull/open-drain output → `HIGH`/`LOW` based on ODR/BSHR/BCR; `10/11` = AF push-pull/open-drain → `AF` (sub-label = which peripheral, derived from pin mapping); when mode=00 + CNF=11 → `ADC`
4. Last `BSHR`/`BCR`/`OUTDR` write applies for output bits

Pin ↔ physical position hard-coded for J4M6:

| Pin | Net |
|-----|-----|
| 1 | PD6 (USART1_TX default) |
| 2 | GND |
| 3 | PA2 |
| 4 | VCC |
| 5 | PC1 (I2C1_SDA default) |
| 6 | PC2 (I2C1_SCL default) |
| 7 | PC4 (ADC IN2) |
| 8 | PD4 (SWIO — debug) |

## Phases

1. **Scaffold + chip SVG** — playground.vue route, ChipDiagram with 8-pin SVG, no logic.
2. **Register state + peripherals** — bus.ts, rcc.ts, gpio.ts; unit tests for ready-bit handshake, BSHR/BCR semantics, CFGLR mode resolution.
3. **Parser** — DSL → AST with line tracking; unit tests cover all bitwise patterns used in L00–L05.
4. **Interpreter** — step()/run(); error reporting in Arabic with line numbers.
5. **UI wiring** — CodeMirror + register panel + chip diagram reactive to step diff; highlight current line.
6. **Presets** — load each lesson's example code as a one-click preset.
7. **i18n + RTL polish + dark/light** — Arabic strings, RTL layout for the code editor pane.

Estimate: ~2–3 weeks single-developer focused. Each phase is independent and committable.

## Decisions still open

- Editor: CodeMirror 6 (richer) vs plain `<textarea>` with line numbers (lighter). Lean CodeMirror.
- Run speed when not stepping: 1 stmt/200 ms default? Adjustable?

## Non-goals (explicitly)

- Cycle accuracy or real-time delays.
- Compiling real C — out of scope; if needed later, separate `feat/wasm-sim` branch.
- Writing a flashable binary back to the chip.
- Multi-chip / multi-MCU support.
- Virtual LEDs / buttons / external components wired to pins. The chip diagram is read-only and only displays the pin's logical status (HIGH/LOW/INPUT/AF/ADC/HI-Z).
