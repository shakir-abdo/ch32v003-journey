<script setup lang="ts">
const {t} = useI18n()

interface LogEntry {
  level: 'info' | 'warn' | 'error'
  msg: string
  ts?: number
}

defineProps<{
  entries?: LogEntry[]
}>()

const emit = defineEmits<{clear: []}>()

// Use CSS variables instead of fixed hex so the colors track the active theme.
const levelColor: Record<LogEntry['level'], string> = {
  info:  'var(--cy-fg-muted)',
  warn:  'var(--cy-warning)',
  error: 'var(--cy-destructive)'
}
</script>

<template>
  <div class="cy-panel flex flex-col h-full" dir="ltr">
    <div class="px-4 py-2 border-b border-[var(--cy-border)] flex items-center justify-between">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // {{ t('app.sim.console.label') }}
      </div>
      <button
        v-if="entries && entries.length"
        type="button"
        class="font-mono text-[9px] uppercase tracking-wider text-[var(--cy-fg-muted)] hover:text-[var(--cy-primary)] transition-colors"
        @click="emit('clear')"
      >
        {{ t('app.sim.console.clear') }}
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1">
      <div v-if="!entries || !entries.length" class="text-[var(--cy-fg-muted)] italic">
        {{ t('app.sim.console.empty') }}
      </div>
      <div
        v-for="(e, i) in entries"
        :key="i"
        :style="{color: levelColor[e.level]}"
      >
        <span class="text-[var(--cy-fg-muted)]">[{{ e.level }}]</span> {{ e.msg }}
      </div>
    </div>
  </div>
</template>
