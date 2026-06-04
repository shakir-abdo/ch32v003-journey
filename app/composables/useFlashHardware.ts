/**
 * Compile-then-flash flow: editor source → /api/compile → wch-linke → chip.
 *
 * Streams progress through reactive state (phase, progress, pages,
 * detail) so the UI can render a banner + progress bar. Mirrors the
 * same events into an `onLog` callback for the existing console.
 *
 * Returns true on success, false on failure (errors are surfaced via
 * `lastError` + the log callback — no need for try/catch at call sites).
 */

import {
  requestDevice, release, flash as flashChip, FlashVerifyError,
  type FlashEvent, type FlashResult,
} from '~/sim/wch-linke'

// Window.grecaptcha is injected by the script tag we load in /playground
// when NUXT_PUBLIC_RECAPTCHA_SITE_KEY is configured.
interface Grecaptcha {
  ready(callback: () => void): void
  execute(siteKey: string, options: {action: string}): Promise<string>
}
declare global {
  interface Window {grecaptcha?: Grecaptcha}
}

/** Poll for `window.grecaptcha` then ask it for a v3 token. Times out at
 * 5 s — beyond that something else (network, extension) is blocking the
 * Google script and the user should know rather than wait silently. */
async function fetchRecaptchaToken(siteKey: string, timeoutMs = 5000): Promise<string> {
  const start = performance.now()
  while (!window.grecaptcha) {
    if (performance.now() - start > timeoutMs) throw new Error('grecaptcha not loaded')
    await new Promise((r) => setTimeout(r, 50))
  }
  return await new Promise<string>((resolve, reject) => {
    window.grecaptcha!.ready(() => {
      window.grecaptcha!.execute(siteKey, {action: 'compile'})
        .then(resolve)
        .catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))))
    })
  })
}

export type FlashLogLevel = 'info' | 'warn' | 'error'
export interface FlashLogEntry {level: FlashLogLevel; msg: string}

export type FlashPhase =
  | 'idle' | 'compiling' | 'connecting'
  | 'identify' | 'unlock'
  | 'erase' | 'program' | 'verify' | 'reboot'
  | 'done' | 'error'

export interface UseFlashHardwareOptions {
  onLog: (entry: FlashLogEntry) => void
}

export function useFlashHardware(opts: UseFlashHardwareOptions) {
  const flashing  = ref(false)
  const phase     = ref<FlashPhase>('idle')
  const progress  = ref(0)                                    // 0-100
  const detail    = ref<string>('')                           // human-readable subtitle
  const pages     = ref<{current: number; total: number} | null>(null)
  const lastError = ref<string | null>(null)
  const lastResult = ref<FlashResult | null>(null)

  function log(level: FlashLogLevel, msg: string): void {
    opts.onLog({level, msg: `[hw] ${msg}`})
  }

  function applyEvent(e: FlashEvent): void {
    switch (e.phase) {
      case 'connect':
        phase.value = 'connecting'
        detail.value = `${e.manufacturer ?? '?'} / ${e.product ?? '?'}`
        progress.value = 10
        log('info', `connected: ${detail.value}`)
        break
      case 'identify':
        phase.value = 'identify'
        progress.value = 15
        log('info', '[1/6] identify (halts target)')
        break
      case 'unlock':
        phase.value = 'unlock'
        progress.value = 20
        log('info', '[2/6] unlock flash')
        break
      case 'erase-start':
        phase.value = 'erase'
        pages.value = {current: 0, total: e.pageCount}
        progress.value = 25
        log('info', `[3/6] mass erase (${e.pageCount} pages)`)
        break
      case 'erase-done':
        progress.value = 30
        log('info', `      → erased in ${e.ms} ms`)
        break
      case 'program-start':
        phase.value = 'program'
        pages.value = {current: 0, total: e.pageCount}
        progress.value = 35
        log('info', `[4/6] program ${e.pageCount} pages × 64 B`)
        break
      case 'program-page':
        pages.value = {current: e.page, total: e.pageCount}
        // Page progress maps onto 35..80.
        progress.value = 35 + Math.round((e.page / e.pageCount) * 45)
        if ((e.page & 3) === 0 || e.page === e.pageCount) {
          log('info', `      page ${String(e.page).padStart(3)}/${e.pageCount}`)
        }
        break
      case 'program-done':
        progress.value = 80
        log('info', `      → programmed in ${e.ms} ms`)
        break
      case 'verify-start':
        phase.value = 'verify'
        progress.value = 85
        log('info', '[5/6] verify (read-back + compare)')
        break
      case 'verify-done':
        progress.value = 92
        log('info', `      → verified in ${e.ms} ms`)
        break
      case 'reboot':
        phase.value = 'reboot'
        progress.value = 96
        log('info', '[6/6] reboot (NDMRESET)')
        break
    }
  }

  function resetState(): void {
    phase.value     = 'idle'
    progress.value  = 0
    detail.value    = ''
    pages.value     = null
    lastError.value = null
    lastResult.value = null
  }

  /** Hold the success/error banner for a moment so the user sees it before
   * it disappears, then slide back to idle. */
  function dismissSoon(ms = 4500): void {
    setTimeout(() => {
      if (phase.value === 'done' || phase.value === 'error') resetState()
    }, ms)
  }

  async function compileSource(source: string): Promise<Uint8Array> {
    const headers: Record<string, string> = {'content-type': 'text/x-c'}
    // Attach a fresh reCAPTCHA v3 token if a site key is configured. The
    // server skips verification when no secret is set, so omitting the
    // header is harmless in local-dev / smoke-test contexts.
    const siteKey = useRuntimeConfig().public.recaptchaSiteKey
    if (siteKey) {
      try {
        headers['x-recaptcha-token'] = await fetchRecaptchaToken(siteKey)
      } catch (e) {
        throw new Error(
          'reCAPTCHA failed to load — disable any extension blocking google.com ' +
          'or check the network tab. ' +
          (e instanceof Error ? e.message : String(e)),
        )
      }
    }
    const res = await fetch('/api/compile', {method: 'POST', headers, body: source})
    if (!res.ok) {
      let body = ''
      try {
        const j = await res.json() as {data?: {log?: string; detail?: string}; statusMessage?: string}
        body = j.data?.log ?? j.data?.detail ?? j.statusMessage ?? ''
      } catch {
        body = await res.text().catch(() => '')
      }
      const tail = body.trim().split('\n').slice(-4).join('\n')
      throw new Error(`compile failed (${res.status}):\n${tail || 'no detail'}`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }

  async function flash(source: string): Promise<boolean> {
    if (flashing.value) return false
    flashing.value  = true
    resetState()
    phase.value     = 'compiling'
    progress.value  = 3
    detail.value    = ''
    try {
      log('info', 'compiling …')
      const tCompile = performance.now()
      const bin = await compileSource(source)
      detail.value = `${bin.length} bytes`
      progress.value = 7
      log('info', `compiled (${bin.length} bytes, ${Math.round(performance.now() - tCompile)} ms)`)

      phase.value = 'connecting'
      log('info', 'requesting WCH-LinkE … (allow the device in the prompt)')
      const device = await requestDevice()
      try {
        const result = await flashChip(device, bin, applyEvent)
        lastResult.value = result
        phase.value    = 'done'
        progress.value = 100
        detail.value   = `${result.bytes} B in ${(result.totalMs / 1000).toFixed(2)} s`
        log('info', `✓ flashed + verified in ${result.totalMs} ms — chip is running the new firmware`)
        dismissSoon()
        return true
      } finally {
        await release(device)
      }
    } catch (e) {
      let msg: string
      if (e instanceof FlashVerifyError) {
        msg = `verify mismatch: ${e.mismatchCount} bytes differ (first at 0x${e.firstBadOffset.toString(16)})`
      } else if (e instanceof Error) {
        msg = e.message
      } else {
        msg = String(e)
      }
      lastError.value = msg
      phase.value     = 'error'
      progress.value  = 0
      detail.value    = msg.split('\n')[0] ?? msg
      log('error', msg)
      log('warn', 'if the chip wedged: power-cycle the WCH-LinkE (unplug + replug), then click Flash again')
      dismissSoon(7000)
      return false
    } finally {
      flashing.value = false
    }
  }

  return {
    flash,
    flashing,
    phase,
    progress,
    detail,
    pages,
    lastError,
    lastResult,
    dismiss: resetState,
  }
}
