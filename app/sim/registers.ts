/**
 * Register dictionary for the J4M6 simulator.
 *
 * Addresses + reset values are taken straight from CH32V003 RM v1.9.
 * Only the registers v1 actually touches are listed (RCC + GPIOA/C/D).
 * Bit-field hints are coarse — the UI groups every 4 bits — and only
 * cover the fields the learner reads/writes in lessons L00-L05.
 */

import type {RegisterDef} from './types'

export const RCC_BASE     = 0x40021000
export const GPIOA_BASE   = 0x40010800
export const GPIOC_BASE   = 0x40011000
export const GPIOD_BASE   = 0x40011400
export const SYSTICK_BASE = 0xE000F000
export const PFIC_BASE    = 0xE000E000

export interface RegisterEntry extends RegisterDef {
  /** Bits that are read-only (writes ignored). Used for ready/SWS-type bits. */
  readOnlyMask?: number
}

export const REGISTERS: RegisterEntry[] = [
  // ── RCC ─────────────────────────────────────────────────────────────
  {
    name: 'RCC_CTLR', peripheral: 'RCC',
    address: RCC_BASE + 0x00,
    reset: 0x00000083,                  // HSION + HSIRDY + default trim
    // HSIRDY/HSERDY/PLLRDY are RO per RM §3.4.1. HSICAL[15:8] is hardware-
    // calibrated and RO too (RM lists "calibration result" — writes have no
    // effect on real silicon).
    readOnlyMask: (1 << 1) | (1 << 17) | (1 << 25) | (0xFF << 8),
    fields: {0: 'HSION', 1: 'HSIRDY', 16: 'HSEON', 17: 'HSERDY', 24: 'PLLON', 25: 'PLLRDY'}
  },
  {
    name: 'RCC_CFGR0', peripheral: 'RCC',
    address: RCC_BASE + 0x04,
    // HPRE field [7:4] resets to 0010b per RM §3.4.4 → AHB prescaler = /3.
    // Combined with the default HSI 24 MHz, HCLK = 8 MHz at power-on.
    reset: 0x00000020,
    readOnlyMask: 0b1100,               // SWS[3:2] read-only (mirrors SW)
    fields: {0: 'SW0', 1: 'SW1', 2: 'SWS0', 3: 'SWS1', 4: 'HPRE0', 5: 'HPRE1', 6: 'HPRE2', 7: 'HPRE3', 16: 'PLLSRC', 24: 'MCO0', 25: 'MCO1', 26: 'MCO2'}
  },
  {
    name: 'RCC_APB2PCENR', peripheral: 'RCC',
    address: RCC_BASE + 0x18,
    reset: 0x00000000,
    fields: {0: 'AFIO', 2: 'GPIOA', 4: 'GPIOC', 5: 'GPIOD', 9: 'ADC1', 10: 'TIM1', 11: 'SPI1', 12: 'USART1'}
  },
  {
    name: 'RCC_APB1PCENR', peripheral: 'RCC',
    address: RCC_BASE + 0x1C,
    reset: 0x00000000,
    fields: {0: 'TIM2', 11: 'WWDG', 14: 'I2C1', 28: 'PWR'}
  },
  {
    name: 'RCC_RSTSCKR', peripheral: 'RCC',
    address: RCC_BASE + 0x24,
    reset: 0x0C000000,                  // PORRSTF + LSIRDY clear
    readOnlyMask: (1 << 1),             // LSIRDY read-only
    fields: {0: 'LSION', 1: 'LSIRDY', 24: 'RMVF', 26: 'PINRSTF', 27: 'PORRSTF', 28: 'SFTRSTF', 29: 'IWDGRSTF', 30: 'WWDGRSTF', 31: 'LPWRRSTF'}
  }
]

const portRegs = (peri: string, base: number): RegisterEntry[] => [
  {
    name: `${peri}_CFGLR`, peripheral: peri,
    address: base + 0x00,
    reset: 0x44444444,                  // all pins as floating input
    fields: {}
  },
  {
    name: `${peri}_INDR`,  peripheral: peri,
    address: base + 0x08,
    reset: 0x00000000,
    readOnlyMask: 0xFFFFFFFF,           // hardware-driven; sim sets via pin model
    fields: {}
  },
  {
    name: `${peri}_OUTDR`, peripheral: peri,
    address: base + 0x0C,
    reset: 0x00000000,
    fields: {}
  },
  {
    name: `${peri}_BSHR`,  peripheral: peri,
    address: base + 0x10,
    reset: 0x00000000,                  // write-only behaviour; reads zero
    fields: {}
  },
  {
    name: `${peri}_BCR`,   peripheral: peri,
    address: base + 0x14,
    reset: 0x00000000,
    fields: {}
  }
]

REGISTERS.push(
  ...portRegs('GPIOA', GPIOA_BASE),
  ...portRegs('GPIOC', GPIOC_BASE),
  ...portRegs('GPIOD', GPIOD_BASE)
)

// ── PFIC (RM §6.4) — gates which interrupts can actually reach the core ─
REGISTERS.push(
  {
    name: 'PFIC_ISR1', peripheral: 'PFIC',
    address: PFIC_BASE + 0x000,
    // RM §6.5.2.1 note 1: PFIC_ISR1 resets to 0xC — NMI #2 and HardFault #3
    // are always enabled. INTEN status for vectors 12 (SysTick), 14 (SW),
    // 20 (EXTI7_0) lives here and is updated by the IENR1/IRER1 hooks.
    reset: 0x0000000C,
    readOnlyMask: 0xFFFFFFFF,
    fields: {2: 'NMI', 3: 'HF', 12: 'SysTick', 14: 'SW', 20: 'EXTI7_0'}
  },
  {
    name: 'PFIC_IENR1', peripheral: 'PFIC',
    address: PFIC_BASE + 0x100,
    // WO: writing 1 to bit N enables interrupt N. The hook applies the
    // enable and clears IENR1 back to 0 (reads return 0).
    reset: 0x00000000,
    fields: {12: 'SysTick', 14: 'SW', 20: 'EXTI7_0'}
  },
  {
    name: 'PFIC_IRER1', peripheral: 'PFIC',
    address: PFIC_BASE + 0x180,
    // WO: writing 1 to bit N disables interrupt N. Same write-then-clear
    // pattern as IENR1.
    reset: 0x00000000,
    fields: {12: 'SysTick', 14: 'SW', 20: 'EXTI7_0'}
  }
)

// ── SysTick (PFIC system timer, RM §6.5) ─────────────────────────────
REGISTERS.push(
  {
    name: 'STK_CTLR', peripheral: 'SysTick',
    address: SYSTICK_BASE + 0x00,
    reset: 0x00000000,
    fields: {0: 'STE', 1: 'STIE', 2: 'STCLK', 3: 'STRE', 31: 'SWIE'}
  },
  {
    name: 'STK_SR', peripheral: 'SysTick',
    address: SYSTICK_BASE + 0x04,
    reset: 0x00000000,
    // CNTIF is RW0: write 0 clears, write 1 has no effect. We model the
    // "no effect on writing 1" semantics inside the hook (not via mask).
    fields: {0: 'CNTIF'}
  },
  {
    name: 'STK_CNTL', peripheral: 'SysTick',
    address: SYSTICK_BASE + 0x08,
    reset: 0x00000000,
    fields: {}
  },
  {
    name: 'STK_CMPLR', peripheral: 'SysTick',
    address: SYSTICK_BASE + 0x10,
    reset: 0x00000000,
    fields: {}
  }
)

/** Lookup index, address → entry. */
export const REGISTER_BY_ADDR = new Map<number, RegisterEntry>(
  REGISTERS.map((r) => [r.address, r])
)

/** Lookup index, name → entry. */
export const REGISTER_BY_NAME = new Map<string, RegisterEntry>(
  REGISTERS.map((r) => [r.name, r])
)

/** J4M6 only exposes these GPIOs (matches the chip diagram). */
export const J4M6_PINS: Array<{net: string; port: 'A'|'C'|'D'; bit: number; altLabel?: string}> = [
  {net: 'PD6', port: 'D', bit: 6, altLabel: 'TX'},
  {net: 'PA2', port: 'A', bit: 2},
  {net: 'PC1', port: 'C', bit: 1, altLabel: 'SDA'},
  {net: 'PC2', port: 'C', bit: 2, altLabel: 'SCL'},
  {net: 'PC4', port: 'C', bit: 4, altLabel: 'ADC2'},
  {net: 'PD4', port: 'D', bit: 4, altLabel: 'SWIO'}
]
