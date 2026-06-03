/**
 * PFIC model (RM §6.4) — the peripheral interrupt controller.
 *
 * PFIC sits between the peripherals' "this interrupt is pending" signal
 * and the core. If a peripheral raises a pending vector but PFIC's
 * enable bit for that vector is 0, the CPU never sees the interrupt —
 * just like on real hardware.
 *
 * Three registers expose the enable bitmap to the user:
 *  - PFIC_IENR1 (WO, 0x100): writing 1 to bit N enables vector N. We
 *    sticky-OR the value into PFIC_ISR1, then clear IENR1 back to 0.
 *  - PFIC_IRER1 (WO, 0x180): same but writing 1 disables. AND-NOT into
 *    ISR1, then clear.
 *  - PFIC_ISR1  (RO, 0x000): the live enable bitmap. Resets to 0xC so
 *    NMI (#2) and HardFault (#3) are always enabled (per RM note).
 *
 * After every IENR1/IRER1 write we update the InterruptController's
 * enable mask so its pickNext() decisions reflect the new state.
 */

import type {Bus, WriteContext, WriteHook} from '../bus'
import type {InterruptController, Vector} from '../interrupts'
import {PFIC_BASE} from '../registers'

const PFIC_ISR1  = PFIC_BASE + 0x000
const PFIC_IENR1 = PFIC_BASE + 0x100
const PFIC_IRER1 = PFIC_BASE + 0x180

/** NMI (#2) + HardFault (#3) are always enabled — RM §6.5.2.1 note. */
export const ALWAYS_ENABLED_MASK = (1 << 2) | (1 << 3)

/** Vector → bit-position in PFIC's enable bitmap (= the interrupt number). */
export const VECTOR_BIT: Record<Vector, number> = {
  SysTick: 12,
  SW:      14,
  EXTI7_0: 20
}

export function makePficHook(intc: InterruptController): WriteHook {
  return {
    matches: (a) => a >= PFIC_BASE && a < PFIC_BASE + 0x400,

    onWrite({bus, reg}: WriteContext) {
      if (reg.address === PFIC_IENR1) {
        const writeMask = bus.read(PFIC_IENR1)
        const cur       = bus.read(PFIC_ISR1)
        const next      = ((cur | writeMask) | ALWAYS_ENABLED_MASK) >>> 0
        if (next !== cur) bus.writeSilent(PFIC_ISR1, next)
        // IENR1 is WO — reads return 0.
        bus.writeSilent(PFIC_IENR1, 0)
        intc.setEnableMask(next)
        return
      }
      if (reg.address === PFIC_IRER1) {
        const clearMask = bus.read(PFIC_IRER1)
        // Don't allow disabling NMI / HardFault.
        const safeClear = (clearMask & ~ALWAYS_ENABLED_MASK) >>> 0
        const cur       = bus.read(PFIC_ISR1)
        const next      = ((cur & ~safeClear) | ALWAYS_ENABLED_MASK) >>> 0
        if (next !== cur) bus.writeSilent(PFIC_ISR1, next)
        bus.writeSilent(PFIC_IRER1, 0)
        intc.setEnableMask(next)
        return
      }
      // PFIC_ISR1 writes are blocked by readOnlyMask at the bus level —
      // nothing to do.
    }
  }
}
