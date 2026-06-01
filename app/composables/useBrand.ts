import {brand, tBrand, type Locale} from '~/config/brand'

/**
 * Reactive accessor for project branding.
 *
 * Usage:
 *   const b = useBrand()
 *   b.name.value   // 'Government Services Platform' or 'منصة الخدمات الحكومية' depending on active locale
 *   b.config       // raw brand object (non-reactive, full structure)
 *   b.year.value   // computed year range, e.g., '2026' or '2024–2026'
 *
 * The `name`, `tagline`, `legalCompany`, `legalRights` getters auto-track
 * the active i18n locale so they update on switch.
 */
export const useBrand = () => {
  const {locale} = useI18n()
  const currentLocale = computed<Locale>(() => (locale.value === 'ar' ? 'ar' : 'en'))

  const name = computed(() => tBrand(brand.name, currentLocale.value))
  const tagline = computed(() => tBrand(brand.tagline, currentLocale.value))
  const legalCompany = computed(() => tBrand(brand.legal.company, currentLocale.value))
  const legalRights = computed(() => tBrand(brand.legal.rightsReserved, currentLocale.value))

  const year = computed(() => {
    const currentYear = new Date().getFullYear()
    return brand.legal.startYear === currentYear
      ? String(currentYear)
      : `${brand.legal.startYear}–${currentYear}`
  })

  return {
    config: brand,
    name,
    tagline,
    legalCompany,
    legalRights,
    year,
    colors: brand.colors,
    logo: brand.logo,
    urls: brand.urls,
    contact: brand.contact,
    social: brand.social
  }
}
