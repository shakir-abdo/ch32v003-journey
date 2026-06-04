<script setup lang="ts">
import {PRESET_BY_ID, PRESETS} from '~/sim/presets'

const {t, locale} = useI18n()
const route = useRoute()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'المختبر · CH32V003 Journey'
    : 'Playground · CH32V003 Journey',
  description: () => locale.value === 'ar'
    ? 'محاكي بصري لسجلات CH32V003J4M6 — اكتب الكود وراقب البتات وحالات الـ pins تتغيّر سطراً بسطر.'
    : 'Visual CH32V003J4M6 register simulator — write code and watch bits and pin states change line by line.'
})

const {
  registers, pins, consoleEntries, activeLineRange,
  running, halted, paused, speedMs, tickMultiplier, lastChangedRegister, highlightedRegisters,
  compile, step, run, pause, reset, clearConsole, manualWrite
} = useSimulator()

// ─── persistent state (localStorage) ───────────────────────────────
// Stores the learner's last edit + which preset it was based on (so
// "reset to default" knows what to restore to). Wrapped in a single
// object so we keep one storage entry.
interface SavedState {
  presetId: string
  code: string
  savedAt: number
}
const savedState = useLocalStorage<SavedState | null>('ch32v003-journey:playground', null, {
  serializer: {
    read: (v) => { try { return v && v !== 'null' ? JSON.parse(v) : null } catch { return null } },
    write: (v) => v ? JSON.stringify(v) : 'null'
  }
})

// Initial preset: prefer query param, else last saved, else first preset.
const presetFromQuery = route.query.example as string | undefined
const initialId = presetFromQuery
  || savedState.value?.presetId
  || PRESETS[0]?.id || ''
const currentPresetId = ref(initialId)

const initialPreset = (initialId && PRESET_BY_ID.get(initialId)) || PRESETS[0]
const initialCode = (
  // If the URL forces a preset, that wins (lesson "Try in playground" should always show the lesson's code, not the learner's stale local copy).
  presetFromQuery
    ? initialPreset?.code
    : (savedState.value?.code ?? initialPreset?.code)
) ?? ''
const code = ref(initialCode)

function loadPreset(id: string) {
  const p = PRESET_BY_ID.get(id)
  if (!p) return
  currentPresetId.value = id
  code.value = p.code
  reset()
  consoleEntries.value.push({level: 'info', msg: `loaded preset: ${(p.title as any)[locale.value] ?? p.title.en}`})
  persist()
}

function resetToDefault() {
  const p = PRESET_BY_ID.get(currentPresetId.value)
  if (!p) return
  code.value = p.code
  reset()
  consoleEntries.value.push({level: 'info', msg: `restored ${(p.title as any)[locale.value] ?? p.title.en} to its original code`})
  persist()
}

const hasUnsavedEdits = computed(() => {
  const p = PRESET_BY_ID.get(currentPresetId.value)
  return p ? p.code !== code.value : false
})

let persistTimer: ReturnType<typeof setTimeout> | null = null
function persist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    savedState.value = {
      presetId: currentPresetId.value,
      code: code.value,
      savedAt: Date.now()
    }
  }, 400)
}
// Auto-save on every edit (debounced).
watch(code, persist)

// React to URL changes (someone clicks "Try in playground" while on the page).
watch(() => route.query.example, (id) => {
  if (typeof id === 'string' && PRESET_BY_ID.has(id)) loadPreset(id)
})

// ─── Tutorial overlay (first-visit only) ───────────────────────────
const tutorialDismissed = useLocalStorage<boolean>('ch32v003-journey:playground-tutorial-seen', false)
const tutorialOpen = ref(false)
onMounted(() => {
  if (!tutorialDismissed.value) tutorialOpen.value = true
})
function dismissTutorial() {
  tutorialOpen.value = false
  tutorialDismissed.value = true
}
function openTutorial() {
  tutorialOpen.value = true
}

function onRun()       { run(code.value) }
function onPause()     { pause() }
function onStep()      { step(code.value) }
function onReset()     { reset() }
function onCompile()   { compile(code.value) }
function onRestore()   { resetToDefault() }
function onShowHelp()  { openTutorial() }

function onManualWrite(address: number, value: number) {
  manualWrite(address, value)
}

// ─── Hardware flash (real chip via WebUSB → /api/compile → wch-linke) ──
const toast = useToast()
const {
  flash: flashHardware, flashing: hwFlashing,
  phase: hwPhase, progress: hwProgress, detail: hwDetail, pages: hwPages,
  lastError: hwError, lastResult: hwResult, dismiss: hwDismiss
} = useFlashHardware({
  onLog: (entry) => consoleEntries.value.push(entry)
})
async function onFlash() {
  const ok = await flashHardware(code.value)
  if (ok && hwResult.value) {
    toast.add({
      title: t('app.sim.ctrl.flashToastSuccess'),
      description: t('app.sim.ctrl.flashToastSuccessBody', {
        bytes: hwResult.value.bytes,
        secs: (hwResult.value.totalMs / 1000).toFixed(2)
      }),
      color: 'success',
      icon: 'i-lucide-check-circle-2',
      duration: 6000
    })
  } else if (!ok && hwError.value) {
    toast.add({
      title: t('app.sim.ctrl.flashToastError'),
      description: hwError.value.split('\n')[0],
      color: 'error',
      icon: 'i-lucide-x-circle',
      duration: 10000
    })
  }
}

// Map phase → cyber palette token + icon + label key
const phaseStyle = computed(() => {
  switch (hwPhase.value) {
    case 'done':  return {color: 'var(--cy-success)',     icon: 'i-lucide-check-circle-2', label: 'app.sim.ctrl.phaseDone',       spin: false}
    case 'error': return {color: 'var(--cy-destructive)', icon: 'i-lucide-alert-triangle', label: 'app.sim.ctrl.phaseError',      spin: false}
    case 'compiling':  return {color: 'var(--cy-track-pro, #B14AED)', icon: 'i-lucide-hammer',         label: 'app.sim.ctrl.phaseCompiling',  spin: false}
    case 'connecting': return {color: 'var(--cy-primary)',  icon: 'i-lucide-plug-zap',     label: 'app.sim.ctrl.phaseConnecting', spin: true}
    case 'identify':   return {color: 'var(--cy-primary)',  icon: 'i-lucide-fingerprint',  label: 'app.sim.ctrl.phaseIdentify',   spin: false}
    case 'unlock':     return {color: 'var(--cy-primary)',  icon: 'i-lucide-unlock',       label: 'app.sim.ctrl.phaseUnlock',     spin: false}
    case 'erase':      return {color: 'var(--cy-warning)',  icon: 'i-lucide-eraser',       label: 'app.sim.ctrl.phaseErase',      spin: true}
    case 'program':    return {color: 'var(--cy-warning)',  icon: 'i-lucide-cpu',          label: 'app.sim.ctrl.phaseProgram',    spin: true}
    case 'verify':     return {color: 'var(--cy-primary)',  icon: 'i-lucide-shield-check', label: 'app.sim.ctrl.phaseVerify',     spin: true}
    case 'reboot':     return {color: 'var(--cy-success)',  icon: 'i-lucide-refresh-cw',   label: 'app.sim.ctrl.phaseReboot',     spin: true}
    default:           return {color: 'var(--cy-fg-muted)', icon: 'i-lucide-zap',          label: 'app.sim.ctrl.phaseIdle',       spin: false}
  }
})
</script>

<template>
  <div class="max-w-[1500px] mx-auto px-4 sm:px-6 py-8" :dir="isRtl ? 'rtl' : 'ltr'">
    <!-- Header -->
    <header class="mb-6 pb-4 border-b border-[var(--cy-border)]">
      <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-2" dir="ltr">
        // ROUTE: /playground · {{ t('app.sim.experimental') }}
      </div>
      <h1 class="font-display text-3xl sm:text-4xl font-bold uppercase text-[var(--cy-fg)] mb-2">
        {{ t('app.sim.title') }}
      </h1>
      <p class="text-[var(--cy-fg-muted)] max-w-3xl">
        {{ t('app.sim.subtitle') }}
      </p>
    </header>

    <!-- Mobile / narrow-screen notice — the simulator needs a wide canvas to be useful -->
    <div class="lg:hidden cy-panel p-8 text-center" :dir="isRtl ? 'rtl' : 'ltr'">
      <UIcon name="i-lucide-monitor" class="size-12 mx-auto mb-4 text-[var(--cy-primary)]" />
      <h2 class="font-display text-xl font-bold text-[var(--cy-fg)] mb-2 uppercase">
        {{ t('app.sim.mobileBlock.title') }}
      </h2>
      <p class="text-[var(--cy-fg-muted)] leading-relaxed max-w-md mx-auto">
        {{ t('app.sim.mobileBlock.body') }}
      </p>
      <div class="mt-6 font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]" dir="ltr">
        // {{ t('app.sim.mobileBlock.hint') }}
      </div>
    </div>

    <!-- Simulator UI — visible on lg+ only -->
    <div class="hidden lg:block">
    <!-- Preset picker + helpers -->
    <div class="mb-4 flex items-stretch gap-3 flex-wrap">
      <div class="flex-1 min-w-0">
        <SimPresetMenu @load="loadPreset" />
      </div>
      <div class="cy-panel px-3 py-2 inline-flex items-center gap-2" :dir="isRtl ? 'rtl' : 'ltr'">
        <button
          type="button"
          :disabled="hwFlashing"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-[2px] font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          :style="{
            color: 'var(--cy-success)',
            borderColor: 'color-mix(in srgb, var(--cy-success) 55%, transparent)',
            background: 'color-mix(in srgb, var(--cy-success) 14%, transparent)',
            boxShadow: hwFlashing ? 'none' : '0 0 8px color-mix(in srgb, var(--cy-success) 25%, transparent)'
          }"
          :title="t('app.sim.ctrl.flashTitle')"
          @click="onFlash"
        >
          <UIcon
            :name="hwFlashing ? 'i-lucide-loader-circle' : 'i-lucide-zap'"
            class="size-3"
            :class="hwFlashing ? 'animate-spin' : ''"
          />
          {{ hwFlashing ? t('app.sim.ctrl.flashing') : t('app.sim.ctrl.flash') }}
        </button>
        <button
          type="button"
          :disabled="!hasUnsavedEdits"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-[2px] font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :style="{
            color: 'var(--cy-warning)',
            borderColor: 'color-mix(in srgb, var(--cy-warning) 45%, transparent)',
            background: 'color-mix(in srgb, var(--cy-warning) 10%, transparent)'
          }"
          :title="t('app.sim.ctrl.restoreTitle')"
          @click="onRestore"
        >
          <UIcon name="i-lucide-undo-2" class="size-3" :class="isRtl ? 'scale-x-[-1]' : ''" />
          {{ t('app.sim.ctrl.restore') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-[2px] font-mono text-[10px] uppercase tracking-wider transition-all"
          :style="{
            color: 'var(--cy-primary)',
            borderColor: 'color-mix(in srgb, var(--cy-primary) 45%, transparent)',
            background: 'color-mix(in srgb, var(--cy-primary) 10%, transparent)'
          }"
          :title="t('app.sim.ctrl.helpTitle')"
          @click="onShowHelp"
        >
          <UIcon name="i-lucide-help-circle" class="size-3" />
          {{ t('app.sim.ctrl.help') }}
        </button>
      </div>
    </div>

    <!-- Control bar -->
    <div class="mb-4">
      <SimControlBar
        v-model:speed-ms="speedMs"
        v-model:tick-multiplier="tickMultiplier"
        :running="running"
        :halted="halted"
        :paused="paused"
        @run="onRun"
        @pause="onPause"
        @step="onStep"
        @reset="onReset"
        @compile="onCompile"
      />
    </div>

    <!-- Hardware flash status — visible while phase != idle, fades after success/error -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-300 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="hwPhase !== 'idle'"
        class="cy-panel mb-4 px-4 py-3 border-l-[3px]"
        :style="{
          borderLeftColor: phaseStyle.color,
          background: `color-mix(in srgb, ${phaseStyle.color} 6%, var(--cy-card))`
        }"
        :dir="isRtl ? 'rtl' : 'ltr'"
      >
        <div class="flex items-center gap-3 mb-2 flex-wrap" dir="ltr">
          <div
            class="inline-flex items-center justify-center size-7 rounded-[2px]"
            :style="{
              color: phaseStyle.color,
              background: `color-mix(in srgb, ${phaseStyle.color} 18%, transparent)`,
              borderInline: `1px solid color-mix(in srgb, ${phaseStyle.color} 35%, transparent)`
            }"
          >
            <UIcon
              :name="phaseStyle.icon"
              class="size-4"
              :class="phaseStyle.spin ? 'animate-spin' : ''"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div
              class="font-mono text-[11px] uppercase tracking-wider font-bold"
              :style="{color: phaseStyle.color}"
            >
              {{ t(phaseStyle.label) }}
              <span
                v-if="hwPages && (hwPhase === 'program' || hwPhase === 'erase')"
                class="text-[var(--cy-fg-muted)] font-normal"
              >
                &middot; {{ hwPages.current }}/{{ hwPages.total }}
              </span>
            </div>
            <div
              v-if="hwDetail"
              class="font-mono text-[11px] text-[var(--cy-fg-muted)] mt-0.5 truncate"
            >
              {{ hwDetail }}
            </div>
          </div>
          <div class="font-mono text-[11px] text-[var(--cy-fg-muted)] tabular-nums" dir="ltr">
            {{ hwProgress }}%
          </div>
          <button
            v-if="hwPhase === 'done' || hwPhase === 'error'"
            type="button"
            class="inline-flex items-center justify-center size-6 rounded-[2px] border border-[var(--cy-border)] text-[var(--cy-fg-muted)] hover:text-[var(--cy-fg)] hover:border-[var(--cy-border-strong)] transition-colors"
            :title="t('app.sim.ctrl.flashDismiss')"
            @click="hwDismiss"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>

        <!-- Progress rail -->
        <div
          class="h-1.5 rounded-[1px] overflow-hidden"
          :style="{
            background: 'color-mix(in srgb, var(--cy-fg-muted) 12%, transparent)'
          }"
        >
          <div
            class="h-full transition-[width] duration-300 ease-out"
            :style="{
              width: hwProgress + '%',
              background: phaseStyle.color,
              boxShadow: hwPhase !== 'error' ? `0 0 8px color-mix(in srgb, ${phaseStyle.color} 60%, transparent)` : 'none'
            }"
          />
        </div>
      </div>
    </Transition>

    <!-- Row 1: Registers (full width, internal 4-col grid) -->
    <div class="mb-4">
      <SimRegisterPanel
        :registers="registers"
        :highlighted-register="lastChangedRegister"
        :highlighted-registers="highlightedRegisters"
      />
    </div>

    <!-- Row 2: Editor (2/3) + Chip (1/3). Both have a fixed height so the
         editor never grows past the viewport on long code — internal scroller
         takes over instead. -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch">
      <div class="lg:col-span-2 flex flex-col h-[560px]">
        <SimCodeEditor v-model="code" :active-line-range="activeLineRange" />
      </div>
      <div class="lg:col-span-1 flex flex-col h-[560px]">
        <SimChipDiagram :pins="pins" />
      </div>
    </div>

    <!-- Manual-write debug widget (kept for spot-checks during dev) -->
    <details class="mb-4">
      <summary class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] cursor-pointer mb-2">
        // {{ t('app.sim.debug.toggle') }}
      </summary>
      <SimManualWrite @write="onManualWrite" />
    </details>

    <!-- Console -->
    <div class="h-48">
      <SimConsole :entries="consoleEntries" @clear="clearConsole" />
    </div>
    </div><!-- /lg:block -->

    <!-- Tutorial overlay — auto-opens once per learner, re-openable via the Help button -->
    <SimTutorial :open="tutorialOpen" @close="dismissTutorial" />
  </div>
</template>
