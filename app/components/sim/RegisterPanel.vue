<script setup lang="ts">
import type {RegisterDef} from '~/sim/types'

const {t} = useI18n()

const props = defineProps<{
  registers?: Array<RegisterDef & {value: number; flashedBits?: number[]}>
  /** Name of the register that just changed — gets a glowing border + scrolls into view. */
  highlightedRegister?: string | null
}>()

const list = computed(() => props.registers ?? [])

const grouped = computed(() => {
  const map = new Map<string, typeof list.value>()
  for (const r of list.value) {
    if (!map.has(r.peripheral)) map.set(r.peripheral, [])
    map.get(r.peripheral)!.push(r)
  }
  return [...map.entries()]
})

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
  const elTop = el.offsetTop
  const elBottom = elTop + el.offsetHeight
  const viewTop = root.scrollTop
  const viewBottom = viewTop + root.clientHeight
  if (elTop < viewTop || elBottom > viewBottom) {
    root.scrollTo({top: Math.max(0, elTop - root.clientHeight / 3), behavior: 'smooth'})
  }
})

function regRef(el: Element | null, name: string) {
  regEls.value[name] = el as HTMLElement | null
}
</script>

<template>
  <div class="cy-panel flex flex-col h-full" dir="ltr">
    <div class="px-4 py-2 border-b border-[var(--cy-border)] flex items-center justify-between">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // {{ t('app.sim.registers.label') }}
      </div>
      <div class="font-mono text-[9px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        MSB → LSB
      </div>
    </div>

    <div ref="scrollRoot" class="flex-1 overflow-y-auto p-3 space-y-4">
      <section v-for="[peri, regs] in grouped" :key="peri">
        <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-primary)] mb-2 flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-[var(--cy-primary)] shadow-[0_0_4px_var(--cy-primary)]" />
          {{ peri }}
        </div>
        <div class="space-y-2">
          <div
            v-for="r in regs"
            :key="r.address"
            :ref="(el) => regRef(el as Element | null, r.name)"
            class="border rounded-[2px] p-2 bg-[var(--cy-card-elev)] transition-all duration-300"
            :class="isHighlighted(r.name)
              ? 'border-[var(--cy-warning)] shadow-[0_0_18px_var(--cy-warning)] bg-[var(--cy-warning)]/5'
              : 'border-[var(--cy-border)]'"
          >
            <div class="flex items-center justify-between mb-1.5 font-mono text-[10px]">
              <span class="text-[var(--cy-fg)] font-bold">{{ r.name }}</span>
              <span class="text-[var(--cy-fg-muted)] tabular-nums">{{ hex(r.value) }}</span>
            </div>
            <!-- 32 bit cells -->
            <div class="grid grid-cols-[repeat(32,minmax(0,1fr))] gap-px">
              <div
                v-for="i in 32"
                :key="i"
                class="aspect-square grid place-items-center font-mono text-[9px] tabular-nums transition-colors duration-[400ms]"
                :class="[
                  bitAt(r.value, 32 - i) === 1
                    ? 'bg-[var(--cy-primary)]/20 text-[var(--cy-primary)]'
                    : 'bg-[var(--cy-muted)] text-[var(--cy-fg-muted)]',
                  isFlashed(r, 32 - i) ? 'ring-1 ring-[var(--cy-warning)]' : ''
                ]"
              >
                {{ bitAt(r.value, 32 - i) }}
              </div>
            </div>
            <!-- bit-index ruler every 4 bits -->
            <div class="grid grid-cols-[repeat(8,minmax(0,1fr))] mt-0.5 font-mono text-[8px] text-[var(--cy-fg-muted)] tabular-nums">
              <span v-for="g in 8" :key="g" class="text-center">{{ (32 - g * 4) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
