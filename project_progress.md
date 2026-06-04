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
- ✅ **WebUSB ↔ WCH-LinkE ↔ CH32V003 FULL FLASH FLOW** — `public/webusb-spike.html` proves the complete pipeline. Validated end-to-end on hardware (LinkE v2.14 + CH32V003J4M6): unlock + mass erase + program 28 pages + verify 1748 bytes byte-perfect, total 2.6 s. After reboot, the new firmware runs and the LED blinks at the rate dictated by the freshly-flashed code.
  - WCH-LinkE VID=0x1A86 PID=0x8010 (WCH-Link mode, NOT CMSIS-DAP)
  - Interface 0 is Vendor Specific Class (255) → WebUSB-accessible; Bulk EP1 IN/OUT, 64-byte packets
  - LinkE-level commands: identify (`81 0d 01 01`), chip detect, chip info, read-protect, close (`81 0d 01 ff`)
  - DMI register tunneling via `81 08 06 [reg7] [be4] [op]` (op=1 read, op=2 write); replies are always 9 bytes echoing the reg
  - RISC-V abstract command + PROGBUF: read mode (autoexec), write mode (one-shot per writeMmio), flash-write mode (atomic write+BUF_LOAD ack)
  - Read live MMIO works (RCC, GPIO, UNIID, RAM — all byte-perfect)
  - Write live MMIO works (RAM round-trip + GPIO toggle proven)
  - Flash unlock: write `0x45670123` + `0xCDEF89AB` to KEYR, OBKEYR, MODEKEYR (3 pairs); check CTLR & 0x8080 cleared
  - Mass erase: `CTLR = 0; CTLR = MER; CTLR = MER|STRT;` then poll FLASH_STATR.BSY — completes in ~20 ms
  - Page program (64-byte page): `CTLR = PAGE_PG; CTLR = PAGE_PG|BUF_RST;` then 16 word writes (flash-write progbuf, atomic BUF_LOAD per word) then `FLASH_ADDR = page_base; CTLR = PAGE_PG|STRT;` poll BSY

  **Critical gotchas (would each eat days during a from-scratch port):**
  - `81 0d 01 ff` is NOT a resume — it only closes the LinkE session. After PROGBUF/DMCONTROL writes, target stays at `c.ebreak` until you write `DMCONTROL = 0x40000001` (resumereq + dmactive). Use `0x80000003` (NDMRESET) → `0x40000001` for a full reboot.
  - WCH "song and dance" before resume: write `0x5aa50000 | (1<<10)` to DMSHDWCFGR (0x7E) + DMCFGR (0x7D) ×3.
  - Standalone resume/reboot need linkeIdentify first to open the LinkE debug session — otherwise LinkE returns stale buffer (we saw `82 0d 01 ff` echo instead of a DMI response).
  - **Flash writes MUST use the 0x08000000 alias.** Writing to flash mapped at 0x00000000 is silently dropped — the chip treats 0x00000000 as ROM for the CPU but only the 0x08000000 alias is intercepted by the flash controller. minichlink remaps with `addr |= 0x08000000` at the top of DefaultWriteBinaryBlob.
  - **Each flash data write MUST be followed by `FLASH_CTLR = PAGE_PG|BUF_LOAD` *in the same chip-side abstract command*.** Doing it as a separate writeMmio call drops the latched word — the flash controller times out. Solution: dedicated flash-mode PROGBUF with `c.sw x13, 0(x12); c.ebreak` as PROGBUF2 where x12 = FLASH_CTLR (0x40022010) and x13 = PAGE_PG|BUF_LOAD (0x50000), set via `0x0023100c`/`0x0023100d` register-load commands.
  - Switch progbufs between phases: regular write for CTLR sets, flash-write for the 16 word loads, regular write for FLASH_ADDR + STRT (the trigger writes must NOT have a BUF_LOAD ack appended), read for the BSY poll.
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
