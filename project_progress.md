# CH32V003 Journey — Status

## Shipped
- Site live at ch32v003.shakir.sd (Nuxt 4 + @nuxt/content v3, MIT code / CC BY-NC-SA 4.0 content)
- 22 bilingual lessons (AR + EN) across 7 tracks: Foundation, Core I/O, Comms, Analog, Pro, Bonus, Capstone
- i18n: `prefix_except_default` strategy, Arabic at `/`, English at `/en/`
- Browser playground at `/playground` — register-level simulator, CodeMirror 6 editor
- Sim peripherals modelled: RCC, GPIO (A/C/D), SysTick (O(1) tick), PFIC interrupts
- Presets validated on real hardware (PC1 blink, SysTick blink)

## Hardware-portable gotchas (baked into presets)
- Busy-wait must use `volatile int i` — GCC -Os deletes non-volatile empty loops
- SysTick blink needs `__attribute__((interrupt))` + `csrsi mstatus, 0x8` on hw; sim skips inline asm
- HCLK default = 8 MHz (HSI / HPRE reset value 0010 = /3), NOT 24 MHz — affects every CMP/delay calculation

## Roadmap — compile + flash from browser (next big bet)

### Phase 0 — De-risking spikes
- ✅ **WebUSB ↔ WCH-LinkE feasibility** — `public/webusb-spike.html` proves every primitive needed for flash. Validated on hardware: LinkE v2.14 + CH32V003J4M6. All values byte-perfect vs minichlink.
  - WCH-LinkE VID=0x1A86 PID=0x8010 (WCH-Link mode, NOT CMSIS-DAP)
  - Interface 0 is Vendor Specific Class (255) → WebUSB-accessible
  - Bulk EP1 IN/OUT (0x81/0x01), 64-byte packets
  - LinkE-level commands work: identify (`81 0d 01 01`), chip detect, chip info, read-protect, close (`81 0d 01 ff`)
  - DMI register tunneling works via `81 08 06 [reg7] [be4] [op]` (op=1 read, op=2 write)
  - RISC-V abstract command + PROGBUF works (read+write modes, autoexec, x10/x11 setup via DMHARTINFO)
  - Read live MMIO from target works (RCC, GPIO, UNIID — byte-perfect)
  - Write live MMIO (RAM round-trip + GPIO toggle) works
  - **Critical:** `81 0d 01 ff` is NOT a true resume — it just closes LinkE session. After PROGBUF/DMCONTROL writes, must use `DMCONTROL = 0x40000001` (resumereq + dmactive) OR full reboot (`0x80000003` NDMRESET → `0x40000001`).
  - WCH "song and dance": before resume, write `0x5aa50000 | (1<<10)` to DMSHDWCFGR (0x7E) + DMCFGR (0x7D) ×3.
  - Standalone resume/reboot buttons must call linkeIdentify first to open the debug session, else LinkE returns stale buffer.
- ✅ **Backend compile spike** — `spikes/backend-compile/` proves the toolchain pipeline.
  - Native compile (xPack riscv-none-embed-gcc 8.2.0): **0.27s** (cold and warm), output 1748 bytes
  - Docker compile (debian:bookworm-slim + bundled toolchain + framework): **~1.0s** including container startup
  - Output is byte-identical (same SHA256) between native and container
  - Image size: 1.66 GB (toolchain alone is 1.1 GB — xPack 8.2.0 includes every rv32/64 multilib)
  - Verdict: easily fits the < 3s target; for serverless we'd slim to rv32ec multilib only (~125 MB plausible)
  - Compile flags mirror PlatformIO+ch32v003fun exactly; `--specs=nano.specs --specs=nosys.specs -nostdlib` keeps newlib usage minimal
- ⏳ TCC.js / C-interpreter spike — research a maintained WASM C compiler with MMIO hook surface

### Phase 1 — The real port (after spikes)
- Port remaining minichlink commands to JS as `app/sim/wch-linke.ts` (~200 LOC mechanical):
  - UnlockFlash (4 writeMmio: KEYR keys + OBKEYR keys)
  - EraseChip + WaitForFlash (poll FLASH_STATR.BSY @ 0x4002200C)
  - ProgramFlash (page-by-page loop, 64-byte sectors, halfword writes via `MCF.WriteHalfWord`)
  - ReadBack + verify
- Backend `/api/compile` service (Cloud Run or VPS): C source → .bin in container with toolchain
- UI: "Flash" button in editor header, connection state indicator, error/status console

### Phase 2 — C interpreter integration (parallel)
- Hook chosen C-runtime's MMIO read/write to existing bus.ts so peripheral models still drive the visualisation
- Keep step-by-step debugging if possible (depends on chosen runtime)

### Open spikes by impact
- WebUSB + WCH-LinkE: ✅ DE-RISKED COMPLETELY (the highest-risk piece — all primitives proven)
- Backend compile: low risk, well-understood Docker + GCC; need to spec hosting cost (~$5/mo VPS)
- TCC.js: unknown — need to research maintained WASM C compilers (TCC, picoc, clang.wasm)

## Open / next (curriculum / sim)
- Expand sim peripherals: ADC, DMA, UART, SPI, I2C, Timers
- WCH outreach via pull-marketing (Hackaday tip + Show HN + ch32v003fun PR) — NOT cold email
- Pull-target email: use `shicolare1@gmail.com` (the one published in CLAUDE.md, matches `@shakir-abdo` GitHub)

## Sim non-goals (firm)
- Cycle-accurate timing
- User-defined function calls in the current DSL (bare-metal pedagogy) — supersedes once TCC.js lands
- Virtual LEDs / external components

## Style decisions
- Lesson titles: conversational Arabic (e.g. "تعمّق في UART", not literal "UART العميق")
- Arabic comments in code preserved when editing nearby lines
- Donation framing: "اشترِ لي كوب قهوة" not "إكرامية"
