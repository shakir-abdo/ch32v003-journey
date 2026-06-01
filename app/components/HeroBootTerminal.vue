<script setup lang="ts">
/**
 * Cyberpunk boot-sequence terminal — types CH32V003 init logs character by
 * character. Designed to feel like watching a real firmware come up.
 *
 * Respects prefers-reduced-motion: shows the final state instantly with no
 * typing animation when the user has motion reduced.
 */

interface Line {
  text: string
  cls?: string         // optional tailwind class for line color
  delay?: number       // ms to pause AFTER this line finishes
}

const lines: Line[] = [
  {text: '$ minichlink -w blink.bin flash -b',                       cls: 'text-[var(--cy-fg-muted)]'},
  {text: '[wch-linke] connecting to target...',                       cls: 'text-[var(--cy-fg-muted)]'},
  {text: '[wch-linke] CH32V003J4M6 detected · sig 0x003005x4',        cls: 'text-[var(--cy-success)]', delay: 220},
  {text: '[flash]     erasing 0x00000000..0x00000200 ............ ok', cls: 'text-[var(--cy-fg-muted)]'},
  {text: '[flash]     writing 460 bytes .................. ok',        cls: 'text-[var(--cy-fg-muted)]'},
  {text: '[wch-linke] reset → core',                                  cls: 'text-[var(--cy-fg-muted)]', delay: 250},
  {text: '',                                                          cls: ''},
  {text: '──── ch32v003fun boot ────────────────────────────',         cls: 'text-[var(--cy-primary)]'},
  {text: 'SystemInit()                                       OK',      cls: 'text-[var(--cy-success)]'},
  {text: 'RCC->CTLR |= HSION; while(!HSIRDY);                OK',      cls: 'text-[var(--cy-success)]'},
  {text: 'RCC->CFGR0 &= ~PLLSRC; RCC->CTLR |= PLLON;         OK',      cls: 'text-[var(--cy-success)]'},
  {text: 'FLASH->ACTLR = LATENCY_1   (sysclk → 48 MHz)        OK',     cls: 'text-[var(--cy-success)]'},
  {text: 'RCC->APB2PCENR |= IOPCEN                            OK',     cls: 'text-[var(--cy-success)]'},
  {text: 'GPIOC->CFGLR  &= ~(0xF << 4);  |= (0x3 << 4)        OK',     cls: 'text-[var(--cy-success)]', delay: 350},
  {text: '',                                                          cls: ''},
  {text: 'mission: blink PC1, no HAL, register-level',                 cls: 'text-[var(--cy-warning)]'},
  {text: 'status:  READY',                                            cls: 'text-[var(--cy-primary)] font-bold'}
]

const printed = ref<Line[]>([])
const currentText = ref('')
const currentCls = ref('')
const done = ref(false)
const showCursor = ref(true)

// Reduced motion: skip the animation entirely.
const prefersReducedMotion = computed(() => {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
})

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let typingAbort = false
async function play() {
  if (prefersReducedMotion.value) {
    printed.value = lines
    done.value = true
    return
  }
  // Slight initial pause so the user notices it start
  await sleep(300)
  for (const ln of lines) {
    if (typingAbort) return
    currentCls.value = ln.cls ?? ''
    if (ln.text === '') {
      printed.value = [...printed.value, ln]
      await sleep(120)
      continue
    }
    for (let i = 0; i <= ln.text.length; i++) {
      if (typingAbort) return
      currentText.value = ln.text.slice(0, i)
      // Type slower on punctuation/space to mimic real shells
      const ch = ln.text[i - 1]
      await sleep(ch === ' ' ? 8 : 12 + Math.random() * 16)
    }
    printed.value = [...printed.value, {...ln, text: currentText.value}]
    currentText.value = ''
    await sleep(ln.delay ?? 90)
  }
  done.value = true
}

// Blinking cursor (always visible, animated via timer rather than CSS so it
// survives HMR cleanly).
let cursorTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  cursorTimer = setInterval(() => {
    showCursor.value = !showCursor.value
  }, 480)
  play()
})
onUnmounted(() => {
  typingAbort = true
  if (cursorTimer) clearInterval(cursorTimer)
})
</script>

<template>
  <div
    class="cy-panel font-mono text-[11.5px] sm:text-[12.5px] leading-[1.7] p-4 sm:p-5 text-start overflow-hidden"
    dir="ltr"
    role="img"
    aria-label="Boot sequence terminal"
  >
    <!-- terminal chrome -->
    <div class="flex items-center justify-between mb-3 pb-2 border-b border-[var(--cy-border)]">
      <div class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full bg-[#FF5F56]" />
        <span class="size-2.5 rounded-full bg-[#FFBD2E]" />
        <span class="size-2.5 rounded-full bg-[#27C93F]" />
      </div>
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // boot.log · ch32v003j4m6
      </div>
      <div class="font-mono text-[10px] tabular-nums text-[var(--cy-fg-muted)]">
        <span :class="done ? 'text-[var(--cy-success)]' : 'text-[var(--cy-warning)]'">●</span>
        {{ done ? 'READY' : 'BOOT' }}
      </div>
    </div>

    <!-- log lines -->
    <div class="min-h-[260px] sm:min-h-[300px]">
      <div v-for="(l, i) in printed" :key="i" :class="['whitespace-pre', l.cls]">
        {{ l.text || ' ' }}
      </div>
      <div v-if="!done" :class="['whitespace-pre', currentCls]">{{ currentText
        }}<span v-if="showCursor" class="text-[var(--cy-primary)]">▌</span></div>
      <div v-else class="text-[var(--cy-fg-muted)]">
        <span class="text-[var(--cy-primary)]">▌</span>
      </div>
    </div>
  </div>
</template>
