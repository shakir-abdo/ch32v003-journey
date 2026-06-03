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
 * Called by the interpreter after each statement. Advances CNT and,
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
 *
 * Implementation: O(1) regardless of ticksPerStep. We jump straight to
 * either the match (if it falls inside this step's budget) or to the
 * end-of-budget counter value. A naive per-tick loop would do 1 M Map
 * reads/writes per step when the user drags the ticks slider to ×1M,
 * which made the playground unusable for hardware-realistic CMP values.
 */
export function tickSysTick(
  bus: Bus,
  intc: InterruptController,
  ticksPerStep: number = 1
): {writes?: import('../types').RegisterWrite[]; pinChanges?: import('../types').PinChange[]} | void {
  const ctlr = bus.read(STK_CTLR)
  if (!(ctlr & STE)) return

  bus.beginInternalTransaction()

  const cmp = bus.read(STK_CMPLR)
  const safeTicks = Math.max(1, Math.floor(ticksPerStep))

  // CMP=0 → counter never moves from 0, no match ever fires.
  if (cmp === 0) {
    return bus.endInternalTransaction()
  }

  let cnt = bus.read(STK_CNTL)
  let remaining = safeTicks

  // If we're sitting at CMP from the previous match, consume one tick
  // to wrap the counter back to 0.
  if (cnt === cmp) {
    cnt = 0
    remaining--
  }

  if (remaining > 0) {
    const ticksToMatch = cmp - cnt
    if (ticksToMatch <= remaining) {
      // Match within this step. Advance to CMP, latch CNTIF, raise the
      // IRQ if STIE is on. We stop here even if more budget remains:
      // a step shows "one fire", matching the prior break-on-pending
      // semantics so the visualisation stays clean.
      cnt = cmp
      bus.writeSilent(STK_SR, bus.read(STK_SR) | CNTIF)
      if (ctlr & STIE) {
        intc.raise('SysTick')
        // PFIC gate check: STIE+CNTIF on, but PFIC_IENR1.bit12 is 0.
        // Real hardware would silently swallow the IRQ; warn once so
        // the learner knows what's missing.
        if (!intc.isEnabled('SysTick')) {
          intc.warnPficGate('SysTick', () => {
            bus.warn('SysTick CNTIF latched + STIE on, but PFIC bit 12 is off — the IRQ never reaches the core. Add PFIC_IENR1 |= (1 << 12); to enable it (CH32V003 RM §6.5.2.11).')
          })
        }
      }
    } else {
      // No match this step — just advance toward CMP.
      cnt = (cnt + remaining) >>> 0
    }
  }

  bus.writeSilent(STK_CNTL, cnt)
  return bus.endInternalTransaction()
}

export function resetSysTickWarnings(): void {
  STREZeroWarned = false
}
