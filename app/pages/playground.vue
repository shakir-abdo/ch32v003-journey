<script setup lang="ts">
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'المختبر · CH32V003 Journey'
    : 'Playground · CH32V003 Journey',
  description: () => locale.value === 'ar'
    ? 'محاكي بصري لسجلات CH32V003J4M6 — اكتب الكود وراقب البتات وحالات الـ pins تتغيّر سطراً بسطر.'
    : 'Visual CH32V003J4M6 register simulator — write code and watch bits and pin states change line by line.'
})

// stub state for Phase 1 — interpreter wires in next phase
const code = ref(`// ${'مثال أوّلي — RCC + GPIOC'.padEnd(40)}\n// blink PC1 (J4M6 pin 5)\n\nRCC_APB2PCENR |= (1 << 4);       // GPIOC clock on\nGPIOC_CFGLR &= ~(0xF << (4*1));  // clear PC1\nGPIOC_CFGLR |=  (0x3 << (4*1));  // PC1 PP output 50MHz\n\nwhile (1) {\n  GPIOC_BSHR = (1 << 1);         // set PC1 HIGH\n  Delay_Ms(500);\n  GPIOC_BCR  = (1 << 1);         // set PC1 LOW\n  Delay_Ms(500);\n}\n`)

const running = ref(false)
const consoleEntries = ref<Array<{level: 'info'|'warn'|'error'; msg: string}>>([
  {level: 'info', msg: 'Simulator ready. Phase 1 — UI scaffold only. Engine arrives in Phase 2.'}
])

function onRun()   { running.value = true;  consoleEntries.value.push({level: 'info', msg: 'Run requested (no-op in Phase 1)'})}
function onPause() { running.value = false; consoleEntries.value.push({level: 'info', msg: 'Pause requested (no-op in Phase 1)'})}
function onStep()  { consoleEntries.value.push({level: 'info', msg: 'Step requested (no-op in Phase 1)'}) }
function onReset() {
  running.value = false
  consoleEntries.value = [{level: 'info', msg: 'State reset (no-op in Phase 1)'}]
}
</script>

<template>
  <div class="max-w-[1500px] mx-auto px-4 sm:px-6 py-8" :dir="isRtl ? 'rtl' : 'ltr'">
    <!-- Header -->
    <header class="mb-6 pb-4 border-b border-[var(--cy-border)]">
      <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-2" dir="ltr">
        // ROUTE: /playground · {{ t('app.sim.experimental') }}
      </div>
      <h1 class="font-display text-3xl sm:text-4xl font-bold uppercase text-[var(--cy-fg)] mb-2">
        {{ t('app.sim.title') }}
      </h1>
      <p class="text-[var(--cy-fg-muted)] max-w-3xl">
        {{ t('app.sim.subtitle') }}
      </p>
    </header>

    <!-- Control bar -->
    <div class="mb-4">
      <SimControlBar
        :running="running"
        @run="onRun"
        @pause="onPause"
        @step="onStep"
        @reset="onReset"
      />
    </div>

    <!-- Three-pane layout -->
    <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 mb-4" style="min-height: 560px;">
      <!-- editor (left in LTR, right in RTL but content stays LTR) -->
      <div class="min-h-[420px]">
        <SimCodeEditor v-model="code" />
      </div>

      <!-- chip (centre) -->
      <div>
        <SimChipDiagram />
      </div>

      <!-- registers -->
      <div class="min-h-[420px]">
        <SimRegisterPanel />
      </div>
    </div>

    <!-- console -->
    <div class="h-40">
      <SimConsole :entries="consoleEntries" />
    </div>
  </div>
</template>
