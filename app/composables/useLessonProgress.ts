/**
 * Track per-learner progress in localStorage.
 *
 * Stores:
 *   - slug          which lesson they were last reading
 *   - scrollY       exact pixel offset to restore
 *   - scrollPercent 0..100, used for the progress bar on the lessons list
 *   - timestamp     ms since epoch — used to age out stale entries + format
 *                   "منذ X" / "X ago"
 *
 * SSR-safe via VueUse's `useLocalStorage` (which guards against `window`
 * during server render and hydrates lazily on the client).
 */
export interface LessonProgress {
  slug: string
  scrollY: number
  scrollPercent: number
  timestamp: number
}

const STORAGE_KEY = 'ch32v003-journey:progress'

export const useLessonProgress = () => {
  const progress = useLocalStorage<LessonProgress | null>(STORAGE_KEY, null, {
    // Custom serializer so the stored value is `null` (not the literal string "null")
    // when no progress exists yet, which simplifies reactivity checks.
    serializer: {
      read: (v: string) => {
        if (!v || v === 'null') return null
        try {
          return JSON.parse(v) as LessonProgress
        } catch {
          return null
        }
      },
      write: (v: LessonProgress | null) => (v ? JSON.stringify(v) : 'null')
    }
  })

  function save(slug: string, scrollY: number, scrollPercent: number) {
    progress.value = {
      slug,
      scrollY: Math.max(0, Math.round(scrollY)),
      scrollPercent: Math.min(100, Math.max(0, Math.round(scrollPercent))),
      timestamp: Date.now()
    }
  }

  function clear() {
    progress.value = null
  }

  /** Minutes since the saved progress was last updated, or null if none. */
  function getAgeMinutes(): number | null {
    if (!progress.value) return null
    return Math.floor((Date.now() - progress.value.timestamp) / 60_000)
  }

  /**
   * Localized "time ago" string. Falls back to '' if no progress saved.
   * Keeps it short — we display it inside a chip on the resume card.
   */
  function formatAge(locale: 'ar' | 'en' = 'ar'): string {
    const mins = getAgeMinutes()
    if (mins === null) return ''
    if (locale === 'ar') {
      if (mins < 1) return 'الآن'
      if (mins === 1) return 'منذ دقيقة'
      if (mins === 2) return 'منذ دقيقتين'
      if (mins < 11) return `منذ ${mins} دقائق`
      if (mins < 60) return `منذ ${mins} دقيقة`
      const hours = Math.floor(mins / 60)
      if (hours === 1) return 'منذ ساعة'
      if (hours === 2) return 'منذ ساعتين'
      if (hours < 11) return `منذ ${hours} ساعات`
      if (hours < 24) return `منذ ${hours} ساعة`
      const days = Math.floor(hours / 24)
      if (days === 1) return 'أمس'
      if (days === 2) return 'منذ يومين'
      if (days < 11) return `منذ ${days} أيام`
      if (days < 30) return `منذ ${days} يوماً`
      return 'منذ فترة'
    }
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return {
    progress,
    save,
    clear,
    getAgeMinutes,
    formatAge
  }
}
