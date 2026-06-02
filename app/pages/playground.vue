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

// Initial code: deep-link via ?example=<id>, else the first preset.
const initialId = (route.query.example as string | undefined) ?? PRESETS[0]?.id ?? ''
const initialPreset = (initialId && PRESET_BY_ID.get(initialId)) || PRESETS[0]
const code = ref(initialPreset?.code ?? '')

function loadPreset(id: string) {
  const p = PRESET_BY_ID.get(id)
  if (!p) return
  code.value = p.code
  reset()
  consoleEntries.value.push({level: 'info', msg: `loaded preset: ${(p.title as any)[locale.value] ?? p.title.en}`})
}

// React to URL changes (someone clicks "Try in playground" while on the page).
watch(() => route.query.example, (id) => {
  if (typeof id === 'string' && PRESET_BY_ID.has(id)) loadPreset(id)
})

function onRun()   { run(code.value) }
function onPause() { pause() }
function onStep()  { step(code.value) }
function onReset() { reset() }
function onCompile() { compile(code.value) }

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

    <!-- Preset picker -->
    <div class="mb-4">
      <SimPresetMenu @load="loadPreset" />
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

    <!-- Row 2: Editor (2/3) + Chip (1/3). Both stretch to the same height. -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-stretch" style="min-height: 520px;">
      <div class="lg:col-span-2 flex flex-col min-h-[420px]">
        <SimCodeEditor v-model="code" :active-line-range="activeLineRange" />
      </div>
      <div class="lg:col-span-1 flex flex-col min-h-[420px]">
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
  </div>
</template>
