/**
 * Interrupt dispatcher.
 *
 * Maintains a pending-queue of interrupt vectors and the registered ISR
 * function names. The interpreter calls `popPending()` after every
 * statement; if a vector is pending AND no ISR is currently running, the
 * dispatcher pushes the corresponding ISR onto the interpreter's cursor
 * stack.
 *
 * v1 scope:
 *  - At most one ISR in flight at any moment (no nesting). This matches
 *    the simplest mental model and avoids re-entrancy bugs.
 *  - A pending interrupt that is never cleared by its handler will keep
 *    re-firing — accurate to real hardware. We warn the first time this
 *    happens per vector so the learner sees the symptom.
 */

/** Symbolic names mirror the CH32V003 vector table (RM §6.3). */
export type Vector = 'SysTick' | 'EXTI7_0' | 'SW'

export interface IsrRegistration {
  vector: Vector
  /** Canonical C handler name expected from the user's code. */
  handlerName: string
}

/** Maps user-visible handler names to canonical vectors. */
export const HANDLER_NAMES: Record<string, Vector> = {
  SysTick_Handler:    'SysTick',
  EXTI7_0_IRQHandler: 'EXTI7_0',
  SW_Handler:         'SW'
}

/** Bit position of each vector in PFIC's enable bitmap (= the interrupt number). */
const VECTOR_BIT: Record<Vector, number> = {SysTick: 12, SW: 14, EXTI7_0: 20}
/** NMI + HardFault are always-on in PFIC, reflected in the controller default. */
const ALWAYS_ENABLED_MASK = (1 << 2) | (1 << 3)

export class InterruptController {
  /** Vectors currently pending (set by peripherals). */
  private pending = new Set<Vector>()
  /** Vector currently being serviced (null = main is running). */
  private servicing: Vector | null = null
  /** Per-vector "we already warned about it never being cleared" flag. */
  private warned = new Set<Vector>()
  /** Live mirror of PFIC_ISR1 — which vectors PFIC is letting through. */
  private enableMask = ALWAYS_ENABLED_MASK
  /** Per-vector "STIE on but PFIC disabled" warning de-dup. */
  private pficWarned = new Set<Vector>()

  reset(): void {
    this.pending.clear()
    this.servicing = null
    this.warned.clear()
    this.enableMask = ALWAYS_ENABLED_MASK
    this.pficWarned.clear()
  }

  /** Called by the PFIC peripheral whenever IENR1/IRER1 changes the bitmap. */
  setEnableMask(mask: number): void {
    this.enableMask = mask >>> 0
  }

  /** True if PFIC is currently letting vector V reach the core. */
  isEnabled(v: Vector): boolean {
    return ((this.enableMask >>> VECTOR_BIT[v]) & 1) === 1
  }

  /** Useful for peripheral self-warnings (STIE on but PFIC bit cleared). */
  warnPficGate(v: Vector, onWarn: (v: Vector) => void): void {
    if (this.pficWarned.has(v)) return
    this.pficWarned.add(v)
    onWarn(v)
  }

  /** Peripheral signals an interrupt is pending. */
  raise(v: Vector): void {
    this.pending.add(v)
  }

  /** Peripheral retracts an interrupt (e.g. user cleared the status flag). */
  clear(v: Vector): void {
    this.pending.delete(v)
  }

  isServicing(): Vector | null { return this.servicing }
  isPending(v: Vector): boolean { return this.pending.has(v) }

  /**
   * Return the next interrupt to service, or null if main should run.
   * Once returned, the vector is marked "servicing" — call `finish()`
   * when the ISR's body completes.
   */
  pickNext(): Vector | null {
    if (this.servicing) return null
    // CH32V003 uses programmable priorities; for the sim we just take
    // the first pending vector in vector-table order so the behaviour
    // is deterministic. PFIC gating: a pending vector that isn't enabled
    // in PFIC_ISR1 stays pending but the CPU never sees it — just like
    // on real hardware.
    for (const v of ['SysTick', 'EXTI7_0', 'SW'] as Vector[]) {
      if (this.pending.has(v) && this.isEnabled(v)) {
        this.servicing = v
        return v
      }
    }
    return null
  }

  /** Called by the interpreter when the ISR body finishes. */
  finish(onWarn?: (v: Vector) => void): void {
    if (!this.servicing) return
    const v = this.servicing
    this.servicing = null
    // If the handler did NOT call clear() on this vector before
    // returning, the next pickNext will fire the same vector again —
    // an infinite re-entry loop. That matches real hardware (the
    // pending bit stays set until SW clears it), but is confusing the
    // first time. Warn once per vector.
    if (this.pending.has(v) && !this.warned.has(v)) {
      this.warned.add(v)
      onWarn?.(v)
    }
  }
}
