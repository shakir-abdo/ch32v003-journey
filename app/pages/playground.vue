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

const {registers, pins, consoleEntries, manualWrite, reset, clearConsole} = useSimulator()

const code = ref(`// مثال أوّلي — RCC + GPIOC
// blink PC1 (J4M6 pin 5). الـ parser لم يصل بعد — استخدم زر "كتابة يدوية" أسفل لتجربة الـ engine.

RCC_APB2PCENR |= (1 << 4);       // GPIOC clock on
GPIOC_CFGLR &= ~(0xF << (4*1));  // clear PC1
GPIOC_CFGLR |=  (0x3 << (4*1));  // PC1 PP output 50MHz

while (1) {
  GPIOC_BSHR = (1 << 1);         // PC1 HIGH
  Delay_Ms(500);
  GPIOC_BCR  = (1 << 1);         // PC1 LOW
  Delay_Ms(500);
}
`)

const running = ref(false)

function onRun()   { running.value = true;  consoleEntries.value.push({level: 'info', msg: 'Run requested (parser arrives in Phase 3)'}) }
function onPause() { running.value = false }
function onStep()  { consoleEntries.value.push({level: 'info', msg: 'Step requested (parser arrives in Phase 3)'}) }
function onReset() {
  running.value = false
  reset()
}

function onManualWrite(address: number, value: number) {
  manualWrite(address, value)
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

    <!-- Manual-write debug widget (Phase 2 only — replaced by parser in Phase 3) -->
    <div class="mb-4">
      <SimManualWrite @write="onManualWrite" />
    </div>

    <!-- Three-pane layout -->
    <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 mb-4" style="min-height: 560px;">
      <div class="min-h-[420px]">
        <SimCodeEditor v-model="code" />
      </div>
      <div>
        <SimChipDiagram :pins="pins" />
      </div>
      <div class="min-h-[420px]">
        <SimRegisterPanel :registers="registers" />
      </div>
    </div>

    <!-- Console -->
    <div class="h-48">
      <SimConsole :entries="consoleEntries" @clear="clearConsole" />
    </div>
  </div>
</template>
