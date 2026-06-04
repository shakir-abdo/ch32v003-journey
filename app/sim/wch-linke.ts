/**
 * WCH-LinkE driver — WebUSB → RISC-V debug → CH32V003 flash.
 *
 * Ported verbatim from `public/webusb-spike.html` (validated end-to-end:
 * unlock + mass-erase + 28-page program + verify in ~2.6 s on hardware).
 * Every gotcha noted in the spike comments is preserved here because
 * each one cost real debugging time during the original port from
 * minichlink — they are the load-bearing invariants of this protocol.
 *
 * Layout:
 *   1. Minimal WebUSB type surface (lib.dom.d.ts doesn't ship it).
 *   2. Wire-level constants (LinkE commands, DMI regs, flash regs).
 *   3. USB plumbing: requestDevice / release / cmd.
 *   4. DMI tunnel primitives: dmiRead / dmiWrite / waitDone.
 *   5. LinkE session: linkeIdentify / closeLinke / properResume / reboot.
 *   6. Program-buffer setup: read / write / flash-write progbufs.
 *   7. MMIO primitives: readMmio / writeMmio.
 *   8. Flash primitives: unlock / massErase / programPage / readBack.
 *   9. High-level orchestrator: flash(device, bin, onProgress?).
 */

// ─── WebUSB types ─────────────────────────────────────────────────────
// Subset of the WebUSB spec covering only what we touch. Keeps us off
// the @types/w3c-web-usb dependency.
export interface UsbInTransferResult {
  data?: DataView
  status: 'ok' | 'stall' | 'babble'
}
export interface UsbOutTransferResult {
  bytesWritten: number
  status: 'ok' | 'stall'
}
export interface UsbDevice {
  readonly opened: boolean
  readonly configuration: unknown | null
  readonly manufacturerName?: string
  readonly productName?: string
  readonly vendorId: number
  readonly productId: number
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  releaseInterface(interfaceNumber: number): Promise<void>
  transferIn(endpointNumber: number, length: number): Promise<UsbInTransferResult>
  transferOut(endpointNumber: number, data: BufferSource): Promise<UsbOutTransferResult>
}
interface UsbDeviceFilter {vendorId?: number; productId?: number}
interface UsbRequestDeviceOptions {filters: UsbDeviceFilter[]}
interface NavigatorUsb {
  requestDevice(options: UsbRequestDeviceOptions): Promise<UsbDevice>
  getDevices(): Promise<UsbDevice[]>
}
declare global {
  interface Navigator {usb?: NavigatorUsb}
}

// ─── Wire constants ───────────────────────────────────────────────────

/** WCH USB vendor ID. WCH-LinkE runs at VID=0x1A86, PID=0x8010 in WCH-Link
 * mode (NOT CMSIS-DAP — that's a different PID). */
export const WCH_VENDOR_ID = 0x1A86

// Debug-module registers (RISC-V debug spec + WCH extensions).
const DMDATA0       = 0x04
const DMDATA1       = 0x05
const DMCONTROL     = 0x10
const DMSTATUS      = 0x11
const DMHARTINFO    = 0x12
const DMABSTRACTCS  = 0x16
const DMCOMMAND     = 0x17
const DMABSTRACTAUTO = 0x18
const DMPROGBUF0    = 0x20
const DMPROGBUF1    = 0x21
const DMPROGBUF2    = 0x22
const DMCFGR        = 0x7D
const DMSHDWCFGR    = 0x7E

// CH32V003 flash controller (RM_CH32V003 §22).
const FLASH_KEYR     = 0x40022004
const FLASH_OBKEYR   = 0x40022008
const FLASH_STATR    = 0x4002200C
const FLASH_CTLR     = 0x40022010
const FLASH_ADDR     = 0x40022014
const FLASH_MODEKEYR = 0x40022024

const KEY1 = 0x45670123
const KEY2 = 0xCDEF89AB

const CR_MER      = 0x04
const CR_STRT     = 0x40
const CR_PAGE_PG  = 0x10000
const CR_BUF_LOAD = 0x40000
const CR_BUF_RST  = 0x80000

const STATR_BSY       = 0x01
const STATR_PGERR     = 0x04
const STATR_WRPRTERR  = 0x10

/** Flash region alias the controller listens on. The CPU sees flash at
 * 0x00000000 too, but only writes to the 0x08000000 alias hit the flash
 * programming logic — writes via 0x00000000 are silently dropped. */
const FLASH_ALIAS = 0x08000000

/** CH32V003 fixed page size (RM §22.4.1). */
export const FLASH_PAGE_SIZE = 64

// ─── USB plumbing ─────────────────────────────────────────────────────

/** Open the LinkE.
 *
 * Tries to reuse a previously-authorized device first (via `getDevices()`),
 * which returns devices the page already has permission for WITHOUT
 * popping the picker. Only falls back to `requestDevice()` (picker prompt,
 * needs a user gesture) when there's no prior authorization.
 *
 * `getDevices()` returns all authorized devices regardless of plug state.
 * A disconnected stale entry would `.open()`-fail; we filter by vendorId
 * + try-open and fall through to the picker on any failure. */
export async function requestDevice(): Promise<UsbDevice> {
  if (!navigator.usb) {
    throw new Error('WebUSB not available — use Chrome / Edge / Brave')
  }

  // Fast path: reuse an already-authorized WCH device if it's reachable.
  const authorized = await navigator.usb.getDevices()
  const candidates = authorized.filter((d) => d.vendorId === WCH_VENDOR_ID)
  for (const candidate of candidates) {
    try {
      await candidate.open()
      if (candidate.configuration === null) await candidate.selectConfiguration(1)
      await candidate.claimInterface(0)
      return candidate
    } catch {
      // Stale (unplugged) or already claimed elsewhere — keep looking.
      try {await candidate.close()} catch {/* */}
    }
  }

  // Slow path: ask the user. Must be inside a user gesture.
  const device = await navigator.usb.requestDevice({
    filters: [{vendorId: WCH_VENDOR_ID}],
  })
  await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)
  await device.claimInterface(0)
  return device
}

export async function release(device: UsbDevice | null): Promise<void> {
  if (!device?.opened) return
  try {await device.releaseInterface(0)} catch {/* device may already be gone */}
  try {await device.close()} catch {/* same */}
}

/** Send a command on bulk endpoint 1 and (optionally) read the reply.
 * LinkE uses 64-byte bulk packets in both directions. */
async function cmd(
  device: UsbDevice,
  bytes: number[],
  replyMax = 64,
  readReply = true,
): Promise<Uint8Array | null> {
  const out = await device.transferOut(1, new Uint8Array(bytes))
  if (out.status !== 'ok') throw new Error(`OUT failed: ${out.status}`)
  if (!readReply) return null
  const inR = await device.transferIn(1, replyMax)
  if (inR.status !== 'ok') throw new Error(`IN failed: ${inR.status}`)
  if (!inR.data) throw new Error('IN returned no data')
  return new Uint8Array(inR.data.buffer)
}

const hex = (b: Uint8Array): string =>
  Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(' ')

const h32 = (n: number): string =>
  '0x' + (n >>> 0).toString(16).padStart(8, '0')

// ─── DMI tunnel ───────────────────────────────────────────────────────
// `81 08 06 <reg7> <be4 value> <op>` — op=1 read, op=2 write. Replies
// are always 9 bytes echoing the reg in byte 3.

async function dmiWrite(device: UsbDevice, reg7: number, value32: number): Promise<void> {
  const v = value32 >>> 0
  const req = [
    0x81, 0x08, 0x06, reg7 & 0x7f,
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>>  8) & 0xff,
    v & 0xff,
    0x02,
  ]
  const r = await cmd(device, req, 64)
  if (!r || r.length < 9 || r[3] !== reg7) {
    throw new Error(`dmiWrite reg=${reg7}: bad reply ${r ? hex(r) : '(null)'}`)
  }
}

async function dmiRead(device: UsbDevice, reg7: number): Promise<number> {
  const req = [0x81, 0x08, 0x06, reg7 & 0x7f, 0, 0, 0, 0, 0x01]
  const r = await cmd(device, req, 64)
  if (!r || r.length < 8 || r[3] !== reg7) {
    throw new Error(`dmiRead reg=${reg7}: bad reply ${r ? hex(r) : '(null)'}`)
  }
  return ((r[4]! << 24) | (r[5]! << 16) | (r[6]! << 8) | r[7]!) >>> 0
}

/** Poll DMABSTRACTCS until busy clears; throw on cmderr or timeout. */
async function waitDone(device: UsbDevice, timeoutMs = 200): Promise<void> {
  const t0 = performance.now()
  while (true) {
    const v = await dmiRead(device, DMABSTRACTCS)
    const busy   = (v >> 12) & 1
    const cmderr = (v >>  8) & 7
    if (!busy) {
      if (cmderr) {
        throw new Error(`abstract cmderr=${cmderr} (clear with abstractcs.cmderr=7)`)
      }
      return
    }
    if (performance.now() - t0 > timeoutMs) throw new Error('waitDone timeout')
    await new Promise((r) => setTimeout(r, 1))
  }
}

/** Poll DMSTATUS until the requested bit-mask is set; throw on timeout. */
async function pollDmStatus(
  device: UsbDevice,
  mask: number,
  name: string,
  timeoutMs = 200,
): Promise<void> {
  const t0 = performance.now()
  while (true) {
    const s = await dmiRead(device, DMSTATUS)
    if (s & mask) return
    if (performance.now() - t0 > timeoutMs) {
      throw new Error(`${name} timeout (DMSTATUS=${h32(s)})`)
    }
    await new Promise((r) => setTimeout(r, 1))
  }
}

// ─── LinkE session ────────────────────────────────────────────────────

/** Open a LinkE debug session. Halts the target. Must run before any
 * DMI/PROGBUF traffic — otherwise LinkE returns stale buffers (e.g.
 * `82 0d 01 ff` echo instead of a DMI reply). */
export async function linkeIdentify(device: UsbDevice): Promise<void> {
  let r = await cmd(device, [0x81, 0x0D, 0x01, 0x01])
  if (!r || r[0] !== 0x82 || r[1] !== 0x0D) {
    throw new Error(`identify programmer: ${r ? hex(r) : '(null)'}`)
  }
  r = await cmd(device, [0x81, 0x0D, 0x01, 0x02])
  if (r && r[0] === 0x81 && r[1] === 0x55) {
    throw new Error('nothing connected to LinkE')
  }
}

/** LinkE-level close. This is NOT a target resume — it only ends the
 * LinkE session. After PROGBUF/DMCONTROL writes, the target stays at
 * `c.ebreak` until DMCONTROL.resumereq is sent (see properResume). */
async function closeLinke(device: UsbDevice): Promise<void> {
  await cmd(device, [0x81, 0x0D, 0x01, 0xFF], 0, false)
}

/** RISC-V resume sequence — matches minichlink's HALT_MODE_RESUME.
 *
 * Sequence: halt + poll allhalted → DMCFGR "song and dance" (silicon
 * bug workaround per minichlink comment "if coming out of cold boot,
 * and we don't do our little song and dance this has to be called") →
 * resumereq + poll allresumeack → close LinkE.
 *
 * ⚠ KNOWN LIMITATION: `linkeIdentify` itself reads chip ID via PROGBUF
 * (UNIID @ 0x1FFFF7E8), which clobbers x8–x13. Any subsequent PROGBUF
 * setup (read/write/flash) clobbers them further. resumereq is acked
 * by the debug module, BUT the user firmware continues with corrupted
 * registers → typically traps or infinite-loops, so the LED stays
 * frozen. To reliably restart firmware after any debug session on
 * CH32V003, use `reboot()` (NDMRESET) instead — minichlink follows the
 * same convention (its `DefaultReadAllCPURegisters` exists but is not
 * called in the main flow; the canonical "restart" is HALT_AND_RESET).
 *
 * Future: real interactive resume would save x8–x13 right after halt
 * and restore them before resumereq. Out of scope for the flash test
 * harness. */
export async function properResume(device: UsbDevice): Promise<void> {
  await dmiWrite(device, DMCONTROL, 0x80000001) // halt + dmactive (idempotent)
  await pollDmStatus(device, 1 << 9,  'resume.halt')

  // WCH "song and dance" — magic key 0x5aa50000 | (1<<10) = "Allow output
  // from slave". minichlink: 1× DMSHDWCFGR + 2× DMCFGR (the spike had 3×
  // DMCFGR — extra write is benign but unnecessary).
  const KEY = (0x5aa50000 | (1 << 10)) >>> 0
  await dmiWrite(device, DMSHDWCFGR, KEY)
  await dmiWrite(device, DMCFGR,     KEY)
  await dmiWrite(device, DMCFGR,     KEY)

  await dmiWrite(device, DMCONTROL, 0x40000001) // resumereq + dmactive
  await pollDmStatus(device, 1 << 17, 'resume.ack')
  await closeLinke(device)
}

/** Full reboot via NDMRESET — re-runs firmware from the reset vector.
 * Safer than resume after we've clobbered x8..x13 + PROGBUF. */
export async function reboot(device: UsbDevice): Promise<void> {
  await dmiWrite(device, DMCONTROL, 0x80000001) // halt + dmactive
  await dmiWrite(device, DMCONTROL, 0x80000001) // again, per minichlink
  await dmiWrite(device, DMCONTROL, 0x80000003) // ndmreset + halt + dmactive
  await dmiWrite(device, DMCONTROL, 0x40000001) // resumereq + dmactive
  await closeLinke(device)
}

// ─── Program-buffer setups ────────────────────────────────────────────
// Three PROGBUF programs the target runs under abstract-command control:
//   READ        — loads `*x11` into x9, stores to `*x10` (DATA0)
//   WRITE       — loads x8, stores to `*x9`, auto-increments x9
//   FLASH-WRITE — same as WRITE but PROGBUF2 also stores
//                 `*FLASH_CTLR = PAGE_PG|BUF_LOAD` in the same abstract
//                 command. The BUF_LOAD ack MUST be atomic with the data
//                 write; doing it via a separate writeMmio drops the
//                 latched word and the flash controller times out.

async function loadHartScratchAddrs(device: UsbDevice): Promise<number> {
  const hartinfo = await dmiRead(device, DMHARTINFO)
  const data0addr = (0xe0000000 | (hartinfo & 0x7ff)) >>> 0
  await dmiWrite(device, DMDATA0, data0addr)
  await dmiWrite(device, DMCOMMAND, 0x0023100a) // x10 = data0addr
  await dmiWrite(device, DMDATA0, (data0addr + 4) >>> 0)
  await dmiWrite(device, DMCOMMAND, 0x0023100b) // x11 = data0addr + 4
  return data0addr
}

export async function setupReadProgBuf(device: UsbDevice): Promise<void> {
  await dmiWrite(device, DMABSTRACTAUTO, 0)
  await dmiWrite(device, DMPROGBUF0, 0x40044180) // c.lw x8,0(x11) ; c.lw x9,0(x8)
  await dmiWrite(device, DMPROGBUF1, 0xc1040001) // c.nop          ; c.sw x9,0(x10)
  await dmiWrite(device, DMPROGBUF2, 0x9002c180) // c.sw x8,0(x11) ; c.ebreak
  await loadHartScratchAddrs(device)
  await waitDone(device)
  await dmiWrite(device, DMABSTRACTAUTO, 1)
}

export async function setupWriteProgBuf(device: UsbDevice): Promise<void> {
  await dmiWrite(device, DMABSTRACTAUTO, 0)
  await dmiWrite(device, DMPROGBUF0, 0xc0804184) // c.lw x9,0(x11) ; c.sw x8,0(x9)
  await dmiWrite(device, DMPROGBUF1, 0xc1840491) // c.addi x9, 4   ; c.sw x9,0(x11)
  await dmiWrite(device, DMPROGBUF2, 0x00019002) // c.ebreak       ; (filler nop)
  await loadHartScratchAddrs(device)
  await waitDone(device)
}

export async function setupFlashWriteProgBuf(device: UsbDevice): Promise<void> {
  await dmiWrite(device, DMABSTRACTAUTO, 0)
  await dmiWrite(device, DMPROGBUF0, 0xc0804184) // c.lw x9,0(x11) ; c.sw x8,0(x9)
  await dmiWrite(device, DMPROGBUF1, 0xc1840491) // c.addi x9, 4   ; c.sw x9,0(x11)
  await dmiWrite(device, DMPROGBUF2, 0x9002c214) // c.sw x13,0(x12); c.ebreak

  await loadHartScratchAddrs(device)

  // x12 = FLASH_CTLR address, x13 = PAGE_PG|BUF_LOAD (the ack pattern).
  await dmiWrite(device, DMDATA0, FLASH_CTLR)
  await dmiWrite(device, DMCOMMAND, 0x0023100c)
  await dmiWrite(device, DMDATA0, (CR_PAGE_PG | CR_BUF_LOAD) >>> 0)
  await dmiWrite(device, DMCOMMAND, 0x0023100d)
  await waitDone(device)
}

// ─── MMIO primitives ──────────────────────────────────────────────────

/** Read a 32-bit word from target MMIO. Caller must have setupReadProgBuf'd. */
export async function readMmio(device: UsbDevice, address: number): Promise<number> {
  await dmiWrite(device, DMDATA1, address >>> 0)
  await dmiWrite(device, DMCOMMAND, 0x00241000) // execute progbuf, postexec
  await waitDone(device)
  return await dmiRead(device, DMDATA0)
}

/** Write a 32-bit word to target MMIO. Caller must have setupWriteProgBuf'd
 * (or setupFlashWriteProgBuf'd for flash data loads — the latter appends
 * the BUF_LOAD ack atomically). */
export async function writeMmio(device: UsbDevice, address: number, value: number): Promise<void> {
  await dmiWrite(device, DMDATA1, address >>> 0)
  await dmiWrite(device, DMDATA0, value >>> 0)
  await dmiWrite(device, DMCOMMAND, 0x00271008) // write DATA0 → x8, postexec
  await waitDone(device)
}

// ─── Flash primitives ─────────────────────────────────────────────────

async function waitForFlash(device: UsbDevice, timeoutMs = 5000): Promise<void> {
  const t0 = performance.now()
  while (true) {
    const statr = await readMmio(device, FLASH_STATR)
    if (!(statr & STATR_BSY)) {
      if (statr & (STATR_PGERR | STATR_WRPRTERR)) {
        throw new Error(`flash error: STATR=${h32(statr)}`)
      }
      return
    }
    if (performance.now() - t0 > timeoutMs) throw new Error('flash BSY timeout')
    await new Promise((r) => setTimeout(r, 1))
  }
}

/** Unlock the flash controller. KEYR + OBKEYR + MODEKEYR each need
 * KEY1, KEY2 in that order. Verifies LOCK (0x80) + BOOT_LOCK (0x8000)
 * are cleared. Leaves the chip in READ progbuf mode. */
export async function flashUnlock(device: UsbDevice): Promise<void> {
  await setupWriteProgBuf(device)
  await writeMmio(device, FLASH_KEYR,     KEY1)
  await writeMmio(device, FLASH_KEYR,     KEY2)
  await writeMmio(device, FLASH_OBKEYR,   KEY1)
  await writeMmio(device, FLASH_OBKEYR,   KEY2)
  await writeMmio(device, FLASH_MODEKEYR, KEY1)
  await writeMmio(device, FLASH_MODEKEYR, KEY2)
  await setupReadProgBuf(device)
  const ctlr = await readMmio(device, FLASH_CTLR)
  if (ctlr & 0x8080) throw new Error(`flash unlock failed: CTLR=${h32(ctlr)}`)
}

/** Mass-erase the entire 16 KB flash. Assumes flashUnlock'd.
 * Leaves the chip in READ progbuf mode. */
export async function flashMassErase(device: UsbDevice): Promise<void> {
  await setupWriteProgBuf(device)
  await writeMmio(device, FLASH_CTLR, 0)
  await writeMmio(device, FLASH_CTLR, CR_MER)
  await writeMmio(device, FLASH_CTLR, (CR_MER | CR_STRT) >>> 0)
  await setupReadProgBuf(device)
  await waitForFlash(device, 10000)
}

/** Program one 64-byte page. `pageBytes` MUST be exactly 64 bytes
 * (pad short tails with 0xFF before calling).
 *
 * CH32V003 fast-page sequence:
 *   1. CTLR = PAGE_PG, CTLR = PAGE_PG|BUF_RST   (regular write progbuf)
 *   2. 16 × writeMmio at FLASH_ALIAS|page+j*4   (flash-write progbuf —
 *      atomic data + BUF_LOAD ack)
 *   3. FLASH_ADDR = page, CTLR = PAGE_PG|STRT   (regular write progbuf —
 *      these triggers MUST NOT get a BUF_LOAD ack appended)
 *   4. Poll BSY                                 (read progbuf) */
export async function flashProgramPage(
  device: UsbDevice,
  pageAddr: number,
  pageBytes: Uint8Array,
): Promise<void> {
  if (pageBytes.length !== FLASH_PAGE_SIZE) {
    throw new Error(`flashProgramPage: pageBytes must be ${FLASH_PAGE_SIZE} bytes (got ${pageBytes.length})`)
  }
  const flashAddr = (pageAddr | FLASH_ALIAS) >>> 0

  // Phase 1: enter PAGE_PG mode, reset the page buffer.
  await setupWriteProgBuf(device)
  await writeMmio(device, FLASH_CTLR, CR_PAGE_PG)
  await writeMmio(device, FLASH_CTLR, (CR_PAGE_PG | CR_BUF_RST) >>> 0)

  // Phase 2: data loads with atomic BUF_LOAD ack.
  await setupFlashWriteProgBuf(device)
  for (let j = 0; j < 16; j++) {
    const word = (
      (pageBytes[j * 4]!      ) |
      (pageBytes[j * 4 + 1]! << 8) |
      (pageBytes[j * 4 + 2]! << 16) |
      (pageBytes[j * 4 + 3]! << 24)
    ) >>> 0
    await writeMmio(device, flashAddr + j * 4, word)
  }

  // Phase 3: trigger the page commit.
  await setupWriteProgBuf(device)
  await writeMmio(device, FLASH_ADDR, flashAddr)
  await writeMmio(device, FLASH_CTLR, (CR_PAGE_PG | CR_STRT) >>> 0)

  // Phase 4: wait for the controller.
  await setupReadProgBuf(device)
  await waitForFlash(device, 1000)
}

/** Read `len` bytes from target memory starting at `addr`. Returns
 * exactly `len` bytes (4-byte aligned internally; trailing bytes sliced).
 * Caller must have setupReadProgBuf'd. */
export async function flashReadBack(
  device: UsbDevice,
  addr: number,
  len: number,
): Promise<Uint8Array> {
  const aligned = (len + 3) & ~3
  const out = new Uint8Array(aligned)
  for (let i = 0; i < aligned; i += 4) {
    const v = await readMmio(device, addr + i)
    out[i    ] =  v         & 0xff
    out[i + 1] = (v >>>  8) & 0xff
    out[i + 2] = (v >>> 16) & 0xff
    out[i + 3] = (v >>> 24) & 0xff
  }
  return out.slice(0, len)
}

// ─── High-level orchestrator ──────────────────────────────────────────

export type FlashEvent =
  | {phase: 'connect'; manufacturer?: string; product?: string}
  | {phase: 'identify'}
  | {phase: 'unlock'}
  | {phase: 'erase-start'; pageCount: number}
  | {phase: 'erase-done'; ms: number}
  | {phase: 'program-start'; pageCount: number}
  | {phase: 'program-page'; page: number; pageCount: number}
  | {phase: 'program-done'; ms: number}
  | {phase: 'verify-start'}
  | {phase: 'verify-done'; ms: number}
  | {phase: 'reboot'}

export interface FlashResult {
  totalMs: number
  eraseMs: number
  programMs: number
  verifyMs: number
  bytes: number
  pageCount: number
}

export class FlashVerifyError extends Error {
  constructor(
    public readonly firstBadOffset: number,
    public readonly mismatchCount: number,
    public readonly expected: Uint8Array,
    public readonly got: Uint8Array,
  ) {
    super(`flash verify: ${mismatchCount} bytes differ; first at ${h32(firstBadOffset)}`)
    this.name = 'FlashVerifyError'
  }
}

/** Full compile-output-to-running-firmware flow:
 *   identify → unlock → mass-erase → program → verify → reboot.
 *
 * The caller is responsible for opening the device (`requestDevice`)
 * and releasing it (`release`) — passing it in lets the same connection
 * be reused for other operations (resume, read MMIO, ...).
 *
 * Throws on any failure; emits `FlashVerifyError` specifically if the
 * read-back doesn't match the written .bin. */
export async function flash(
  device: UsbDevice,
  bin: Uint8Array,
  onEvent?: (e: FlashEvent) => void,
): Promise<FlashResult> {
  const emit = (e: FlashEvent): void => {onEvent?.(e)}
  const t0 = performance.now()

  emit({phase: 'connect', manufacturer: device.manufacturerName, product: device.productName})

  emit({phase: 'identify'})
  await linkeIdentify(device)

  emit({phase: 'unlock'})
  await flashUnlock(device)

  const pageCount = Math.ceil(bin.length / FLASH_PAGE_SIZE)
  emit({phase: 'erase-start', pageCount})
  const tErase = performance.now()
  await flashMassErase(device)
  const eraseMs = Math.round(performance.now() - tErase)
  emit({phase: 'erase-done', ms: eraseMs})

  // Pad to page boundary with 0xFF (erased flash value).
  const padded = new Uint8Array(pageCount * FLASH_PAGE_SIZE).fill(0xFF)
  padded.set(bin)

  emit({phase: 'program-start', pageCount})
  const tProg = performance.now()
  for (let p = 0; p < pageCount; p++) {
    const pageBytes = padded.slice(p * FLASH_PAGE_SIZE, (p + 1) * FLASH_PAGE_SIZE)
    await flashProgramPage(device, p * FLASH_PAGE_SIZE, pageBytes)
    emit({phase: 'program-page', page: p + 1, pageCount})
  }
  const programMs = Math.round(performance.now() - tProg)
  emit({phase: 'program-done', ms: programMs})

  emit({phase: 'verify-start'})
  const tVer = performance.now()
  const readBack = await flashReadBack(device, 0, bin.length)
  let mismatchCount = 0
  let firstBadOffset = -1
  for (let i = 0; i < bin.length; i++) {
    if (readBack[i] !== bin[i]) {
      if (firstBadOffset < 0) firstBadOffset = i
      mismatchCount++
    }
  }
  const verifyMs = Math.round(performance.now() - tVer)
  if (mismatchCount !== 0) {
    throw new FlashVerifyError(firstBadOffset, mismatchCount, bin, readBack)
  }
  emit({phase: 'verify-done', ms: verifyMs})

  emit({phase: 'reboot'})
  await reboot(device)

  return {
    totalMs: Math.round(performance.now() - t0),
    eraseMs,
    programMs,
    verifyMs,
    bytes: bin.length,
    pageCount,
  }
}
