<script setup lang="ts">
import type {PinDef, PinStatus} from '~/sim/types'

const {t} = useI18n()

const props = defineProps<{
  pins?: PinDef[]
}>()

const defaultPins: PinDef[] = [
  {num: 1, net: 'PD6', port: 'D', bit: 6, altLabel: 'TX',   status: 'HI-Z'},
  {num: 2, net: 'GND', status: 'GND'},
  {num: 3, net: 'PA2', port: 'A', bit: 2,                    status: 'HI-Z'},
  {num: 4, net: 'VCC', status: 'VCC'},
  {num: 5, net: 'PC1', port: 'C', bit: 1, altLabel: 'SDA',  status: 'HI-Z'},
  {num: 6, net: 'PC2', port: 'C', bit: 2, altLabel: 'SCL',  status: 'HI-Z'},
  {num: 7, net: 'PC4', port: 'C', bit: 4, altLabel: 'ADC2', status: 'HI-Z'},
  {num: 8, net: 'PD4', port: 'D', bit: 4, altLabel: 'SWIO', status: 'HI-Z'}
]

const pinList = computed<PinDef[]>(() => props.pins ?? defaultPins)
const leftPins  = computed(() => pinList.value.filter((p) => p.num <= 4))
const rightPins = computed(() => [...pinList.value.filter((p) => p.num >= 5)].reverse()) // pin 8 at top

const statusStyle: Record<PinStatus, {color: string; label: string}> = {
  'VCC':       {color: '#FF2E5E', label: 'VCC'},
  'GND':       {color: '#7A7A95', label: 'GND'},
  'HIGH':      {color: '#00FF9F', label: 'HIGH'},
  'LOW':       {color: '#3A3A4A', label: 'LOW'},
  'INPUT':     {color: '#00F0FF', label: 'INPUT'},
  'INPUT-PU':  {color: '#00F0FF', label: 'IN ↑PU'},
  'INPUT-PD':  {color: '#00F0FF', label: 'IN ↓PD'},
  'AF':        {color: '#B14AED', label: 'AF'},
  'ADC':       {color: '#FFB800', label: 'ADC'},
  'HI-Z':      {color: '#3A3A4A', label: 'HI-Z'}
}

function styleOf(s: PinStatus) {
  return statusStyle[s] ?? statusStyle['HI-Z']
}
</script>

<template>
  <div class="cy-panel p-6 flex flex-col h-full" dir="ltr">
    <!-- header -->
    <div class="flex items-center justify-between mb-6">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // CH32V003J4M6 — SOP-8
      </div>
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-primary)]">
        [{{ t('app.sim.chip.pinsLabel') }}]
      </div>
    </div>

    <!-- chip body + pin rows — flex-1 so the diagram vertically centers when the panel grows -->
    <div class="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <!-- left pin column (pins 1-4) -->
      <div class="flex flex-col gap-3">
        <div
          v-for="p in leftPins"
          :key="p.num"
          class="flex items-center justify-end gap-2"
        >
          <div class="text-end">
            <div class="font-mono text-xs font-bold text-[var(--cy-fg)] leading-tight">
              {{ p.altLabel ? `${p.altLabel} · ${p.net}` : p.net }}
            </div>
            <div
              class="font-mono text-[9px] tracking-wider mt-0.5 px-1.5 py-0.5 rounded-[2px] inline-block border"
              :style="{
                color: styleOf(p.status).color,
                borderColor: styleOf(p.status).color + '55',
                background: styleOf(p.status).color + '14'
              }"
            >
              {{ styleOf(p.status).label }}
            </div>
          </div>
          <!-- pin lead + number -->
          <div class="flex items-center">
            <div class="font-mono text-[10px] text-[var(--cy-fg-muted)] me-1 tabular-nums">{{ p.num }}</div>
            <div class="w-4 h-2 bg-[var(--cy-fg-muted)]/40 rounded-r-sm" />
          </div>
        </div>
      </div>

      <!-- chip body -->
      <div
        class="relative w-32 sm:w-40 h-56 sm:h-64 rounded-md border-2 grid place-items-center"
        :style="{
          background: 'linear-gradient(135deg, #0E0E18 0%, #1A1A28 100%)',
          borderColor: 'var(--cy-border-strong)'
        }"
      >
        <!-- pin-1 dot indicator -->
        <div
          class="absolute top-2 left-2 size-2 rounded-full"
          :style="{background: 'var(--cy-primary)', boxShadow: '0 0 6px var(--cy-primary)'}"
        />
        <div class="text-center font-mono">
          <div class="text-[var(--cy-primary)] text-sm font-bold tracking-wider">CH32V003</div>
          <div class="text-[var(--cy-fg)] text-xs mt-1">J4M6</div>
          <div class="text-[var(--cy-fg-muted)] text-[10px] mt-3">WCH</div>
        </div>
      </div>

      <!-- right pin column (pins 8 → 5, top-to-bottom) -->
      <div class="flex flex-col gap-3">
        <div
          v-for="p in rightPins"
          :key="p.num"
          class="flex items-center justify-start gap-2"
        >
          <!-- pin lead + number -->
          <div class="flex items-center">
            <div class="w-4 h-2 bg-[var(--cy-fg-muted)]/40 rounded-l-sm" />
            <div class="font-mono text-[10px] text-[var(--cy-fg-muted)] ms-1 tabular-nums">{{ p.num }}</div>
          </div>
          <div class="text-start">
            <div class="font-mono text-xs font-bold text-[var(--cy-fg)] leading-tight">
              {{ p.altLabel ? `${p.net} · ${p.altLabel}` : p.net }}
            </div>
            <div
              class="font-mono text-[9px] tracking-wider mt-0.5 px-1.5 py-0.5 rounded-[2px] inline-block border"
              :style="{
                color: styleOf(p.status).color,
                borderColor: styleOf(p.status).color + '55',
                background: styleOf(p.status).color + '14'
              }"
            >
              {{ styleOf(p.status).label }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- legend -->
    <div class="mt-6 pt-4 border-t border-[var(--cy-border)]">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-2">
        // {{ t('app.sim.chip.legend') }}
      </div>
      <div class="flex flex-wrap gap-2 font-mono text-[9px]">
        <span v-for="s in (['HIGH','LOW','INPUT','AF','ADC','HI-Z'] as PinStatus[])" :key="s"
          class="px-1.5 py-0.5 border rounded-[2px]"
          :style="{
            color: styleOf(s).color,
            borderColor: styleOf(s).color + '55',
            background: styleOf(s).color + '14'
          }"
        >{{ styleOf(s).label }}</span>
      </div>
    </div>
  </div>
</template>
