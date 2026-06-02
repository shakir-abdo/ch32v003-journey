<script setup lang="ts">
const {t} = useI18n()

const props = defineProps<{
  modelValue: string
  /** 1-indexed [start, end] line range the interpreter is currently executing. */
  activeLineRange?: [number, number] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const code = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const lines = computed(() => props.modelValue.split('\n'))
const lineCount = computed(() => lines.value.length)

function isActive(n: number): boolean {
  const r = props.activeLineRange
  if (!r) return false
  return n >= r[0] && n <= r[1]
}

const editorRef = ref<HTMLTextAreaElement | null>(null)
const gutterRef = ref<HTMLDivElement | null>(null)

function onScroll(e: Event) {
  const el = e.target as HTMLTextAreaElement
  if (gutterRef.value) gutterRef.value.scrollTop = el.scrollTop
}

// Auto-scroll the textarea to the active line whenever it changes.
watch(() => props.activeLineRange, (r) => {
  if (!r || !editorRef.value) return
  const lineH = 21 // matches `leading-relaxed` + 12px font ≈ 21px
  const top = (r[0] - 1) * lineH
  // Only scroll if the active line is outside the viewport.
  const el = editorRef.value
  if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - lineH * 2) {
    el.scrollTop = Math.max(0, top - el.clientHeight / 3)
  }
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

    <div class="flex-1 grid grid-cols-[auto_1fr] min-h-0 overflow-hidden">
      <!-- Gutter with line numbers + active-line highlight -->
      <div
        ref="gutterRef"
        class="overflow-hidden border-r border-[var(--cy-border)] bg-[var(--cy-shell)] py-2 select-none"
      >
        <div
          v-for="n in lineCount"
          :key="n"
          class="px-3 font-mono text-[11px] leading-relaxed tabular-nums text-end transition-colors"
          :class="[
            isActive(n)
              ? 'text-[var(--cy-primary)] bg-[var(--cy-primary)]/10 font-bold'
              : 'text-[var(--cy-fg-muted)]'
          ]"
        >
          {{ n }}
        </div>
      </div>

      <textarea
        ref="editorRef"
        v-model="code"
        spellcheck="false"
        :placeholder="t('app.sim.editor.placeholder')"
        class="block w-full h-full p-2 bg-transparent font-mono text-[12px] leading-relaxed text-[var(--cy-fg)] resize-none focus:outline-none placeholder:text-[var(--cy-fg-muted)] overflow-auto"
        @scroll="onScroll"
      />
    </div>
  </div>
</template>
