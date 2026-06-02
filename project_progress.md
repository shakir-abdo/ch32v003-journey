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
- 3-pane layout:
  - **Left**: code editor (CodeMirror 6 minimal).
  - **Center**: chip SVG (re-uses pinout image as reference) + 6 pin chips showing HIGH/LOW/HI-Z/AF.
  - **Right**: register inspector (RCC + GPIOA/C/D), diffs highlighted, hex/bin toggle.
- **Bottom strip**: control bar (Run / Step / Pause / Reset / speed slider) + console for errors.

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

`step()` → executes one statement → returns `{lineRange, writes: RegisterWrite[], pinChanges: PinChange[], log?: string}`. UI consumes the diff to animate.

MMIO writes detected by address range:
- `0x40021000–0x4002103F` → RCC
- `0x40010800–0x4001083F` → GPIOA
- `0x40011000–0x4001103F` → GPIOC
- `0x40011400–0x4001143F` → GPIOD

Anything else → silent (or warning in console).

### Pin model

Each pin has: `{name, mode, cnf, level, drive}`. Output level recomputed from:
1. RCC clock enabled for that port? if no → HIGH-Z
2. Mode bits 2-bit (input/output speed)
3. CNF bits 2-bit (push-pull/open-drain/AF/analog)
4. Latest `BSHR`/`BCR`/`OUTDR` write for the bit

Pin → physical position on chip diagram is hard-coded for J4M6.

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
- Should the chip diagram show LED helpers a learner can wire to a pin? Probably yes — adds clarity. Future phase.

## Non-goals (explicitly)

- Cycle accuracy or real-time delays.
- Compiling real C — out of scope; if needed later, separate `feat/wasm-sim` branch.
- Writing a flashable binary back to the chip.
- Multi-chip / multi-MCU support.
