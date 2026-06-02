<script setup lang="ts">
import {PRESETS} from '~/sim/presets'

const {t, locale} = useI18n()

const emit = defineEmits<{
  load: [id: string]
}>()

const selectedId = ref<string>('')

function onPick(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (!v) return
  emit('load', v)
  selectedId.value = '' // reset so picking the same one again still fires
}
</script>

<template>
  <div class="cy-panel px-4 py-3" dir="ltr">
    <div class="flex items-center gap-3 flex-wrap">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-primary)]">
        // {{ t('app.sim.presets.label') }}
      </div>
      <select
        :value="selectedId"
        class="bg-[var(--cy-muted)] border border-[var(--cy-border)] text-[var(--cy-fg)] px-2 py-1 rounded-[2px] font-mono text-[11px] focus:outline-none focus:border-[var(--cy-border-strong)]"
        @change="onPick"
      >
        <option value="" disabled>{{ t('app.sim.presets.placeholder') }}</option>
        <option v-for="p in PRESETS" :key="p.id" :value="p.id">
          {{ (p.title as any)[locale] ?? p.title.en }}
        </option>
      </select>
      <span class="font-mono text-[10px] text-[var(--cy-fg-muted)]">
        {{ t('app.sim.presets.hint') }}
      </span>
    </div>
  </div>
</template>
