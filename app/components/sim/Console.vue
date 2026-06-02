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

const levelColor: Record<LogEntry['level'], string> = {
  info: '#7A7A95',
  warn: '#FFB800',
  error: '#FF2E5E'
}
</script>

<template>
  <div class="cy-panel flex flex-col h-full" dir="ltr">
    <div class="px-4 py-2 border-b border-[var(--cy-border)]">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // {{ t('app.sim.console.label') }}
      </div>
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
