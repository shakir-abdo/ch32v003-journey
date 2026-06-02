/**
 * RCC behavioural model.
 *
 *  - HSION  → HSIRDY  (HSI is on at reset; setting/clearing tracks ON)
 *  - HSEON  → HSERDY  (instantaneous; no external crystal modelling)
 *  - PLLON  → PLLRDY  (instantaneous)
 *  - LSION  → LSIRDY  (instantaneous)
 *  - CFGR0.SW[1:0] → CFGR0.SWS[3:2] mirror, with the rule that the
 *    switch only "succeeds" if the requested source has its RDY bit
 *    set. Otherwise SWS stays at whatever it was.
 *
 * No oscillator startup time modelled — ready bits flip as soon as the
 * ON bit is set. Educationally this is fine: the lessons emphasise the
 * spin-on-RDY pattern, and here the spin just exits on the first read.
 */

import type {Bus, WriteContext, WriteHook} from '../bus'
import {RCC_BASE} from '../registers'

const RCC_CTLR    = RCC_BASE + 0x00
const RCC_CFGR0   = RCC_BASE + 0x04
const RCC_RSTSCKR = RCC_BASE + 0x24

const HSION   = 1 << 0
const HSIRDY  = 1 << 1
const HSEON   = 1 << 16
const HSERDY  = 1 << 17
const PLLON   = 1 << 24
const PLLRDY  = 1 << 25

const LSION   = 1 << 0
const LSIRDY  = 1 << 1

const SW_MASK  = 0b11
const SWS_MASK = 0b11 << 2

// Map SW value → which RDY we need to consult.
function rdyForSource(sw: number, ctlr: number): boolean {
  switch (sw & SW_MASK) {
    case 0: return !!(ctlr & HSIRDY)    // HSI
    case 1: return !!(ctlr & HSERDY)    // HSE
    case 2: return !!(ctlr & PLLRDY)    // PLL
    default: return false               // 11 reserved on CH32V003
  }
}

export const rccHook: WriteHook = {
  matches: (a) => a >= RCC_BASE && a < RCC_BASE + 0x40,

  onWrite({bus, reg}: WriteContext) {
    // RCC_CTLR — recompute HSIRDY / HSERDY / PLLRDY from ON bits.
    if (reg.address === RCC_CTLR) {
      const v = bus.read(RCC_CTLR)
      let next = v
      next = setBit(next, HSIRDY, !!(v & HSION))
      next = setBit(next, HSERDY, !!(v & HSEON))
      next = setBit(next, PLLRDY, !!(v & PLLON))
      if (next !== v) bus.writeSilent(RCC_CTLR, next)
      // Switching off the active clock invalidates SWS — recompute below.
      reconcileSWS(bus)
      return
    }

    // RCC_CFGR0 — recompute SWS from SW + current RDY bits.
    if (reg.address === RCC_CFGR0) {
      reconcileSWS(bus)
      return
    }

    // RCC_RSTSCKR — LSION ↔ LSIRDY.
    if (reg.address === RCC_RSTSCKR) {
      const v = bus.read(RCC_RSTSCKR)
      const next = setBit(v, LSIRDY, !!(v & LSION))
      if (next !== v) bus.writeSilent(RCC_RSTSCKR, next)
      return
    }
  }
}

function reconcileSWS(bus: Bus) {
  const ctlr = bus.read(RCC_CTLR)
  const cfgr = bus.read(RCC_CFGR0)
  const sw   = cfgr & SW_MASK
  const swsCurrent = (cfgr & SWS_MASK) >>> 2

  let swsNext = swsCurrent
  if (rdyForSource(sw, ctlr)) {
    swsNext = sw
  }
  if (swsNext !== swsCurrent) {
    const cleared = cfgr & ~SWS_MASK
    bus.writeSilent(RCC_CFGR0, cleared | ((swsNext & 0b11) << 2))
  }
}

function setBit(value: number, mask: number, on: boolean): number {
  return (on ? value | mask : value & ~mask) >>> 0
}

/** Convenience for the pin model — is a GPIO port's APB2 clock enabled? */
export function isGpioClockOn(busValue: number, port: 'A'|'C'|'D'): boolean {
  // APB2PCENR bits: A=2, C=4, D=5
  const bit = port === 'A' ? 2 : port === 'C' ? 4 : 5
  return ((busValue >>> bit) & 1) === 1
}
