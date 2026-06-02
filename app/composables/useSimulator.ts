/**
 * useSimulator() — single shared bus + reactive views for the playground page.
 *
 * The bus and interpreter live outside Vue's reactivity for performance;
 * we mirror their state into refs every time something changes. That
 * happens on parse, write, step, and reset.
 */
import {Bus} from '~/sim/bus'
import {REGISTERS} from '~/sim/registers'
import {rccHook} from '~/sim/peripherals/rcc'
import {gpioHook, gpioPinModel} from '~/sim/peripherals/gpio'
import {parse, ParseError} from '~/sim/parser'
import {Interpreter, RuntimeError} from '~/sim/interpreter'
import type {PinDef, PinStatus} from '~/sim/types'

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

  const registers   = ref<RegisterRow[]>([])
  const pins        = ref<PinDef[]>([])
  const consoleEntries = ref<Array<{level: 'info'|'warn'|'error'; msg: string}>>([])
  const activeLineRange = ref<[number, number] | null>(null)
  const interpreterReady = ref(false)
  const halted     = ref(false)
  const running    = ref(false)
  /** True after the interpreter has executed at least one step and is not currently running — i.e. paused. Distinguishes "Run" (fresh) from "Resume". */
  const paused     = ref(false)
  /** Per-step interval in ms. Read live by run() so the slider takes effect immediately. */
  const speedMs    = ref(800)
  /** Name of the register most recently touched — drives the auto-scroll. */
  const lastChangedRegister = ref<string | null>(null)

  let interpreter: Interpreter | null = null
  let runTimer: ReturnType<typeof setTimeout> | null = null

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
    if (!reg) { log('warn', `unknown address ${hex(address)}`); return }
    const result = bus.write(address, value >>> 0)
    const flashed = new Map<number, number[]>()
    for (const w of result.writes) flashed.set(w.address, w.bitsFlipped)
    flushSnapshot(flashed)
    for (const w of result.writes) {
      const tag = w.address === address ? 'WRITE' : '↪ side-effect'
      log('info', `${tag} ${w.register} : ${hex(w.oldValue)} → ${hex(w.newValue)} (bits flipped: ${w.bitsFlipped.join(', ') || '—'})`)
    }
    for (const pc of result.pinChanges) log('info', `PIN ${pc.pin} : ${pc.oldStatus} → ${pc.newStatus}`)
    if (flashed.size > 0) setTimeout(() => flushSnapshot(), 700)
  }

  function compile(source: string): boolean {
    try {
      const {program, macros, warnings} = parse(source)
      interpreter = new Interpreter(program, bus, macros, {
        onLog: (lvl, m) => log(lvl, m)
      })
      for (const w of warnings) log('warn', w)
      interpreterReady.value = true
      halted.value = false
      paused.value = false  // fresh compile — no step has fired yet
      activeLineRange.value = null
      log('info', `compiled ${macros.size} macros + main()${program.main ? '' : ' [no main]'}`)
      return true
    } catch (e) {
      interpreter = null
      interpreterReady.value = false
      if (e instanceof ParseError) {
        log('error', e.message)
      } else if (e instanceof Error) {
        log('error', `compile error: ${e.message}`)
      } else {
        log('error', 'compile error: unknown')
      }
      return false
    }
  }

  function step(source: string): boolean {
    if (!interpreter) {
      if (!compile(source)) return false
    }
    try {
      const r = interpreter!.step()
      if (!r) {
        halted.value = true
        paused.value = false
        activeLineRange.value = null
        log('info', 'halt — end of program')
        return false
      }
      applyStepDiff(r.writes, r.pinChanges)
      activeLineRange.value = r.lineRange
      paused.value = true   // we've made progress — next Run is a Resume
      if (r.log) log('info', r.log)
      return true
    } catch (e) {
      handleRuntimeError(e)
      return false
    }
  }

  function applyStepDiff(writes: ReturnType<typeof bus.write>['writes'], pinChanges: ReturnType<typeof bus.write>['pinChanges']) {
    const flashed = new Map<number, number[]>()
    let last: string | null = null
    for (const w of writes) {
      flashed.set(w.address, w.bitsFlipped)
      last = w.register
      log('info', `WRITE ${w.register} : ${hex(w.oldValue)} → ${hex(w.newValue)} (bits: ${w.bitsFlipped.join(', ') || '—'})`)
    }
    for (const pc of pinChanges) log('info', `PIN ${pc.pin} : ${pc.oldStatus} → ${pc.newStatus}`)
    if (last) lastChangedRegister.value = last
    flushSnapshot(flashed)
    // Flash duration scales with run speed so a slow-step learner gets to
    // see the bit highlight, while a fast-run user doesn't see overlap.
    const flashMs = Math.max(300, Math.min(speedMs.value - 100, 1500))
    if (flashed.size > 0) setTimeout(() => {
      flushSnapshot()
      lastChangedRegister.value = null
    }, flashMs)
  }

  function run(source: string) {
    if (!interpreter) {
      if (!compile(source)) return
    }
    running.value = true
    halted.value = false

    const tick = () => {
      if (!running.value || !interpreter) return
      try {
        const r = interpreter.step()
        if (!r) {
          running.value = false
          paused.value = false   // halted — there's nothing to resume from
          halted.value = true
          activeLineRange.value = null
          log('info', 'halt — end of program')
          return
        }
        applyStepDiff(r.writes, r.pinChanges)
        activeLineRange.value = r.lineRange
        paused.value = true   // mid-execution → next Run is a Resume
        if (r.log) log('info', r.log)
        // Read speedMs live each tick so the slider takes effect immediately.
        runTimer = setTimeout(tick, speedMs.value)
      } catch (e) {
        running.value = false
        handleRuntimeError(e)
      }
    }
    tick()
  }

  function pause() {
    running.value = false
    if (runTimer) { clearTimeout(runTimer); runTimer = null }
    // If we've actually stepped something, mark as paused for the Resume label.
    if (interpreter && interpreterReady.value && !halted.value) paused.value = true
  }

  function reset() {
    pause()
    bus.reset()
    interpreter = null
    interpreterReady.value = false
    halted.value = false
    paused.value = false
    activeLineRange.value = null
    consoleEntries.value = [{level: 'info', msg: 'simulator reset.'}]
    flushSnapshot()
  }

  function clearConsole() {
    consoleEntries.value = []
  }

  function handleRuntimeError(e: unknown) {
    if (e instanceof RuntimeError) {
      log('error', e.message)
    } else if (e instanceof Error) {
      log('error', `runtime error: ${e.message}`)
    } else {
      log('error', 'runtime error: unknown')
    }
  }

  // Initial snapshot
  flushSnapshot()

  return {
    registers,
    pins,
    consoleEntries,
    activeLineRange,
    interpreterReady,
    halted,
    running,
    paused,
    speedMs,
    lastChangedRegister,
    compile,
    step,
    run,
    pause,
    reset,
    clearConsole,
    manualWrite
  }
}

function hex(v: number): string {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0')
}
