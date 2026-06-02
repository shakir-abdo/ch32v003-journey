<script setup lang="ts">
/**
 * Debug widget — writes a raw value to a chosen register. Lives only
 * until Phase 3 lands the parser, at which point real C-like code
 * supersedes this. Useful right now to verify the engine's behaviour
 * (clock-gated GPIO, BSHR/BCR semantics, RDY handshake) before we
 * commit to the parser layer.
 */
import {REGISTERS} from '~/sim/registers'

const {t} = useI18n()

const emit = defineEmits<{
  write: [address: number, value: number]
}>()

const regName = ref('RCC_APB2PCENR')
const valueText = ref('0x10')

const options = REGISTERS.map((r) => ({
  name: r.name,
  address: r.address
}))

const selected = computed(() => options.find((o) => o.name === regName.value))

function parseValue(s: string): number | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed, 16) >>> 0
  if (/^0b[01]+$/i.test(trimmed)) return parseInt(trimmed.slice(2), 2) >>> 0
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) >>> 0
  return null
}

const parsed = computed(() => parseValue(valueText.value))

function submit() {
  if (!selected.value || parsed.value === null) return
  emit('write', selected.value.address, parsed.value)
}
</script>

<template>
  <div class="cy-panel p-4" dir="ltr">
    <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-3">
      // {{ t('app.sim.debug.label') }}
    </div>
    <div class="flex flex-wrap items-center gap-2 font-mono text-[11px]">
      <select
        v-model="regName"
        class="bg-[var(--cy-muted)] border border-[var(--cy-border)] text-[var(--cy-fg)] px-2 py-1 rounded-[2px] focus:outline-none focus:border-[var(--cy-border-strong)]"
      >
        <option v-for="o in options" :key="o.address" :value="o.name">
          {{ o.name }} ({{ '0x' + o.address.toString(16).toUpperCase() }})
        </option>
      </select>
      <span class="text-[var(--cy-fg-muted)]">=</span>
      <input
        v-model="valueText"
        type="text"
        spellcheck="false"
        :placeholder="t('app.sim.debug.valuePlaceholder')"
        class="bg-[var(--cy-muted)] border border-[var(--cy-border)] text-[var(--cy-fg)] px-2 py-1 rounded-[2px] focus:outline-none focus:border-[var(--cy-border-strong)] w-32 placeholder:text-[var(--cy-fg-muted)]"
        @keydown.enter="submit"
      >
      <button
        type="button"
        :disabled="parsed === null"
        class="cy-btn disabled:opacity-40 disabled:cursor-not-allowed"
        @click="submit"
      >
        <UIcon name="i-lucide-zap" class="size-3" />
        {{ t('app.sim.debug.write') }}
      </button>
      <span class="text-[var(--cy-fg-muted)] text-[10px]" :class="parsed === null ? 'text-[var(--cy-destructive)]' : ''">
        {{ parsed === null ? t('app.sim.debug.invalid') : '0x' + parsed.toString(16).toUpperCase().padStart(8, '0') }}
      </span>
    </div>
  </div>
</template>
