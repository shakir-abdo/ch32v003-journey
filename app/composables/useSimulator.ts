/**
 * useSimulator() — single shared bus + reactive views for the playground page.
 *
 * The bus itself lives outside Vue's reactivity for performance; we mirror
 * its state into refs every time we call `flushSnapshot()`. That happens
 * on write/reset, which is the only time anything changes in Phase 2.
 *
 * Phase 4 will add `step()` once the interpreter lands.
 */
import {Bus} from '~/sim/bus'
import {REGISTERS} from '~/sim/registers'
import {rccHook} from '~/sim/peripherals/rcc'
import {gpioHook, gpioPinModel} from '~/sim/peripherals/gpio'
import type {PinStatus, PinDef} from '~/sim/types'

export interface RegisterRow {
  name: string
  address: number
  value: number
  reset: number
  peripheral: string
  fields?: Record<number, string>
  flashedBits: number[]
}

let _bus: Bus | null = null
function getBus(): Bus {
  if (_bus) return _bus
  const b = new Bus()
  b.registerHook(rccHook)
  b.registerHook(gpioHook)
  b.setPinModel(gpioPinModel)
  _bus = b
  return b
}

// J4M6 pin order on the chip diagram (top-down, pins 1→8).
const J4M6_LAYOUT: Array<Omit<PinDef, 'status'>> = [
  {num: 1, net: 'PD6', port: 'D', bit: 6, altLabel: 'TX'},
  {num: 2, net: 'GND'},
  {num: 3, net: 'PA2', port: 'A', bit: 2},
  {num: 4, net: 'VCC'},
  {num: 5, net: 'PC1', port: 'C', bit: 1, altLabel: 'SDA'},
  {num: 6, net: 'PC2', port: 'C', bit: 2, altLabel: 'SCL'},
  {num: 7, net: 'PC4', port: 'C', bit: 4, altLabel: 'ADC2'},
  {num: 8, net: 'PD4', port: 'D', bit: 4, altLabel: 'SWIO'}
]

export function useSimulator() {
  const bus = getBus()

  const registers = ref<RegisterRow[]>([])
  const pins = ref<PinDef[]>([])
  const consoleEntries = ref<Array<{level: 'info'|'warn'|'error'; msg: string}>>([])

  function flushSnapshot(flashedByAddress = new Map<number, number[]>()) {
    registers.value = REGISTERS.map((r) => ({
      name: r.name,
      address: r.address,
      value: bus.read(r.address),
      reset: r.reset,
      peripheral: r.peripheral,
      fields: r.fields,
      flashedBits: flashedByAddress.get(r.address) ?? []
    }))

    const pinStatus = bus.pinSnapshot()
    pins.value = J4M6_LAYOUT.map((p) => ({
      ...p,
      status: p.net === 'VCC' ? 'VCC' as PinStatus
            : p.net === 'GND' ? 'GND' as PinStatus
            : (pinStatus.get(p.net) ?? 'HI-Z')
    }))
  }

  function log(level: 'info'|'warn'|'error', msg: string) {
    consoleEntries.value.push({level, msg})
  }

  function manualWrite(address: number, value: number) {
    const reg = REGISTERS.find((r) => r.address === address)
    if (!reg) {
      log('warn', `unknown address ${hex(address)}`)
      return
    }
    const result = bus.write(address, value >>> 0)

    // Build flash map for the UI.
    const flashed = new Map<number, number[]>()
    for (const w of result.writes) {
      flashed.set(w.address, w.bitsFlipped)
    }
    flushSnapshot(flashed)

    // Log primary + cascading writes.
    for (const w of result.writes) {
      const tag = w.address === address ? 'WRITE' : '↪ side-effect'
      log('info',
        `${tag} ${w.register} : ${hex(w.oldValue)} → ${hex(w.newValue)} (bits flipped: ${w.bitsFlipped.join(', ') || '—'})`
      )
    }
    for (const pc of result.pinChanges) {
      log('info', `PIN ${pc.pin} : ${pc.oldStatus} → ${pc.newStatus}`)
    }

    // Drop flash highlight after a moment so subsequent writes can pulse again.
    if (flashed.size > 0) {
      setTimeout(() => flushSnapshot(), 700)
    }
  }

  function reset() {
    bus.reset()
    consoleEntries.value = [{level: 'info', msg: 'Simulator reset.'}]
    flushSnapshot()
  }

  function clearConsole() {
    consoleEntries.value = []
  }

  // Initial snapshot
  flushSnapshot()

  return {
    registers,
    pins,
    consoleEntries,
    manualWrite,
    reset,
    clearConsole
  }
}

function hex(v: number): string {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0')
}
