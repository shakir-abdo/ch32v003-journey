/**
 * Single source of truth for project branding.
 *
 * Edit ONCE per project; everything that references brand strings
 * (Logo, ecosystem config, locale brand.* keys via interpolation,
 * SEO, social, contact) reads from here.
 *
 * The init script (npm run init) writes this file from user prompts
 * the first time you scaffold a new project.
 */
export const brand = {
  /** Short, machine-safe identifier (lowercase-with-dashes). Used by:
   *  package.json name, PM2 ecosystem app name, Docker tags, etc. */
  id: 'ch32v003-journey',

  /** Marketing-friendly product name. Bilingual. */
  name: {
    en: "CH32V003 Journey",
    ar: "رحلة CH32V003"
  },

  /** One-line tagline shown under the name. */
  tagline: {
    en: "Master bare-metal RISC-V programming, one register at a time.",
    ar: "تعلّم البرمجة العتادية على CH32V003 — درس درس، حتى الاحتراف."
  },

  /** Logo wordmark text. Two-letter avatar fallback. */
  logo: {
    text: "CH32V003",
    avatar: "CH3"
  },

  /** Default URLs (used by OG/Twitter meta, canonicals, redirects). */
  urls: {
    canonical: "https://ch32v003.shakir.sd",
    ogImage: "https://ch32v003.shakir.sd/icon.png"
  },

  /** Brand color palette — primary + accent + state colors.
   *  Used by app.config.ts (Nuxt UI Pro) and per-system pages. */
  colors: {
    primary: '#00F0FF',
    primaryFg: '#FFFFFF',
    accent: '#a3e635',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6'
  },

  /** Contact / support. Empty strings hide the UI. */
  contact: {
    supportEmail: '',
    salesEmail: '',
    phone: ''
  },

  /** Social handles — empty strings hide their icons in footers. */
  social: {
    twitter: 'https://x.com/shakir_abdoo',
    telegram: 'https://t.me/shakir_abdo',
    github: 'https://github.com/shakir-abdo',
    linkedin: '',
    instagram: '',
    youtube: ''
  },

  /** Legal footer copy. */
  legal: {
    company: {
      en: "CH32V003 Journey",
      ar: "رحلة CH32V003"
    },
    rightsReserved: {
      en: 'All rights reserved',
      ar: 'جميع الحقوق محفوظة'
    },
    startYear: 2026
  }
} as const

export type Brand = typeof brand
export type Locale = 'en' | 'ar'

/** Helper: pick the localized variant of a bilingual brand field. */
export const tBrand = (field: {en: string; ar: string}, locale: Locale): string => field[locale]
