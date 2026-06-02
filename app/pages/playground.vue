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
  running, halted, speedMs, lastChangedRegister,
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
          :disabled="!hasUnsavedEdits"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-[2px] font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :style="{color: 'var(--cy-warning)', borderColor: 'var(--cy-warning)55', background: 'rgba(255,184,0,0.06)'}"
          :title="t('app.sim.ctrl.restoreTitle')"
          @click="onRestore"
        >
          <UIcon name="i-lucide-undo-2" class="size-3" />
          {{ t('app.sim.ctrl.restore') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-[2px] font-mono text-[10px] uppercase tracking-wider transition-all"
          :style="{color: 'var(--cy-primary)', borderColor: 'var(--cy-primary)55', background: 'rgba(0,240,255,0.06)'}"
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
        :running="running"
        :halted="halted"
        @run="onRun"
        @pause="onPause"
        @step="onStep"
        @reset="onReset"
        @compile="onCompile"
      />
    </div>

    <!-- Row 1: Registers (full width, internal 4-col grid) -->
    <div class="mb-4">
      <SimRegisterPanel :registers="registers" :highlighted-register="lastChangedRegister" />
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
