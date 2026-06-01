<script setup lang="ts">
const route = useRoute()
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')
const slug = computed(() => String(route.params.slug))

const {data: lesson} = await useAsyncData(`lesson-${slug.value}`, () =>
  queryCollection('lessons').where('slug', '=', slug.value).first()
)

if (!lesson.value) {
  throw createError({statusCode: 404, statusMessage: 'Lesson not found', fatal: true})
}

const {data: all} = await useAsyncData('lessons-nav', () =>
  queryCollection('lessons').order('order', 'ASC').all()
)

const currentIndex = computed(() => all.value?.findIndex((l) => l.slug === slug.value) ?? -1)
const prev = computed(() => currentIndex.value > 0 ? all.value?.[currentIndex.value - 1] : null)
const next = computed(() => currentIndex.value >= 0 ? all.value?.[currentIndex.value + 1] : null)

useSeoMeta({
  title: () => locale.value === 'ar'
    ? `${lesson.value!.title} · CH32V003 Journey`
    : `${lesson.value!.title_en} · CH32V003 Journey`,
  description: () => locale.value === 'ar'
    ? `الدرس ${String(lesson.value!.order).padStart(2, '0')} — ${lesson.value!.title_en}`
    : `Lesson ${String(lesson.value!.order).padStart(2, '0')} — ${lesson.value!.title}`
})

const trackColor: Record<string, string> = {
  foundation: '#00F0FF',
  io:         '#00FF9F',
  comm:       '#B14AED',
  analog:     '#FFB800',
  pro:        '#FF2E97',
  bonus:      '#FFB347',
  capstone:   '#FF2E5E'
}

const tColor = computed(() => trackColor[lesson.value!.track] ?? '#00F0FF')

const titleField    = computed(() => locale.value === 'ar' ? 'title' : 'title_en')
const subtitleField = computed(() => locale.value === 'ar' ? 'title_en' : 'title')

// ─── Progress tracking ───────────────────────────────────────────────────
// Save current scroll position (throttled) and restore it when the learner
// reopens the same lesson. Tracked per-slug in localStorage.
const {progress, save: saveProgress} = useLessonProgress()

let lastScrollSaveAt = 0
let scrollListener: (() => void) | null = null
let visitStart = 0

function computeAndSave() {
  if (typeof window === 'undefined') return
  const y = window.scrollY
  const docH = document.documentElement.scrollHeight - window.innerHeight
  const pct = docH > 0 ? (y / docH) * 100 : 0
  saveProgress(slug.value, y, pct)
}

function onScroll() {
  const now = performance.now()
  // throttle: at most every 400ms
  if (now - lastScrollSaveAt < 400) return
  lastScrollSaveAt = now
  computeAndSave()
}

onMounted(() => {
  visitStart = Date.now()

  // Restore scroll if returning to the same lesson AND the saved entry
  // isn't ancient (older than 30 days = stale, ignore).
  if (progress.value && progress.value.slug === slug.value) {
    const ageDays = (Date.now() - progress.value.timestamp) / (1000 * 60 * 60 * 24)
    if (ageDays < 30 && progress.value.scrollY > 100) {
      // Wait a tick for ContentRenderer to paint, then jump
      nextTick(() => {
        setTimeout(() => {
          window.scrollTo({top: progress.value!.scrollY, behavior: 'auto'})
        }, 80)
      })
    }
  }

  scrollListener = onScroll
  window.addEventListener('scroll', scrollListener, {passive: true})
})

onBeforeUnmount(() => {
  if (scrollListener) {
    window.removeEventListener('scroll', scrollListener)
    scrollListener = null
  }
  // Only commit a final save if the learner spent at least 3 seconds on
  // the page — avoids polluting "resume" with accidental fly-bys.
  if (Date.now() - visitStart > 3000) {
    computeAndSave()
  }
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-6 py-10">
    <!-- Breadcrumb -->
    <nav class="mb-6 font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] flex items-center gap-2" dir="ltr">
      <NuxtLink to="/" class="hover:text-[var(--cy-primary)]">{{ t('app.reader.crumbHome') }}</NuxtLink>
      <span>/</span>
      <NuxtLink to="/lessons" class="hover:text-[var(--cy-primary)]">{{ t('app.reader.crumbLessons') }}</NuxtLink>
      <span>/</span>
      <span class="text-[var(--cy-fg)]">L{{ String(lesson?.order).padStart(2, '0') }}</span>
    </nav>

    <!-- Header card -->
    <header class="cy-panel p-6 mb-8" :style="{borderColor: tColor + '55'}">
      <div class="flex items-center gap-3 mb-4 flex-wrap" dir="ltr">
        <span
          class="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-[2px] border"
          :style="{color: tColor, borderColor: tColor + '55', background: tColor + '0E'}"
        >
          {{ t(`app.tracks.${lesson?.track}.label`) }}
        </span>
        <span class="cy-tag">L{{ String(lesson?.order).padStart(2, '0') }}</span>
        <span class="cy-tag">{{ lesson?.minutes }} {{ t('app.reader.minutes') }}</span>
        <span class="cy-tag" :style="{color: tColor, borderColor: tColor + '55'}">
          {{ t(`app.levels.${lesson?.level}`) }}
        </span>
      </div>
      <div class="flex items-start gap-4">
        <UIcon :name="lesson?.icon || 'i-lucide-book-open'" class="size-8 shrink-0 mt-1" :style="{color: tColor}" />
        <div class="flex-1 min-w-0">
          <h1 class="font-display text-2xl sm:text-3xl font-bold text-[var(--cy-fg)] leading-tight" :dir="isRtl ? 'rtl' : 'ltr'">
            {{ (lesson as any)[titleField] }}
          </h1>
          <div class="font-mono text-[12px] text-[var(--cy-fg-muted)] mt-2" :dir="isRtl ? 'rtl' : 'ltr'">
            {{ (lesson as any)[subtitleField] }}
          </div>
        </div>
      </div>

      <div v-if="lesson?.tags?.length" class="mt-4 flex flex-wrap gap-2" dir="ltr">
        <span v-for="tag in lesson.tags" :key="tag" class="cy-tag">
          #{{ tag }}
        </span>
      </div>
    </header>

    <!-- Lesson body — content is Arabic-only for now, so keep dir=rtl -->
    <article class="cy-prose" dir="rtl">
      <ContentRenderer v-if="lesson" :value="lesson" />
    </article>

    <!-- Prev / Next -->
    <nav class="mt-12 pt-6 border-t border-[var(--cy-border)] grid sm:grid-cols-2 gap-3" :dir="isRtl ? 'rtl' : 'ltr'">
      <NuxtLink
        v-if="prev"
        :to="`/lessons/${prev.slug}`"
        class="cy-panel p-4 group hover:no-underline"
      >
        <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-1 flex items-center gap-1">
          <UIcon :name="isRtl ? 'i-lucide-arrow-right' : 'i-lucide-arrow-left'" class="size-3" />
          {{ t('app.reader.prev') }}
        </div>
        <div class="font-display text-sm font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors truncate" :dir="isRtl ? 'rtl' : 'ltr'">
          {{ (prev as any)[titleField] }}
        </div>
      </NuxtLink>
      <div v-else />

      <NuxtLink
        v-if="next"
        :to="`/lessons/${next.slug}`"
        class="cy-panel p-4 group hover:no-underline"
        :class="isRtl ? 'text-left' : 'text-right'"
      >
        <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-1 flex items-center gap-1" :class="isRtl ? 'justify-start' : 'justify-end'">
          {{ t('app.reader.next') }}
          <UIcon :name="isRtl ? 'i-lucide-arrow-left' : 'i-lucide-arrow-right'" class="size-3" />
        </div>
        <div class="font-display text-sm font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors truncate" :dir="isRtl ? 'rtl' : 'ltr'">
          {{ (next as any)[titleField] }}
        </div>
      </NuxtLink>
      <div v-else />
    </nav>
  </div>
</template>
