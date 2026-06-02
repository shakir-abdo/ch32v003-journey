<script setup lang="ts">
import type {RegisterDef} from '~/sim/types'

const {t} = useI18n()

const props = defineProps<{
  registers?: Array<RegisterDef & {value: number; flashedBits?: number[]}>
  /** Name of the register that just changed — gets a glowing border + scrolls into view. */
  highlightedRegister?: string | null
}>()

const list = computed(() => props.registers ?? [])

function bitAt(value: number, i: number): 0 | 1 {
  return ((value >>> i) & 1) as 0 | 1
}
function hex(v: number): string {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0')
}
function isFlashed(r: {flashedBits?: number[]}, i: number) {
  return r.flashedBits?.includes(i) ?? false
}
function isHighlighted(name: string) {
  return props.highlightedRegister === name
}

// Auto-scroll the highlighted register into view inside this panel only.
const scrollRoot = ref<HTMLElement | null>(null)
const regEls = ref<Record<string, HTMLElement | null>>({})

watch(() => props.highlightedRegister, (name) => {
  if (!name || !scrollRoot.value) return
  const el = regEls.value[name]
  if (!el) return
  const root = scrollRoot.value
  const elTop = el.offsetTop - root.offsetTop
  const elBottom = elTop + el.offsetHeight
  const viewTop = root.scrollTop
  const viewBottom = viewTop + root.clientHeight
  if (elTop < viewTop || elBottom > viewBottom) {
    root.scrollTo({top: Math.max(0, elTop - 24), behavior: 'smooth'})
  }
})

function regRef(el: Element | null, name: string) {
  regEls.value[name] = el as HTMLElement | null
}

/** 32 bits arranged as 8 nibbles, MSB→LSB. Each nibble is rendered as a small 4-cell row with a gap between nibbles. */
const NIBBLES = [28, 24, 20, 16, 12, 8, 4, 0] as const
</script>

<template>
  <div class="cy-panel flex flex-col" dir="ltr">
    <div class="px-4 py-2 border-b border-[var(--cy-border)] flex items-center justify-between">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // {{ t('app.sim.registers.label') }} ({{ list.length }})
      </div>
      <div class="font-mono text-[9px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        MSB → LSB · nibble groups
      </div>
    </div>

    <div ref="scrollRoot" class="p-3 overflow-auto max-h-[60vh]">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        <div
          v-for="r in list"
          :key="r.address"
          :ref="(el) => regRef(el as Element | null, r.name)"
          class="border rounded-[2px] p-2 bg-[var(--cy-card-elev)] transition-all duration-300"
          :class="isHighlighted(r.name)
            ? 'border-[var(--cy-warning)] shadow-[0_0_18px_var(--cy-warning)] bg-[var(--cy-warning)]/5'
            : 'border-[var(--cy-border)]'"
        >
          <div class="flex items-center justify-between mb-1.5 font-mono text-[10px] gap-2">
            <span class="text-[var(--cy-fg)] font-bold truncate">{{ r.name }}</span>
            <span class="text-[var(--cy-fg-muted)] tabular-nums shrink-0">{{ hex(r.value) }}</span>
          </div>

          <!-- 32 bits in 8 nibbles with gap between nibbles -->
          <div class="flex gap-1">
            <div
              v-for="(msbOfNibble, ni) in NIBBLES"
              :key="ni"
              class="flex-1 grid grid-cols-4 gap-px"
            >
              <div
                v-for="k in 4"
                :key="k"
                class="aspect-square grid place-items-center font-mono text-[9px] tabular-nums transition-colors duration-[400ms] rounded-[1px]"
                :class="[
                  bitAt(r.value, msbOfNibble - (k - 1)) === 1
                    ? 'bg-[var(--cy-primary)]/25 text-[var(--cy-primary)]'
                    : 'bg-[var(--cy-muted)] text-[var(--cy-fg-muted)]',
                  isFlashed(r, msbOfNibble - (k - 1)) ? 'ring-1 ring-[var(--cy-warning)]' : ''
                ]"
              >
                {{ bitAt(r.value, msbOfNibble - (k - 1)) }}
              </div>
            </div>
          </div>

          <!-- nibble ruler (32, 28, 24, ... 0 at each nibble's MSB) -->
          <div class="flex gap-1 mt-0.5 font-mono text-[8px] text-[var(--cy-fg-muted)] tabular-nums">
            <span v-for="(msb, ni) in NIBBLES" :key="ni" class="flex-1 text-start">{{ msb + 3 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
