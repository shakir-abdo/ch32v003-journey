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
  newValue: number
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
