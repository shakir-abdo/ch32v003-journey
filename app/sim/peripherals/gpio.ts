/**
 * GPIO model — one logical block, applied to GPIOA/C/D.
 *
 * Two pieces:
 *  1. `gpioHook`: react to BSHR/BCR writes (set/reset bits in OUTDR
 *     atomically — the canonical CH32V003 atomic-bit-op channel).
 *  2. `gpioPinModel`: pure function from current register state →
 *     PinStatus for every J4M6 pin.
 *
 * CFGLR encoding per pin (4 bits, low→high):
 *   bits[1:0] = MODE  (00=in, 01=10MHz out, 10=2MHz out, 11=50MHz out)
 *   bits[3:2] = CNF   (depends on MODE)
 *
 * When MODE=00 (input):
 *   CNF=00 → analog
 *   CNF=01 → floating
 *   CNF=10 → input w/ pull (direction from OUTDR bit: 1=up, 0=down)
 *   CNF=11 → reserved
 *
 * When MODE≠00 (output):
 *   CNF=00 → push-pull
 *   CNF=01 → open-drain
 *   CNF=10 → AF push-pull
 *   CNF=11 → AF open-drain
 */

import type {Bus, PinModel, WriteContext, WriteHook} from '../bus'
import type {PinStatus} from '../types'
import {GPIOA_BASE, GPIOC_BASE, GPIOD_BASE, J4M6_PINS} from '../registers'
import {isGpioClockOn} from './rcc'

const PORT_BASES: Record<'A'|'C'|'D', number> = {
  A: GPIOA_BASE,
  C: GPIOC_BASE,
  D: GPIOD_BASE
}

const OFF_CFGLR = 0x00
const OFF_OUTDR = 0x0C
const OFF_BSHR  = 0x10
const OFF_BCR   = 0x14

export const gpioHook: WriteHook = {
  matches(a) {
    return (a >= GPIOA_BASE && a < GPIOA_BASE + 0x40) ||
           (a >= GPIOC_BASE && a < GPIOC_BASE + 0x40) ||
           (a >= GPIOD_BASE && a < GPIOD_BASE + 0x40)
  },

  onWrite({bus, reg}: WriteContext) {
    const base = portBaseFor(reg.address)
    if (base == null) return
    const offset = reg.address - base

    // BSHR: bits[15:0] = set, bits[31:16] = reset. Per RM §7.3.1.4:
    // "If both BR and BS bits are set, the BS bit takes effect." So we
    // do the reset first and then the set — the set masks the reset.
    if (offset === OFF_BSHR) {
      const v = bus.read(reg.address)
      const setMask   = v & 0xFFFF
      const resetMask = (v >>> 16) & 0xFFFF
      const odrAddr   = base + OFF_OUTDR
      const odr       = bus.read(odrAddr)
      let nextOdr     = (odr & ~resetMask) >>> 0
      nextOdr         = (nextOdr | setMask) >>> 0
      if (nextOdr !== odr) bus.writeSilent(odrAddr, nextOdr)
      // BSHR itself reads as 0 after the write completes (per RM — WO).
      bus.writeSilent(reg.address, 0)
      return
    }

    // BCR: bits[15:0] = reset.
    if (offset === OFF_BCR) {
      const v = bus.read(reg.address)
      const resetMask = v & 0xFFFF
      const odrAddr   = base + OFF_OUTDR
      const odr       = bus.read(odrAddr)
      const nextOdr   = (odr & ~resetMask) >>> 0
      if (nextOdr !== odr) bus.writeSilent(odrAddr, nextOdr)
      bus.writeSilent(reg.address, 0)
      return
    }
  }
}

function portBaseFor(addr: number): number | null {
  if (addr >= GPIOA_BASE && addr < GPIOA_BASE + 0x40) return GPIOA_BASE
  if (addr >= GPIOC_BASE && addr < GPIOC_BASE + 0x40) return GPIOC_BASE
  if (addr >= GPIOD_BASE && addr < GPIOD_BASE + 0x40) return GPIOD_BASE
  return null
}

export const gpioPinModel: PinModel = {
  resolvePins(bus: Bus): Map<string, PinStatus> {
    const apb2 = bus.read(0x40021018) // RCC_APB2PCENR
    const out = new Map<string, PinStatus>()
    for (const p of J4M6_PINS) {
      out.set(p.net, resolvePin(bus, apb2, p.port, p.bit))
    }
    return out
  }
}

function resolvePin(bus: Bus, apb2: number, port: 'A'|'C'|'D', bit: number): PinStatus {
  if (!isGpioClockOn(apb2, port)) return 'HI-Z'

  const base  = PORT_BASES[port]
  const cfg   = bus.read(base + OFF_CFGLR)
  const odr   = bus.read(base + OFF_OUTDR)

  const shift = bit * 4
  const mode  = (cfg >>> shift)        & 0b11
  const cnf   = (cfg >>> (shift + 2))  & 0b11
  const odBit = (odr >>> bit)          & 1

  if (mode === 0b00) {
    // Input variants
    if (cnf === 0b00) return 'ADC'        // analog
    if (cnf === 0b01) return 'INPUT'      // floating
    if (cnf === 0b10) return odBit ? 'INPUT-PU' : 'INPUT-PD'
    return 'INPUT'                         // reserved → fall back
  }

  // Output variants
  if (cnf === 0b00 || cnf === 0b01) {
    return odBit ? 'HIGH' : 'LOW'
  }
  return 'AF'
}
