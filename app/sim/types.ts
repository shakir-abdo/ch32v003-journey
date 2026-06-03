export type PinStatus =
  | 'VCC' | 'GND'
  | 'HIGH' | 'LOW'
  | 'INPUT' | 'INPUT-PU' | 'INPUT-PD'
  | 'AF' | 'ADC' | 'HI-Z'

export interface PinDef {
  num: number
  net: string
  port?: 'A' | 'C' | 'D'
  bit?: number
  altLabel?: string
  status: PinStatus
}

export interface RegisterWrite {
  register: string
  address: number
  oldValue: number
  /** Final value committed to storage after all hook side-effects. */
  newValue: number
  /**
   * Peak (high-water) value seen during the transaction. Differs from
   * `newValue` only when the register was written, then a hook reverted
   * it (e.g. GPIOx_BSHR ← user-write → hardware-clears-to-0). The UI
   * shows this during the flash window so the learner can see what was
   * actually written before the hardware reclaim.
   */
  transientValue?: number
  bitsFlipped: number[]
}

export interface PinChange {
  pin: string
  oldStatus: PinStatus
  newStatus: PinStatus
}

export interface StepResult {
  lineRange: [number, number]
  writes: RegisterWrite[]
  pinChanges: PinChange[]
  log?: string
}

export interface RegisterDef {
  name: string
  address: number
  reset: number
  peripheral: string
  /** Optional bit-field annotations: bitIndex → short label */
  fields?: Record<number, string>
}
