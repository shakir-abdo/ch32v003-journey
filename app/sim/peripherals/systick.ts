/**
 * SysTick model (RM §6.5).
 *
 * Behaviour:
 *  - When STE (CTLR bit 0) is set, the interpreter calls `tick()` once
 *    per statement to advance CNT.
 *  - When CNT (after increment) reaches CMP, CNTIF (SR bit 0) is set and
 *    — if STIE is also set — a SysTick interrupt is raised on vector #12.
 *  - In auto-reload mode (STRE=1), CNT wraps to 0 the tick after the
 *    match. STRE=0 (up-down counting) is not modelled in v1; we warn
 *    and treat it as auto-reload.
 *  - SWIE (CTLR bit 31) triggers the SW interrupt on vector #14 (NOT
 *    SysTick — see RM §6.3 vector table). The bit stays set until the
 *    handler clears it.
 *  - STK_SR.CNTIF is RW0: write 0 clears, write 1 has no effect.
 *
 * What we do NOT model: STCLK (clock source select) — we have no clock
 * divider; STCLK is ignored.
 */

import type {Bus, WriteContext, WriteHook} from '../bus'
import type {InterruptController} from '../interrupts'
import {SYSTICK_BASE} from '../registers'

const STK_CTLR = SYSTICK_BASE + 0x00
const STK_SR   = SYSTICK_BASE + 0x04
const STK_CNTL = SYSTICK_BASE + 0x08
const STK_CMPLR= SYSTICK_BASE + 0x10

const STE   = 1 << 0
const STIE  = 1 << 1
// const STCLK = 1 << 2   // intentionally unused
const STRE  = 1 << 3
const SWIE  = 1 << 31
const CNTIF = 1 << 0

let STREZeroWarned = false

export function makeSysTickHook(intc: InterruptController): WriteHook {
  return {
    matches: (a) => a >= SYSTICK_BASE && a < SYSTICK_BASE + 0x40,

    onWrite({bus, reg, oldValue}: WriteContext) {
      if (reg.address === STK_CTLR) {
        const v = bus.read(STK_CTLR)
        // SWIE rising edge → raise SW (vector #14). SW pending stays in
        // the controller until either SWIE is cleared OR the handler
        // calls intc.clear via clearing SWIE — same thing.
        const swiNow    = (v & SWIE) !== 0
        const swiBefore = (oldValue & SWIE) !== 0
        if (swiNow && !swiBefore) intc.raise('SW')
        else if (!swiNow && swiBefore) intc.clear('SW')

        if ((v & STE) && !(v & STRE) && !STREZeroWarned) {
          STREZeroWarned = true
          bus.warn('STK_CTLR.STRE=0 (up-down counting) not modelled in v1 — sim treats it as auto-reload.')
        }
        return
      }
      if (reg.address === STK_SR) {
        const v = bus.read(STK_SR)
        const newCntif = (v & CNTIF) !== 0
        const oldCntif = (oldValue & CNTIF) !== 0
        // RM: "write 1 to invalidate" — writing 1 to CNTIF must NOT
        // set it. So if the user wrote 1 onto a previously-0 bit,
        // revert.
        if (newCntif && !oldCntif) {
          bus.writeSilent(STK_SR, v & ~CNTIF)
        } else if (!newCntif && oldCntif) {
          // User cleared CNTIF — retract the pending SysTick.
          intc.clear('SysTick')
        }
        return
      }
      // STK_CNTL / STK_CMPLR — pure storage, no immediate side effect.
    }
  }
}

/**
 * Called by the interpreter after each statement. Increments CNT and,
 * on a 0→CMP transition, latches CNTIF + raises the SysTick interrupt.
 *
 * Counting order (CMP=5 example):
 *   tick 1: CNT 0 → 1
 *   ...
 *   tick 5: CNT 4 → 5, CNTIF latched, IRQ raised
 *   tick 6: CNT 5 → 0 (auto-reload), no fire
 *   tick 7: CNT 0 → 1, …
 * So period = CMP + 1 ticks. Set CMP=0 to effectively disable (CNT
 * never moves away from 0, no match transition is detected).
 */
export function tickSysTick(bus: Bus, intc: InterruptController): {writes?: import('../types').RegisterWrite[]; pinChanges?: import('../types').PinChange[]} | void {
  const ctlr = bus.read(STK_CTLR)
  if (!(ctlr & STE)) return

  // Open an internal transaction so the STK_CNTL increment + optional
  // STK_SR.CNTIF latch are collected into a diff the UI can flash.
  bus.beginInternalTransaction()

  const cnt = bus.read(STK_CNTL)
  const cmp = bus.read(STK_CMPLR)

  let nextCnt: number
  if (cnt === cmp) {
    // We sat at the compare value last tick — wrap on this one.
    nextCnt = 0
  } else {
    nextCnt = (cnt + 1) >>> 0
    if (nextCnt === cmp) {
      // 0→CMP transition. Latch CNTIF and raise if interrupts enabled.
      bus.writeSilent(STK_SR, bus.read(STK_SR) | CNTIF)
      if (ctlr & STIE) intc.raise('SysTick')
    }
  }
  bus.writeSilent(STK_CNTL, nextCnt)
  return bus.endInternalTransaction()
}

export function resetSysTickWarnings(): void {
  STREZeroWarned = false
}
