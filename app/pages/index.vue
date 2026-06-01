<script setup lang="ts">
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'CH32V003 Journey — تعلّم البرمجة العتادية'
    : 'CH32V003 Journey — bare-metal RISC-V learning',
  description: () => locale.value === 'ar'
    ? 'منهج عربي متدرّج لتعلّم برمجة المتحكم CH32V003 على مستوى السجلات.'
    : 'A structured curriculum to learn bare-metal CH32V003 programming at the register level.'
})

const {data: lessons} = await useAsyncData('lessons-home', () =>
  queryCollection('lessons').order('order', 'ASC').all()
)

const trackIds = ['foundation', 'io', 'comm', 'analog', 'pro', 'bonus', 'capstone'] as const
const trackCounts: Record<typeof trackIds[number], number> = {
  foundation: 4, io: 5, comm: 3, analog: 2, pro: 5, bonus: 2, capstone: 1
}
const trackColors: Record<typeof trackIds[number], string> = {
  foundation: '#00F0FF',
  io:         '#00FF9F',
  comm:       '#B14AED',
  analog:     '#FFB800',
  pro:        '#FF2E97',
  bonus:      '#FFB347',
  capstone:   '#FF2E5E'
}

const statKeys = ['lessons', 'tracks', 'language', 'chip'] as const
const statValues: Record<typeof statKeys[number], string> = {
  lessons: '22',
  tracks:  '07',
  language: locale.value === 'ar' ? 'عربي' : 'AR',
  chip: 'CH32V003'
}
const statAccents: Record<typeof statKeys[number], string> = {
  lessons: '#00F0FF',
  tracks:  '#00FF9F',
  language: '#FF2E97',
  chip: '#FFB800'
}

// Recompute the language stat when locale changes
watch(locale, (v) => {
  statValues.language = v === 'ar' ? 'عربي' : 'AR'
})

const titleField = computed(() => locale.value === 'ar' ? 'title' : 'title_en')
const subtitleField = computed(() => locale.value === 'ar' ? 'title_en' : 'title')
</script>

<template>
  <div>
    <!-- ───────── HERO (centered, terminal-driven) ───────── -->
    <section class="relative border-b border-[var(--cy-border)] overflow-hidden">
      <!-- ambient neon glow -->
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full bg-[var(--cy-primary)]/[0.10] blur-[120px]" />
        <div class="absolute top-[80px] right-[-160px] w-[420px] h-[420px] rounded-full bg-[var(--cy-secondary)]/[0.07] blur-[120px]" />
      </div>

      <div class="relative max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
        <!-- HUD strip — always LTR, centered -->
        <div class="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-8" dir="ltr">
          <span class="size-1.5 rounded-full bg-[var(--cy-primary)] shadow-[0_0_8px_var(--cy-primary)] animate-pulse" />
          <span>SYS::READY</span>
          <span class="text-[var(--cy-fg-muted)]/40">|</span>
          <span class="text-[var(--cy-primary)]">// SECTOR: TUTORIAL</span>
          <span class="text-[var(--cy-fg-muted)]/40">|</span>
          <span>v0.1.0</span>
        </div>

        <!-- Big brand mark — always LTR (this IS the brand) -->
        <h1 class="font-display font-bold uppercase leading-[0.95] tracking-tight mb-4" dir="ltr">
          <span class="block text-[11px] sm:text-xs tracking-[0.4em] text-[var(--cy-fg-muted)] font-mono mb-3">
            BARE-METAL · ARABIC EDITION
          </span>
          <span class="block text-5xl sm:text-6xl md:text-7xl text-[var(--cy-fg)]">
            CH32V003<span class="text-[var(--cy-secondary)]">.</span><span class="text-[var(--cy-primary)]">JOURNEY</span>
          </span>
        </h1>

        <!-- Arabic description — centered, in its own RTL block -->
        <p class="mt-8 max-w-2xl mx-auto text-base sm:text-lg text-[var(--cy-fg-muted)] leading-relaxed" :dir="isRtl ? 'rtl' : 'ltr'">
          <i18n-t keypath="app.landing.intro" tag="span" scope="global">
            <template #n>
              <span class="text-[var(--cy-primary)] font-medium">{{ t('app.landing.introBold') }}</span>
            </template>
          </i18n-t>
        </p>

        <!-- CTAs — centered -->
        <div class="mt-10 flex flex-wrap justify-center gap-3" dir="ltr">
          <NuxtLink to="/lessons" class="cy-btn cy-btn-solid">
            <UIcon name="i-lucide-play" class="size-4" :class="isRtl ? 'rotate-180' : ''" />
            {{ t('app.landing.ctaStart') }}
          </NuxtLink>
          <NuxtLink to="/lessons/l00-curriculum-overview" class="cy-btn">
            <UIcon name="i-lucide-map" class="size-4" />
            {{ t('app.landing.ctaCurriculum') }}
          </NuxtLink>
          <a href="https://github.com/shakir-abdo/ch32v003-journey" target="_blank" rel="noopener" class="cy-btn">
            <UIcon name="i-simple-icons-github" class="size-4" />
            {{ t('app.landing.ctaGithub') }}
          </a>
        </div>

        <!-- Live boot-sequence terminal — the visual centerpiece -->
        <div class="mt-14 max-w-3xl mx-auto">
          <HeroBootTerminal />
        </div>

        <!-- Stats strip — centered -->
        <div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3" dir="ltr">
          <div
            v-for="key in statKeys"
            :key="key"
            class="cy-panel p-4 flex flex-col gap-1 items-start"
          >
            <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
              {{ t(`app.landing.stats.${key}`) }}
            </div>
            <div
              class="font-display text-2xl font-bold tabular-nums"
              :style="{color: statAccents[key]}"
            >
              {{ statValues[key] }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ───────── TRACKS ───────── -->
    <section class="max-w-7xl mx-auto px-6 py-20">
      <div class="flex items-end justify-between gap-4 mb-10 pb-4 border-b border-[var(--cy-border)]">
        <div>
          <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-1" dir="ltr">{{ t('app.landing.sectionTracksLabel') }}</div>
          <h2 class="font-display text-2xl font-bold uppercase tracking-wider text-[var(--cy-fg)]">
            {{ t('app.landing.sectionTracksTitle') }}
          </h2>
        </div>
        <NuxtLink to="/lessons" class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-primary)] hover:text-white">
          {{ t('app.landing.sectionTracksAll') }}
        </NuxtLink>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="(id, idx) in trackIds"
          :key="id"
          class="cy-panel p-5 group transition-all"
          :style="{'--accent': trackColors[id]}"
        >
          <div class="flex items-start justify-between gap-3 mb-3" dir="ltr">
            <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
              TRACK_{{ String(idx + 1).padStart(2, '0') }}
            </div>
            <span class="cy-tag" :style="{color: trackColors[id], borderColor: trackColors[id] + '55'}">
              {{ trackCounts[id] }} {{ isRtl ? 'دروس' : 'LESSONS' }}
            </span>
          </div>
          <h3 class="font-display text-xl font-bold uppercase mb-1" :style="{color: trackColors[id]}">
            {{ t(`app.tracks.${id}.label`) }}
          </h3>
          <p class="text-sm text-[var(--cy-fg-muted)]">{{ t(`app.tracks.${id}.desc`) }}</p>
        </div>
      </div>
    </section>

    <!-- ───────── FEATURED LESSONS ───────── -->
    <section class="max-w-7xl mx-auto px-6 pb-20">
      <div class="flex items-end justify-between gap-4 mb-10 pb-4 border-b border-[var(--cy-border)]">
        <div>
          <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-1" dir="ltr">{{ t('app.landing.sectionFeaturedLabel') }}</div>
          <h2 class="font-display text-2xl font-bold uppercase tracking-wider text-[var(--cy-fg)]">
            {{ t('app.landing.sectionFeaturedTitle') }}
          </h2>
        </div>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="l in lessons?.slice(0, 6) ?? []"
          :key="l.slug"
          :to="`/lessons/${l.slug}`"
          class="cy-panel p-5 block group hover:no-underline"
        >
          <div class="flex items-center justify-between gap-2 mb-3" dir="ltr">
            <span class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
              L{{ String(l.order).padStart(2, '0') }}
            </span>
            <span class="cy-tag">{{ l.minutes }} {{ isRtl ? 'دقيقة' : 'MIN' }}</span>
          </div>
          <div class="flex items-start gap-3 mb-3">
            <UIcon :name="l.icon" class="size-5 text-[var(--cy-primary)] shrink-0 mt-0.5" />
            <h3 class="font-display text-base font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors" :dir="isRtl ? 'rtl' : 'ltr'">
              {{ (l as any)[titleField] }}
            </h3>
          </div>
          <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]" :dir="isRtl ? 'rtl' : 'ltr'">
            {{ (l as any)[subtitleField] }}
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- ───────── CTA ───────── -->
    <section class="max-w-7xl mx-auto px-6 pb-24">
      <div class="cy-panel p-10 text-center relative overflow-hidden">
        <div class="absolute inset-0 pointer-events-none opacity-50"
             style="background: radial-gradient(circle at 50% 50%, rgba(0,240,255,0.08) 0%, transparent 70%);" />
        <div class="relative">
          <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-primary)] mb-3" dir="ltr">
            {{ t('app.landing.ctaSection.prefix') }}
          </div>
          <h3 class="font-display text-2xl md:text-3xl font-bold uppercase mb-3 text-[var(--cy-fg)]" :dir="isRtl ? 'rtl' : 'ltr'">
            {{ t('app.landing.ctaSection.title') }}
          </h3>
          <p class="text-[var(--cy-fg-muted)] max-w-xl mx-auto mb-6">
            {{ t('app.landing.ctaSection.body') }}
          </p>
          <NuxtLink to="/lessons/l00-curriculum-overview" class="cy-btn cy-btn-solid">
            {{ t('app.landing.ctaSection.button') }}
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
