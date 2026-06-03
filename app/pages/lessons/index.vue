<script setup lang="ts">
const {t, locale} = useI18n()
const localePath = useLocalePath()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'الدروس · CH32V003 Journey'
    : 'Lessons · CH32V003 Journey',
  description: () => locale.value === 'ar'
    ? '22 درساً متدرّجاً لتعلّم البرمجة العتادية على CH32V003.'
    : '22 progressive lessons for bare-metal CH32V003 programming.'
})

// Each locale has its own collection (content/lessons/{ar,en}/*.md).
// The cache key includes the locale so switching languages refetches.
const collection = computed(() => locale.value === 'en' ? 'lessons_en' : 'lessons_ar')
const {data: lessons} = await useAsyncData(
  () => `lessons-list-${locale.value}`,
  () => queryCollection(collection.value as 'lessons_ar').order('order', 'ASC').all(),
  {watch: [collection]}
)

const search = ref('')

const filtered = computed(() => {
  if (!lessons.value) return []
  const q = search.value.trim().toLowerCase()
  if (!q) return lessons.value
  return lessons.value.filter((l) =>
    l.title.toLowerCase().includes(q) ||
    l.title_en.toLowerCase().includes(q) ||
    l.tags?.some((tt: string) => tt.toLowerCase().includes(q))
  )
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

const levelColor: Record<string, string> = {
  beginner:     '#00FF9F',
  intermediate: '#FFB800',
  advanced:     '#FF2E97'
}

const groups = computed(() => {
  const buckets: Record<string, typeof filtered.value> = {}
  for (const l of filtered.value) {
    (buckets[l.track] ??= []).push(l)
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => {
      const order = ['foundation', 'io', 'comm', 'analog', 'pro', 'bonus', 'capstone']
      return order.indexOf(a) - order.indexOf(b)
    })
})

const titleField    = computed(() => locale.value === 'ar' ? 'title' : 'title_en')
const subtitleField = computed(() => locale.value === 'ar' ? 'title_en' : 'title')

// ─── Resume card ─────────────────────────────────────────────────────────
// Hydrate from localStorage on client only; SSR renders empty card slot.
const {progress, clear: clearProgress, formatAge} = useLessonProgress()

// Resolve the lesson object for the saved slug so we can show its title +
// icon + track color in the card.
const resumeLesson = computed(() => {
  if (!progress.value || !lessons.value) return null
  const found = lessons.value.find((l) => l.slug === progress.value!.slug)
  if (!found) return null
  // Age out anything older than 30 days
  const ageDays = (Date.now() - progress.value.timestamp) / (1000 * 60 * 60 * 24)
  if (ageDays > 30) return null
  return found
})

const resumeAge = computed(() =>
  progress.value ? formatAge(locale.value === 'ar' ? 'ar' : 'en') : ''
)
const resumeColor = computed(() =>
  resumeLesson.value ? trackColor[resumeLesson.value.track] ?? '#00F0FF' : '#00F0FF'
)
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-12" :dir="isRtl ? 'rtl' : 'ltr'">
    <!-- Header -->
    <header class="mb-10 pb-6 border-b border-[var(--cy-border)]">
      <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-2" dir="ltr">
        // ROUTE: /lessons · {{ filtered?.length ?? 0 }} {{ t('app.lessons.countSuffix') }}
      </div>
      <h1 class="font-display text-4xl font-bold uppercase text-[var(--cy-fg)] mb-2">
        {{ t('app.lessons.heading') }}
      </h1>
      <p class="text-[var(--cy-fg-muted)]">
        {{ t('app.lessons.subhead') }}
      </p>
    </header>

    <!-- Resume card — only when the learner has a saved (non-stale) progress -->
    <ClientOnly>
      <NuxtLink
        v-if="resumeLesson && progress"
        :to="localePath(`/lessons/${resumeLesson.slug}`)"
        class="cy-panel mb-8 p-3 sm:p-5 grid gap-3 sm:gap-4 group hover:no-underline relative overflow-hidden"
        :style="{borderColor: resumeColor + '55'}"
      >
        <!-- ambient glow tinted by the lesson's track color -->
        <div
          class="absolute inset-0 pointer-events-none opacity-30"
          :style="{background: `radial-gradient(circle at 20% 50%, ${resumeColor}22 0%, transparent 70%)`}"
        />

        <!-- Top row: chip + age + dismiss. flex-wrap keeps long Arabic chips from pushing the X off-screen on narrow viewports. -->
        <div class="relative flex items-center gap-2 flex-wrap min-w-0">
          <span
            class="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider px-1.5 sm:px-2 py-1 rounded-[2px] border inline-flex items-center gap-1.5 max-w-full"
            :style="{color: resumeColor, borderColor: resumeColor + '55', background: resumeColor + '0E'}"
          >
            <span class="size-1.5 rounded-full animate-pulse shrink-0" :style="{background: resumeColor}" />
            <span class="truncate">{{ t('app.resume.headline') }}</span>
          </span>
          <span class="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] truncate" dir="ltr">
            {{ resumeAge }}
          </span>
          <button
            type="button"
            class="ms-auto shrink-0 size-6 grid place-items-center text-[var(--cy-fg-muted)] hover:text-[var(--cy-destructive)] transition-colors rounded-[2px] hover:bg-[var(--cy-destructive)]/10"
            :title="t('app.resume.dismiss')"
            :aria-label="t('app.resume.dismiss')"
            @click.stop.prevent="clearProgress()"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>

        <!-- Main row: icon + title + CTA. Icon shrinks on mobile, CTA hidden below sm. -->
        <div class="relative flex items-center gap-3 sm:gap-4 min-w-0">
          <div
            class="shrink-0 size-11 sm:size-14 grid place-items-center border rounded-[4px]"
            :style="{
              borderColor: resumeColor + '55',
              background: resumeColor + '12'
            }"
          >
            <UIcon :name="resumeLesson.icon || 'i-lucide-book-open'" class="size-5 sm:size-7" :style="{color: resumeColor}" />
          </div>

          <!-- Title block — flex-1 + min-w-0 are BOTH required so the truncated title actually shrinks instead of forcing the row to overflow. -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 min-w-0" :dir="isRtl ? 'rtl' : 'ltr'">
              <span class="shrink-0 font-mono text-[11px] sm:text-xs font-bold tabular-nums" :style="{color: resumeColor}" dir="ltr">
                L{{ String(resumeLesson.order).padStart(2, '0') }}
              </span>
              <span class="flex-1 min-w-0 truncate font-display text-sm sm:text-lg font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors">
                {{ (resumeLesson as any)[titleField] }}
              </span>
            </div>
            <div class="mt-2 flex items-center gap-2 sm:gap-3" dir="ltr">
              <div class="flex-1 min-w-0 h-1 bg-[var(--cy-muted)] rounded-[1px] overflow-hidden">
                <div
                  class="h-full transition-all"
                  :style="{
                    width: `${progress.scrollPercent}%`,
                    background: resumeColor,
                    boxShadow: `0 0 6px ${resumeColor}`
                  }"
                />
              </div>
              <span class="font-mono text-[10px] tabular-nums text-[var(--cy-fg-muted)] shrink-0">
                {{ Math.round(progress.scrollPercent) }}%
              </span>
            </div>
          </div>

          <span
            class="hidden sm:inline-flex cy-btn shrink-0"
            :style="{color: resumeColor, borderColor: resumeColor + '66'}"
            dir="ltr"
          >
            <UIcon :name="isRtl ? 'i-lucide-arrow-left' : 'i-lucide-arrow-right'" class="size-3.5" />
            {{ t('app.resume.cta') }}
          </span>
        </div>
      </NuxtLink>
    </ClientOnly>

    <!-- Search -->
    <div class="mb-8 relative max-w-md" dir="ltr">
      <UIcon name="i-lucide-search" class="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-[var(--cy-fg-muted)]" />
      <input
        v-model="search"
        type="text"
        :placeholder="t('app.lessons.searchPlaceholder')"
        class="w-full ps-10 pe-4 py-2.5 bg-[var(--cy-card)] border border-[var(--cy-border)] focus:border-[var(--cy-border-strong)] focus:outline-none rounded-[2px] font-mono text-[12px] text-[var(--cy-fg)] placeholder:text-[var(--cy-fg-muted)] transition-colors"
      >
    </div>

    <!-- Empty state -->
    <div v-if="!filtered.length" class="cy-panel p-12 text-center" dir="ltr">
      <UIcon name="i-lucide-search-x" class="size-10 mx-auto mb-3 text-[var(--cy-fg-muted)]" />
      <div class="font-mono text-sm uppercase tracking-wider text-[var(--cy-fg-muted)]">
        {{ t('app.lessons.noMatches') }}
      </div>
    </div>

    <!-- Track groups -->
    <section v-for="[trackId, items] in groups" :key="trackId" class="mb-12">
      <div class="flex items-center gap-3 mb-4">
        <span class="size-2 rounded-full" :style="{background: trackColor[trackId], boxShadow: `0 0 8px ${trackColor[trackId]}`}" />
        <h2 class="font-display text-lg font-bold uppercase tracking-wider" :style="{color: trackColor[trackId]}">
          {{ t(`app.tracks.${trackId}.label`) }}
        </h2>
        <span class="text-[var(--cy-fg-muted)] font-mono text-[11px] uppercase">// {{ t(`app.tracks.${trackId}.desc`) }}</span>
        <div class="flex-1 h-px bg-[var(--cy-border)]" />
        <span class="font-mono text-[10px] text-[var(--cy-fg-muted)]">[{{ items.length }}]</span>
      </div>

      <div class="grid gap-3">
        <NuxtLink
          v-for="l in items"
          :key="l.slug"
          :to="localePath(`/lessons/${l.slug}`)"
          class="cy-panel p-4 flex items-center gap-4 group hover:no-underline"
        >
          <!-- Order chip -->
          <div
            class="shrink-0 size-12 grid place-items-center font-mono text-sm font-bold border rounded-[2px]"
            :style="{
              color: trackColor[trackId],
              borderColor: trackColor[trackId] + '44',
              background: trackColor[trackId] + '0E'
            }"
            dir="ltr"
          >
            L{{ String(l.order).padStart(2, '0') }}
          </div>

          <UIcon :name="l.icon" class="size-5 text-[var(--cy-fg-muted)] shrink-0 group-hover:text-[var(--cy-primary)] transition-colors" />

          <div class="flex-1 min-w-0">
            <div class="font-display text-base font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors truncate" :dir="isRtl ? 'rtl' : 'ltr'">
              {{ (l as any)[titleField] }}
            </div>
            <div class="font-mono text-[11px] text-[var(--cy-fg-muted)] truncate" :dir="isRtl ? 'rtl' : 'ltr'">
              {{ (l as any)[subtitleField] }}
            </div>
          </div>

          <div class="hidden md:flex items-center gap-2 shrink-0" dir="ltr">
            <span class="cy-tag" :style="{color: levelColor[l.level], borderColor: levelColor[l.level] + '44'}">
              {{ t(`app.levels.${l.level}`) }}
            </span>
            <span class="cy-tag">{{ l.minutes }}{{ t('app.lessons.minutesUnit') }}</span>
            <UIcon :name="isRtl ? 'i-lucide-arrow-left' : 'i-lucide-arrow-right'" class="size-4 text-[var(--cy-fg-muted)] group-hover:text-[var(--cy-primary)] transition-all" />
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
