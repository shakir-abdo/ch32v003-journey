/**
 * MMIO bus + peripheral side-effect hooks.
 *
 * Every register lives in a flat Map keyed by address. Each peripheral
 * registers (a) a writeHook that fires after the user write lands and
 * may emit further "side-effect" writes (e.g. RCC setting HSIRDY when
 * HSION is set), and (b) a postSettle hook that runs once per
 * transaction to recompute derived state (pin statuses).
 *
 * A transaction = one user-level write to a single address. The bus
 * collects every register that actually changed during the transaction
 * (the user write + cascading side effects) and returns them as the
 * `writes` array, along with any pin status changes from `postSettle`.
 *
 * No physical timing — the chip's analog reality (oscillator startup,
 * etc.) is abstracted to "ready bits set immediately".
 */

import type {PinChange, PinStatus, RegisterWrite} from './types'
import {REGISTER_BY_ADDR, REGISTERS, type RegisterEntry} from './registers'

export interface WriteContext {
  bus: Bus
  reg: RegisterEntry
  oldValue: number
  newValue: number
}

export interface WriteHook {
  /** Inclusive address range this hook reacts to. */
  matches(address: number): boolean
  /**
   * Called after the user write has landed in the bus' value map.
   * May write further registers via `bus.writeSilent(...)` to model
   * hardware side effects. Side-effect writes are collected into the
   * outer transaction automatically.
   */
  onWrite(ctx: WriteContext): void
}

export interface PinModel {
  /** Compute every pin's current status from the latest register state. */
  resolvePins(bus: Bus): Map<string, PinStatus>
}

export class Bus {
  /** Address → 32-bit value (lower 32 bits only; we always mask). */
  private values = new Map<number, number>()

  /** Captures every register touched by the current transaction. */
  private txWrites: RegisterWrite[] | null = null

  private hooks: WriteHook[] = []
  private pinModel: PinModel | null = null
  private lastPinStatus = new Map<string, PinStatus>()

  constructor() {
    this.reset()
  }

  reset(): void {
    this.values.clear()
    for (const r of REGISTERS) this.values.set(r.address, r.reset >>> 0)
    this.lastPinStatus.clear()
    if (this.pinModel) {
      this.lastPinStatus = this.pinModel.resolvePins(this)
    }
  }

  registerHook(hook: WriteHook): void {
    this.hooks.push(hook)
  }
  setPinModel(model: PinModel): void {
    this.pinModel = model
    this.lastPinStatus = model.resolvePins(this)
  }

  read(address: number): number {
    return (this.values.get(address) ?? 0) >>> 0
  }

  /** Internal write — applies the value but doesn't open a transaction. */
  writeSilent(address: number, value: number): void {
    const newValue = value >>> 0
    this.values.set(address, newValue)
    // If we're already inside a transaction, record this side-effect write.
    if (this.txWrites) {
      const reg = REGISTER_BY_ADDR.get(address)
      if (reg) {
        const oldEntry = this.txWrites.find((w) => w.address === address)
        if (oldEntry) {
          // Track the union of every bit touched during the transaction,
          // not just the net delta. That way an atomic-bit-op write like
          // GPIOC_BSHR=(1<<1) — where the hook clears BSHR back to 0 a
          // tick later — still flashes bit 1 in the UI, even though the
          // register's final value matches its pre-tx state.
          const directFlips = bitsThatFlipped(oldEntry.oldValue, newValue)
          const intermediateFlips = bitsThatFlipped(oldEntry.newValue, newValue)
          const allFlipped = new Set([
            ...oldEntry.bitsFlipped,
            ...directFlips,
            ...intermediateFlips
          ])
          oldEntry.newValue = newValue
          oldEntry.bitsFlipped = [...allFlipped].sort((a, b) => a - b)
        } else {
          // First side-effect on this register; original value isn't yet
          // captured because writeSilent skipped the tx framing. Pull the
          // pre-tx value from the lastTxOldValues map we keep alongside.
          const captured = this.captureOldValues.get(address)
          const oldVal = captured ?? newValue
          this.txWrites.push({
            register: reg.name,
            address,
            oldValue: oldVal,
            newValue,
            bitsFlipped: bitsThatFlipped(oldVal, newValue)
          })
        }
      }
    }
  }

  /** Tracks pre-transaction values so side-effect writes can compute diffs. */
  private captureOldValues = new Map<number, number>()

  /**
   * User-level write. Applies write-mask semantics (read-only bits stay),
   * fires hooks, and returns the full diff for the UI to animate.
   */
  write(address: number, rawValue: number): {writes: RegisterWrite[]; pinChanges: PinChange[]} {
    const reg = REGISTER_BY_ADDR.get(address)
    if (!reg) {
      return {writes: [], pinChanges: []}
    }

    const oldValue = this.read(address)
    // Read-only bits stay at their current value.
    const roMask = reg.readOnlyMask ?? 0
    const newValue = ((rawValue & ~roMask) | (oldValue & roMask)) >>> 0

    // Snapshot old values for side-effect diffing.
    this.captureOldValues.clear()
    this.captureOldValues.set(address, oldValue)
    for (const r of REGISTERS) {
      if (r.address !== address) this.captureOldValues.set(r.address, this.read(r.address))
    }

    this.txWrites = [{
      register: reg.name,
      address,
      oldValue,
      newValue,
      bitsFlipped: bitsThatFlipped(oldValue, newValue)
    }]
    this.values.set(address, newValue)

    // Fire hooks (these may issue further writeSilent calls).
    const ctx: WriteContext = {bus: this, reg, oldValue, newValue}
    for (const h of this.hooks) {
      if (h.matches(address)) h.onWrite(ctx)
    }

    // Filter out no-op entries (e.g. side-effect "wrote same value").
    const writes = this.txWrites.filter((w) => w.bitsFlipped.length > 0)
    this.txWrites = null

    // Resolve pin diffs.
    const pinChanges: PinChange[] = []
    if (this.pinModel) {
      const next = this.pinModel.resolvePins(this)
      for (const [pin, newStatus] of next) {
        const oldStatus = this.lastPinStatus.get(pin)
        if (oldStatus !== newStatus) {
          pinChanges.push({pin, oldStatus: oldStatus ?? 'HI-Z', newStatus})
        }
      }
      this.lastPinStatus = next
    }

    return {writes, pinChanges}
  }

  /** Full snapshot — used by the UI to render the register panel. */
  snapshot(): Array<{name: string; address: number; value: number; reset: number; peripheral: string; fields?: Record<number, string>}> {
    return REGISTERS.map((r) => ({
      name: r.name,
      address: r.address,
      value: this.read(r.address),
      reset: r.reset,
      peripheral: r.peripheral,
      fields: r.fields
    }))
  }

  /** Current pin status map (live). */
  pinSnapshot(): Map<string, PinStatus> {
    return new Map(this.lastPinStatus)
  }
}

function bitsThatFlipped(oldVal: number, newVal: number): number[] {
  const diff = (oldVal ^ newVal) >>> 0
  const out: number[] = []
  for (let i = 0; i < 32; i++) {
    if (diff & (1 << i)) out.push(i)
  }
  return out
}
