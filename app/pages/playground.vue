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

const {
  registers, pins, consoleEntries, activeLineRange,
  running, halted, speedMs, lastChangedRegister,
  compile, step, run, pause, reset, clearConsole, manualWrite
} = useSimulator()

const code = ref(`// مثال: تشغيل ساعة GPIOC ثم رفع PC1 (Pin 5 على J4M6).
// اضغط "خطوة" لتنفيذ سطر-بسطر، أو "تشغيل" لتنفيذ تلقائي بطيء.

#define RCC_BASE        0x40021000
#define RCC_APB2PCENR   (*(volatile unsigned int*)(RCC_BASE + 0x18))

#define GPIOC_BASE      0x40011000
#define GPIOC_CFGLR     (*(volatile unsigned int*)(GPIOC_BASE + 0x00))
#define GPIOC_BSHR      (*(volatile unsigned int*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile unsigned int*)(GPIOC_BASE + 0x14))

int main() {
  RCC_APB2PCENR |= (1 << 4);          // GPIOC clock on
  GPIOC_CFGLR   &= ~(0xF << (4*1));   // clear PC1 config
  GPIOC_CFGLR   |=  (0x3 << (4*1));   // PC1 = push-pull output 50MHz

  GPIOC_BSHR = (1 << 1);              // PC1 HIGH
  GPIOC_BCR  = (1 << 1);              // PC1 LOW
}
`)

function onRun()   { run(code.value) }
function onPause() { pause() }
function onStep()  { step(code.value) }
function onReset() { reset() }
function onCompile() { compile(code.value) }

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
        v-model:speed-ms="speedMs"
        :running="running"
        :halted="halted"
        @run="onRun"
        @pause="onPause"
        @step="onStep"
        @reset="onReset"
        @compile="onCompile"
      />
    </div>

    <!-- Three-pane layout -->
    <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 mb-4" style="min-height: 580px;">
      <div class="min-h-[420px] flex flex-col">
        <SimCodeEditor v-model="code" :active-line-range="activeLineRange" />
      </div>
      <div>
        <SimChipDiagram :pins="pins" />
      </div>
      <div class="min-h-[420px]">
        <SimRegisterPanel :registers="registers" :highlighted-register="lastChangedRegister" />
      </div>
    </div>

    <!-- Manual-write debug widget (kept for spot-checks during dev) -->
    <details class="mb-4">
      <summary class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] cursor-pointer mb-2">
        // {{ t('app.sim.debug.toggle') }}
      </summary>
      <SimManualWrite @write="onManualWrite" />
    </details>

    <!-- Console -->
    <div class="h-48">
      <SimConsole :entries="consoleEntries" @clear="clearConsole" />
    </div>
  </div>
</template>
