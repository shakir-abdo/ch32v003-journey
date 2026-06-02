<script setup lang="ts">
const {t} = useI18n()

const props = defineProps<{
  running?: boolean
  canStep?: boolean
}>()

const emit = defineEmits<{
  run: []
  pause: []
  step: []
  reset: []
}>()

const buttons = computed(() => [
  {key: 'run',   icon: 'i-lucide-play',         label: t('app.sim.ctrl.run'),   color: '#00FF9F', emit: 'run' as const,   disabled: props.running},
  {key: 'pause', icon: 'i-lucide-pause',        label: t('app.sim.ctrl.pause'), color: '#FFB800', emit: 'pause' as const, disabled: !props.running},
  {key: 'step',  icon: 'i-lucide-step-forward', label: t('app.sim.ctrl.step'),  color: '#00F0FF', emit: 'step' as const,  disabled: props.running || props.canStep === false},
  {key: 'reset', icon: 'i-lucide-rotate-ccw',   label: t('app.sim.ctrl.reset'), color: '#FF2E5E', emit: 'reset' as const, disabled: false}
])
</script>

<template>
  <div class="cy-panel px-4 py-3 flex items-center gap-2 flex-wrap" dir="ltr">
    <button
      v-for="b in buttons"
      :key="b.key"
      type="button"
      :disabled="b.disabled"
      class="inline-flex items-center gap-2 px-3 py-1.5 border rounded-[2px] font-mono text-[11px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      :style="{
        color: b.color,
        borderColor: b.color + '55',
        background: b.color + '0E'
      }"
      @click="emit(b.emit)"
    >
      <UIcon :name="b.icon" class="size-3.5" />
      {{ b.label }}
    </button>
    <div class="flex-1" />
    <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
      {{ running ? t('app.sim.ctrl.statusRunning') : t('app.sim.ctrl.statusIdle') }}
    </div>
  </div>
</template>
