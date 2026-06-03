<script setup lang="ts">
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

const props = defineProps<{
  running?: boolean
  halted?: boolean
  /** True once the interpreter has been created and stepped at least once — distinguishes "Run" (fresh) from "Resume" (paused). */
  paused?: boolean
  speedMs: number
  tickMultiplier: number
}>()

const emit = defineEmits<{
  run: []
  pause: []
  step: []
  reset: []
  compile: []
  'update:speedMs': [value: number]
  'update:tickMultiplier': [value: number]
}>()

const speed = computed({
  get: () => props.speedMs,
  set: (v) => emit('update:speedMs', v)
})

// Log-scale slider: input 0..6, value = 10^input. So 0→1, 6→1,000,000.
const tickLog = computed({
  get: () => Math.log10(Math.max(1, props.tickMultiplier)),
  set: (v) => emit('update:tickMultiplier', Math.round(Math.pow(10, v)))
})
function fmtTicks(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/**
 * Run / Pause / Resume — three states:
 *   - running=false, paused=false  →  "Run"    (fresh start, green)
 *   - running=true                 →  "Pause"  (amber)
 *   - running=false, paused=true   →  "Resume" (continue from pause, cyan-green)
 * When halted the button still shows Run/Resume but is disabled — the
 * learner has to Reset before starting again.
 */
const playPause = computed(() => {
  if (props.running) {
    return {icon: 'i-lucide-pause', label: t('app.sim.ctrl.pause'), color: 'var(--cy-warning)', emit: 'pause' as const, disabled: false}
  }
  if (props.paused === true) {
    return {icon: 'i-lucide-play', label: t('app.sim.ctrl.resume'), color: 'var(--cy-success)', emit: 'run' as const, disabled: props.halted === true}
  }
  return {icon: 'i-lucide-play', label: t('app.sim.ctrl.run'), color: 'var(--cy-success)', emit: 'run' as const, disabled: props.halted === true}
})

const buttons = computed(() => [
  {key: 'compile',  icon: 'i-lucide-hammer',       label: t('app.sim.ctrl.compile'), color: 'var(--cy-track-pro, #B14AED)', emit: 'compile' as const, disabled: props.running === true},
  {key: 'playpause',icon: playPause.value.icon,    label: playPause.value.label,     color: playPause.value.color,            emit: playPause.value.emit, disabled: playPause.value.disabled},
  {key: 'step',     icon: 'i-lucide-step-forward', label: t('app.sim.ctrl.step'),    color: 'var(--cy-primary)',              emit: 'step' as const,    disabled: props.running === true || props.halted === true},
  {key: 'reset',    icon: 'i-lucide-rotate-ccw',   label: t('app.sim.ctrl.reset'),   color: 'var(--cy-destructive)',          emit: 'reset' as const,   disabled: false}
])

/** Tinted border / background derived from a CSS-variable colour token. */
function btnStyle(color: string) {
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
    background:  `color-mix(in srgb, ${color} 14%, transparent)`
  }
}

/** Icons whose visual direction should mirror in RTL. */
const DIRECTIONAL_ICONS = new Set([
  'i-lucide-play',
  'i-lucide-step-forward',
  'i-lucide-rotate-ccw'
])
function iconClass(name: string): string {
  return isRtl.value && DIRECTIONAL_ICONS.has(name) ? 'scale-x-[-1]' : ''
}
</script>

<template>
  <div class="cy-panel px-4 py-3 flex items-center gap-3 flex-wrap" :dir="isRtl ? 'rtl' : 'ltr'">
    <button
      v-for="b in buttons"
      :key="b.key"
      type="button"
      :disabled="b.disabled"
      class="inline-flex items-center gap-2 px-3 py-1.5 border rounded-[2px] font-mono text-[11px] uppercase tracking-wider transition-all duration-100 enabled:hover:brightness-125 enabled:active:scale-[0.94] enabled:active:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed"
      :style="btnStyle(b.color)"
      @click="emit(b.emit)"
    >
      <UIcon :name="b.icon" class="size-3.5" :class="iconClass(b.icon)" />
      {{ b.label }}
    </button>

    <!-- Step interval (sim pace) and SysTick ticks-per-step (sim→hw time compression).
         Both sliders stay LTR so low→high left→right is universal. -->
    <div class="flex items-center gap-2 ms-2 ps-3 border-s border-[var(--cy-border)]" dir="ltr">
      <span class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        {{ t('app.sim.ctrl.speed') }}
      </span>
      <input
        v-model.number="speed"
        type="range"
        min="100"
        max="2500"
        step="50"
        class="w-24 accent-[var(--cy-primary)] cursor-pointer"
      >
      <span class="font-mono text-[10px] tabular-nums text-[var(--cy-primary)] min-w-[3.25rem] text-end">
        {{ speed }}ms
      </span>
    </div>
    <div class="flex items-center gap-2" dir="ltr" :title="t('app.sim.ctrl.tickRateTitle')">
      <span class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        {{ t('app.sim.ctrl.tickRate') }}
      </span>
      <input
        v-model.number="tickLog"
        type="range"
        min="0"
        max="6"
        step="1"
        class="w-24 accent-[var(--cy-warning)] cursor-pointer"
      >
      <span class="font-mono text-[10px] tabular-nums text-[var(--cy-warning)] min-w-[3.25rem] text-end">
        ×{{ fmtTicks(props.tickMultiplier) }}
      </span>
    </div>

    <div class="flex-1" />
    <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
      {{
        halted ? t('app.sim.ctrl.statusHalted') :
        running ? t('app.sim.ctrl.statusRunning') :
        t('app.sim.ctrl.statusIdle')
      }}
    </div>
  </div>
</template>
