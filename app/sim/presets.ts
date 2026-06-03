/**
 * Preset code snippets for the playground.
 *
 * Each preset is a small, self-contained C-like program that exercises a
 * specific concept covered in one of the lessons. The `lessonSlug` field
 * lets lesson pages render a "Try this in the playground" button that
 * deep-links to /playground?example=<id>.
 */

export interface Preset {
  id: string
  /** Lesson slug this preset accompanies, if any. */
  lessonSlug?: string
  title: {ar: string; en: string}
  description: {ar: string; en: string}
  code: string
}

const COMMON_DEFINES = `// ─── Register definitions ────────────────────────────────────────────
#define RCC_BASE        0x40021000
#define RCC_CTLR        (*(volatile unsigned int*)(RCC_BASE + 0x00))
#define RCC_CFGR0       (*(volatile unsigned int*)(RCC_BASE + 0x04))
#define RCC_APB2PCENR   (*(volatile unsigned int*)(RCC_BASE + 0x18))
#define RCC_RSTSCKR     (*(volatile unsigned int*)(RCC_BASE + 0x24))

#define GPIOA_BASE      0x40010800
#define GPIOA_CFGLR     (*(volatile unsigned int*)(GPIOA_BASE + 0x00))
#define GPIOA_OUTDR     (*(volatile unsigned int*)(GPIOA_BASE + 0x0C))
#define GPIOA_BSHR      (*(volatile unsigned int*)(GPIOA_BASE + 0x10))
#define GPIOA_BCR       (*(volatile unsigned int*)(GPIOA_BASE + 0x14))

#define GPIOC_BASE      0x40011000
#define GPIOC_CFGLR     (*(volatile unsigned int*)(GPIOC_BASE + 0x00))
#define GPIOC_OUTDR     (*(volatile unsigned int*)(GPIOC_BASE + 0x0C))
#define GPIOC_BSHR      (*(volatile unsigned int*)(GPIOC_BASE + 0x10))
#define GPIOC_BCR       (*(volatile unsigned int*)(GPIOC_BASE + 0x14))

#define GPIOD_BASE      0x40011400
#define GPIOD_CFGLR     (*(volatile unsigned int*)(GPIOD_BASE + 0x00))
#define GPIOD_OUTDR     (*(volatile unsigned int*)(GPIOD_BASE + 0x0C))
#define GPIOD_BSHR      (*(volatile unsigned int*)(GPIOD_BASE + 0x10))
#define GPIOD_BCR       (*(volatile unsigned int*)(GPIOD_BASE + 0x14))

#define STK_BASE        0xE000F000
#define STK_CTLR        (*(volatile unsigned int*)(STK_BASE + 0x00))
#define STK_SR          (*(volatile unsigned int*)(STK_BASE + 0x04))
#define STK_CNTL        (*(volatile unsigned int*)(STK_BASE + 0x08))
#define STK_CMPLR       (*(volatile unsigned int*)(STK_BASE + 0x10))
`

export const PRESETS: Preset[] = [
  {
    id: 'blink-pc1',
    lessonSlug: 'l03-gpio-output',
    title:       {ar: 'وميض PC1', en: 'Blink PC1'},
    description: {ar: 'أبسط مثال — تشغيل ساعة GPIOC، تهيئة PC1 كخرج، ثم Toggle.', en: 'Simplest example — enable GPIOC clock, configure PC1 as output, toggle.'},
    code: `${COMMON_DEFINES}
int main() {
  // 1) clock-gate GPIOC on (APB2PCENR bit 4)
  RCC_APB2PCENR |= (1 << 4);

  // 2) configure PC1 as push-pull output, 50 MHz
  //    each pin uses 4 bits in CFGLR. PC1 lives at bits [7:4].
  GPIOC_CFGLR &= ~(0xF << (4 * 1));
  GPIOC_CFGLR |=  (0x3 << (4 * 1));   // MODE=11, CNF=00

  // 3) toggle PC1 forever
  while (1) {
    GPIOC_BSHR = (1 << 1);   // PC1 HIGH (atomic set)
    Delay_Ms(500);
    GPIOC_BCR  = (1 << 1);   // PC1 LOW  (atomic clear)
    Delay_Ms(500);
  }
}
`
  },

  {
    id: 'blink-pc4',
    lessonSlug: 'l03-gpio-output',
    title:       {ar: 'وميض PC4', en: 'Blink PC4'},
    description: {ar: 'نفس فكرة وميض PC1 لكن على pin 7 (PC4) — تدريب على حساب موضع البت.', en: 'Same as the PC1 example but on pin 7 (PC4) — practice computing the bit position.'},
    code: `${COMMON_DEFINES}
int main() {
  RCC_APB2PCENR |= (1 << 4);             // GPIOC clock on

  // PC4 occupies bits [19:16] in CFGLR (4 * 4 = 16)
  GPIOC_CFGLR &= ~(0xF << (4 * 4));
  GPIOC_CFGLR |=  (0x3 << (4 * 4));      // PP output, 50 MHz

  while (1) {
    GPIOC_BSHR = (1 << 4);   // PC4 HIGH
    Delay_Ms(500);
    GPIOC_BCR  = (1 << 4);   // PC4 LOW
    Delay_Ms(500);
  }
}
`
  },

  {
    id: 'multi-port-enable',
    lessonSlug: 'l02-registers-intro',
    title:       {ar: 'تشغيل عدّة منافذ', en: 'Enable multiple ports'},
    description: {ar: 'تشغيل ساعات GPIOA + GPIOC + GPIOD معاً، ثم تهيئة PD6 كخرج.', en: 'Turn on GPIOA + GPIOC + GPIOD clocks together, then configure PD6 as an output.'},
    code: `${COMMON_DEFINES}
int main() {
  // RCC_APB2PCENR bits: GPIOA=2, GPIOC=4, GPIOD=5
  RCC_APB2PCENR |= (1 << 2) | (1 << 4) | (1 << 5);

  // configure PD6 as output (push-pull, 50 MHz). PD6 lives at bits [27:24].
  GPIOD_CFGLR &= ~(0xF << (4 * 6));
  GPIOD_CFGLR |=  (0x3 << (4 * 6));

  GPIOD_BSHR = (1 << 6);     // PD6 HIGH — pin 1 on the J4M6 should now read HIGH
}
`
  },

  {
    id: 'atomic-bits',
    lessonSlug: 'l03-gpio-output',
    title:       {ar: 'BSHR / BCR — عمليات ذرّية', en: 'BSHR / BCR — atomic bit-ops'},
    description: {ar: 'كيف تستعمل BSHR لرفع بتات وخفض أخرى في كتابة واحدة، ومقارنتها بـ BCR.', en: 'How BSHR can set some bits and reset others in one write, contrasted with BCR.'},
    code: `${COMMON_DEFINES}
// BSHR is split: bits [15:0] = set, bits [31:16] = reset.
// In one atomic write, you can drive several pins both ways.

int main() {
  RCC_APB2PCENR |= (1 << 4);                 // GPIOC on

  // PC1 + PC2 as outputs
  GPIOC_CFGLR &= ~((0xF << (4*1)) | (0xF << (4*2)));
  GPIOC_CFGLR |=  ((0x3 << (4*1)) | (0x3 << (4*2)));

  // 1) set both PC1 and PC2 HIGH
  GPIOC_BSHR = (1 << 1) | (1 << 2);

  // 2) atomically: set PC1, RESET PC2 — both in one write
  //    (set mask in low half, reset mask in upper half)
  GPIOC_BSHR = (1 << 1) | (1 << (16 + 2));

  // 3) BCR is the simpler "reset only" sibling — clears PC1
  GPIOC_BCR  = (1 << 1);
}
`
  },

  {
    id: 'pll-switch',
    lessonSlug: 'l05-clock-system',
    title:       {ar: 'تبديل الساعة إلى PLL', en: 'Switch sysclk to PLL'},
    description: {ar: 'تفعيل PLL ثم تبديل SW. لاحظ كيف ينعكس SWS بعد أن يصبح PLLRDY مرفوعاً.', en: 'Enable PLL, then switch SW. Watch SWS catch up after PLLRDY rises.'},
    code: `${COMMON_DEFINES}
int main() {
  // PLL source = HSI (CFGR0.PLLSRC = 0 — already default)
  // step 1: enable PLL
  RCC_CTLR |= (1 << 24);            // PLLON
  while (!(RCC_CTLR & (1 << 25)));  // spin until PLLRDY

  // step 2: select PLL as system clock (SW field = 0b10)
  RCC_CFGR0 &= ~0x3;
  RCC_CFGR0 |= 0x2;

  // step 3: verify the switch (SWS field = bits [3:2] of CFGR0)
  while (((RCC_CFGR0 >> 2) & 0x3) != 0x2);

  // now system clock = PLL output
}
`
  },

  {
    id: 'systick-blink',
    lessonSlug: 'l06-systick',
    title:       {ar: 'وميض عبر SysTick', en: 'Blink with SysTick'},
    description: {ar: 'إعداد SysTick بقيمة مقارنة صغيرة + ISR يقلب PC1. لاحظ STK_CNTL يعدّ في كل خطوة، CNTIF يضيء عند المطابقة، ثم يعمل الـ handler.', en: 'Set SysTick with a small CMP + ISR that toggles PC1. Watch STK_CNTL count each step, CNTIF latch on match, then the handler run.'},
    code: `${COMMON_DEFINES}
// SysTick CMP=5 in the sim means: the handler fires every 6 steps
// (CNT goes 0→1→2→3→4→5 [fire] → 0 …). On a real chip you'd use
// 48000-1 for 1 ms — but here each statement is one tick.

int main() {
  RCC_APB2PCENR |= (1 << 4);           // GPIOC clock on
  GPIOC_CFGLR &= ~(0xF << (4*1));
  GPIOC_CFGLR |=  (0x3 << (4*1));      // PC1 = PP output 50 MHz

  STK_CMPLR = 5;                       // small CMP so we see fires quickly
  STK_CNTL  = 0;
  STK_CTLR  = (1 << 0) | (1 << 1) | (1 << 3);  // STE | STIE | STRE

  while (1) {
    // main does nothing — ISR drives the LED.
  }
}

// Vector #12. The handler MUST clear CNTIF or it re-fires forever.
void SysTick_Handler() {
  STK_SR = 0;                          // clear CNTIF (write-0-to-clear)
  GPIOC_OUTDR ^= (1 << 1);             // toggle PC1
}
`
  },

  {
    id: 'systick-swi',
    lessonSlug: 'l06-systick',
    title:       {ar: 'مقاطعة برمجية (SWIE)', en: 'Software-triggered interrupt (SWIE)'},
    description: {ar: 'إثبات أن SWIE في STK_CTLR ترفع المقاطعة البرمجية SW (vector 14) — لا تحتاج عتاد خارجي.', en: 'Show that setting SWIE in STK_CTLR raises the SW software interrupt (vector 14) — no external hardware needed.'},
    code: `${COMMON_DEFINES}
int main() {
  RCC_APB2PCENR |= (1 << 4);
  GPIOC_CFGLR &= ~(0xF << (4*1));
  GPIOC_CFGLR |=  (0x3 << (4*1));      // PC1 output

  // Setting bit 31 of STK_CTLR (SWIE) raises the SW interrupt.
  // The handler must clear SWIE before returning, otherwise the
  // interrupt re-fires.
  STK_CTLR = (1u << 31);
}

void SW_Handler() {
  GPIOC_BSHR = (1 << 1);               // PC1 HIGH from the ISR
  STK_CTLR &= ~(1u << 31);             // ack: clear SWIE
}
`
  },

  {
    id: 'clock-switch-fail',
    lessonSlug: 'l05-clock-system',
    title:       {ar: 'فشل تبديل الساعة', en: 'A failed clock switch'},
    description: {ar: 'محاولة الانتقال إلى PLL قبل تفعيله — SWS لا يتحرّك. لذلك ندور على SWS وليس فقط نكتب SW.', en: 'Try to switch to PLL without enabling it — SWS refuses to move. This is why we spin on SWS, not just write SW.'},
    code: `${COMMON_DEFINES}
int main() {
  // ❌ try to switch to PLL without enabling it first
  RCC_CFGR0 &= ~0x3;
  RCC_CFGR0 |= 0x2;            // SW = PLL (10)

  // SWS will remain at HSI (00) — observe bits [3:2] of CFGR0
  // The hardware refuses to commit the switch until the target is ready.

  // Now do it the right way:
  RCC_CTLR |= (1 << 24);            // PLLON
  while (!(RCC_CTLR & (1 << 25)));  // PLLRDY
  // Re-write SW (no-op value, but triggers the SWS reconcile in the sim)
  RCC_CFGR0 = RCC_CFGR0;
}
`
  }
]

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]))
export const PRESETS_BY_LESSON = (() => {
  const m = new Map<string, Preset[]>()
  for (const p of PRESETS) {
    if (!p.lessonSlug) continue
    if (!m.has(p.lessonSlug)) m.set(p.lessonSlug, [])
    m.get(p.lessonSlug)!.push(p)
  }
  return m
})()
