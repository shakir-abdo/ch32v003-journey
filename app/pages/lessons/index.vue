<script setup lang="ts">
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'الدروس · CH32V003 Journey'
    : 'Lessons · CH32V003 Journey',
  description: () => locale.value === 'ar'
    ? '20 درساً متدرّجاً لتعلّم البرمجة العتادية على CH32V003.'
    : '20 progressive lessons for bare-metal CH32V003 programming.'
})

const {data: lessons} = await useAsyncData('lessons-list', () =>
  queryCollection('lessons').order('order', 'ASC').all()
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
      const order = ['foundation', 'io', 'comm', 'analog', 'pro', 'capstone']
      return order.indexOf(a) - order.indexOf(b)
    })
})

const titleField    = computed(() => locale.value === 'ar' ? 'title' : 'title_en')
const subtitleField = computed(() => locale.value === 'ar' ? 'title_en' : 'title')
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
          :to="`/lessons/${l.slug}`"
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
