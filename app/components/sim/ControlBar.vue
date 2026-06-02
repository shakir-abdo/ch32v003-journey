<script setup lang="ts">
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

const props = defineProps<{
  running?: boolean
  halted?: boolean
  speedMs: number
}>()

const emit = defineEmits<{
  run: []
  pause: []
  step: []
  reset: []
  compile: []
  'update:speedMs': [value: number]
}>()

const speed = computed({
  get: () => props.speedMs,
  set: (v) => emit('update:speedMs', v)
})

/**
 * Run and Pause are mutually exclusive — fold them into one toggle button.
 * The button's role flips based on `running`:
 *   - running=false  →  Play icon + "Run" label, emits 'run'
 *   - running=true   →  Pause icon + "Pause" label, emits 'pause'
 * When halted, the button still shows Play but is disabled (the user has to
 * Reset to start again).
 */
const playPause = computed(() => props.running
  ? {icon: 'i-lucide-pause', label: t('app.sim.ctrl.pause'), color: 'var(--cy-warning)',  emit: 'pause' as const, disabled: false}
  : {icon: 'i-lucide-play',  label: t('app.sim.ctrl.run'),   color: 'var(--cy-success)',  emit: 'run' as const,   disabled: props.halted === true}
)

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
</script>

<template>
  <div class="cy-panel px-4 py-3 flex items-center gap-3 flex-wrap" :dir="isRtl ? 'rtl' : 'ltr'">
    <button
      v-for="b in buttons"
      :key="b.key"
      type="button"
      :disabled="b.disabled"
      class="inline-flex items-center gap-2 px-3 py-1.5 border rounded-[2px] font-mono text-[11px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      :style="btnStyle(b.color)"
      @click="emit(b.emit)"
    >
      <UIcon :name="b.icon" class="size-3.5" />
      {{ b.label }}
    </button>

    <!-- Speed slider — slider keeps LTR internally so the visual mapping (low→high left→right) is universal -->
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
        class="w-32 accent-[var(--cy-primary)] cursor-pointer"
      >
      <span class="font-mono text-[10px] tabular-nums text-[var(--cy-primary)] min-w-[3.5rem] text-end">
        {{ speed }}ms
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
