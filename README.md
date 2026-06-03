# CH32V003 Journey

> Arabic-first bare-metal RISC-V curriculum for the WCH **CH32V003J4M6**.
> Live at **[ch32v003.shakir.sd](https://ch32v003.shakir.sd)**.

A structured, 22-lesson journey from your first Blinky to building production-grade firmware on a 30-cent RISC-V chip — written at the register level, with **CH32V003 Reference Manual v1.9** cross-references on every page.

Plus an interactive **[/playground](https://ch32v003.shakir.sd/playground)** where you can write register-level C and watch every bit flip live before flashing real silicon.

![CH32V003 Journey screenshot](./public/og.png)

## Why this exists

Most bare-metal learning material is English-only and assumes an STM32/ARM background. The CH32V003 is dirt-cheap (sub-$0.50), RISC-V, and underrepresented in Arabic learning resources. This curriculum closes that gap.

## What's inside

### 22 register-level lessons

| Track | Lessons |
|-------|---------|
| **Foundation** | Curriculum overview, bitwise magic, registers intro, GPIO output |
| **Core I/O** | GPIO input + EXTI, clock system, SysTick, NVIC/PFIC, Timers + PWM |
| **Comms** | UART (deep), SPI master, I2C + SSD1306 OLED |
| **Analog** | ADC, DMA |
| **Pro** | Low-power modes, Watchdog (IWDG/WWDG), Flash programming + EEPROM emulation, Linker + Startup, Debugging |
| **Capstone** | Final project — 5×5 LED matrix with UART control |

### J4M6 Playground — interactive simulator

A browser-only register-level simulator for the CH32V003J4M6, at `/playground`. Write C-like code, watch every bit flip in every register, see pin status change live. No toolchain required, no chip required.

**Modelled** (all faithful to RM v1.9):

- **GPIO** (A/C/D): CFGLR mode + CNF encoding, OUTDR, BSHR/BCR atomic set/reset (with the RM-correct "BS wins over BR" priority), pin status badges for HIGH/LOW/INPUT/AF/ADC/HI-Z
- **RCC**: HSI/HSE/PLL/LSI on→ready handshake, SW↔SWS reconciliation gated on the source's RDY bit
- **SysTick**: STE/STIE/STRE/SWIE, CMP/CNT/CNTIF with the auto-reload + write-1-no-effect semantics
- **PFIC**: IENR1/IRER1/ISR1 with the write-1-to-set vs write-1-to-clear pattern. The gate is enforced — a SysTick CNTIF latch with STIE=1 but PFIC bit 12 off won't dispatch the ISR (matching real silicon)
- **Bare-metal interrupt dispatch**: define `void SysTick_Handler() { … }` and the simulator routes vector 12 to it. Same for `SW_Handler` (vector 14)

**Pedagogy**:

- **Step / Run / Resume / Reset** controls, with a speed slider and a separate SysTick "ticks-per-step" knob (1× to 1M×) so the same blink example can be watched bit-by-bit OR run at near real-time
- **Per-bit flash** on every register write; the just-touched register gets a warning-coloured glow
- **Transient values** — atomic ops like `BSHR = (1<<1)` momentarily show the written value before hardware reclaims it, so the learner sees what they wrote, not just the post-tick result
- **Diagnostics**: writes to unmapped MMIO get warned; impossible RCC states (clearing HSION while it's the active SYSCLK) get called out; missing PFIC enable on a CNTIF firing gets a specific "add `PFIC_IENR1 |= (1 << 12);`" hint
- **6 presets** — Blink PC1/PC4 with inline busy-wait (truly bare-metal — no framework calls), multi-port enable, BSHR/BCR atomic demo, sysclk → PLL switch (with the failure case alongside), SysTick blink with PFIC + ISR

Each lesson that exercises a supported peripheral surfaces a "Try in the playground" button that deep-links to the matching preset.

## Stack

- **Nuxt 4** + **@nuxt/content v3** for content
- **Nuxt UI Pro** + **Tailwind 4** for styling
- **@nuxtjs/i18n** — Arabic (RTL, default) + English (LTR)
- **Cyberpunk** design system (dark HUD aesthetic, neon accents)
- Markdown lessons stored in `content/lessons/*.md`

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production
pnpm preview      # preview the build
```

Node 18+ required.

## Project layout

```
app/
  components/      # AppHeader, AppFooter, Logo
    sim/           # ChipDiagram, RegisterPanel, CodeEditor (CodeMirror 6),
                   # ControlBar, Tutorial, PresetMenu, Console
  pages/           # index, lessons/*, about, resources, playground
  composables/     # useSimulator, useLessonProgress
  sim/             # simulator engine (pure TS, no Vue)
    lexer.ts       # tokenizer
    parser.ts      # recursive-descent → AST
    ast.ts         # AST node types
    interpreter.ts # step-by-step executor + ISR dispatch
    bus.ts         # MMIO router with transactional writes
    interrupts.ts  # PFIC + InterruptController
    registers.ts   # register dictionary
    presets.ts     # preset snippets
    peripherals/   # gpio, rcc, systick, pfic
  layouts/         # default cyberpunk layout
  assets/main.css  # cyberpunk design tokens
content/
  lessons/         # 22 markdown lessons (L00..L21)
i18n/locales/      # en.json, ar.json
public/
  hardware/        # WCH-LinkE + chip images
  robots.txt
server/
  routes/          # sitemap.xml endpoint
```

## Author

**Shakir Abdo** — full-stack developer from Sudan, interested in embedded systems and low-level tooling.

- **GitHub**: [@shakir-abdo](https://github.com/shakir-abdo)
- **X**: [@shakir_abdoo](https://x.com/shakir_abdoo)
- **Telegram**: [@shakir_abdo](https://t.me/shakir_abdo)
- **Website**: [shakir.sd](https://shakir.sd)
- **Support**: [PayPal](https://paypal.me/shicolare1)

### Related projects

- [`ch32v003j4m6-libraries`](https://github.com/shakir-abdo/ch32v003j4m6-libraries) — register-level libraries for GPIO, ADXL345, MPU6050, AHT10, MLX90614, AS5600, Servo, WS2812B, Buzzer, AT24C32, internal-EEPROM, deep-sleep, rotary encoder.
- [`ch32v003-unbrick`](https://github.com/shakir-abdo/ch32v003-unbrick) — CLI tool to recover a bricked CH32V003 via WCH-LinkE.

## Contributing

Issues + PRs welcome. Typo fixes, lesson improvements, English translations of lesson content — all appreciated. Open an issue first for large changes so we can align on direction.

## License

Dual-licensed — code and content under different terms on purpose.

- **Source code** (`app/`, `server/`, `nuxt.config.ts`, build scripts, components, styles): **MIT** — see [LICENSE](LICENSE). Reuse freely in your own projects.
- **Lesson content** (`content/lessons/**`, hardware images, educational copy): **CC BY-NC-SA 4.0** — see [LICENSE-CONTENT](LICENSE-CONTENT).

**Plain English:**
- ✅ Learn from it, contribute, translate, reuse code snippets.
- ✅ Fork it for educational/non-commercial purposes (attribute the source).
- ❌ Don't rebrand and re-upload the curriculum as your own product.
- ❌ Don't bundle the lessons into a paid course or commercial offering.

If you want to do something the license doesn't cover (e.g. include excerpts in a paid book or course), reach out — happy to discuss.

---

*Built register by register. Hope this saves you hours.*
