<script setup lang="ts">
const {t} = useI18n()

const props = defineProps<{
  modelValue: string
  currentLine?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const code = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})
</script>

<template>
  <div class="cy-panel flex flex-col h-full" dir="ltr">
    <div class="px-4 py-2 border-b border-[var(--cy-border)] flex items-center justify-between">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // {{ t('app.sim.editor.label') }}
      </div>
      <div class="font-mono text-[9px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        {{ t('app.sim.editor.hint') }}
      </div>
    </div>
    <textarea
      v-model="code"
      spellcheck="false"
      class="flex-1 w-full p-4 bg-transparent font-mono text-[12px] leading-relaxed text-[var(--cy-fg)] resize-none focus:outline-none placeholder:text-[var(--cy-fg-muted)]"
      :placeholder="t('app.sim.editor.placeholder')"
    />
  </div>
</template>
