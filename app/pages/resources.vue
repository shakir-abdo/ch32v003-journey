<script setup lang="ts">
const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'المصادر · CH32V003 Journey'
    : 'Resources · CH32V003 Journey',
  description: () => t('app.resources.intro')
})

const hardware = [
  {
    id: 'wchlinke',
    img: '/hardware/wch-linke.webp',
    key: 'wchLinkE',
    badge: 'programmer',
    color: '#00F0FF',
    href: 'https://www.aliexpress.com/wholesale?SearchText=WCH-LinkE'
  },
  {
    id: 'j4m6',
    img: '/hardware/ch32v003j4m6.avif',
    key: 'j4m6',
    badge: 'mcu',
    color: '#00FF9F',
    href: 'https://www.wch-ic.com/products/CH32V003.html'
  },
  {
    id: 'f4p6',
    img: '/hardware/ch32v003f4p6.avif',
    key: 'f4p6',
    badge: 'alternative',
    color: '#FFB800',
    href: 'https://www.wch-ic.com/products/CH32V003.html'
  }
]

const projects = [
  {
    id: 'libraries',
    key: 'librariesProj',
    icon: 'i-lucide-library',
    href: 'https://github.com/shakir-abdo/ch32v003j4m6-libraries',
    color: '#00F0FF'
  },
  {
    id: 'unbrick',
    key: 'unbrickProj',
    icon: 'i-lucide-life-buoy',
    href: 'https://github.com/shakir-abdo/ch32v003-unbrick',
    color: '#FF2E97'
  }
]
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 py-12" :dir="isRtl ? 'rtl' : 'ltr'">
    <!-- Header -->
    <header class="mb-12 pb-6 border-b border-[var(--cy-border)]">
      <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-2" dir="ltr">
        {{ t('app.resources.hudLabel') }}
      </div>
      <h1 class="font-display text-4xl font-bold uppercase text-[var(--cy-fg)] mb-3" :dir="isRtl ? 'rtl' : 'ltr'">
        {{ t('app.resources.title') }}
      </h1>
      <p class="max-w-2xl text-[var(--cy-fg-muted)] leading-relaxed">
        {{ t('app.resources.intro') }}
      </p>
    </header>

    <!-- ───────── HARDWARE ───────── -->
    <section class="mb-16">
      <div class="flex items-center gap-3 mb-6">
        <span class="size-2 rounded-full bg-[var(--cy-primary)] shadow-[0_0_8px_var(--cy-primary)]" />
        <h2 class="font-display text-xl font-bold uppercase tracking-wider text-[var(--cy-primary)]">
          {{ t('app.resources.hardwareSection') }}
        </h2>
        <div class="flex-1 h-px bg-[var(--cy-border)]" />
      </div>
      <p class="text-sm text-[var(--cy-fg-muted)] mb-8">{{ t('app.resources.hardwareSub') }}</p>

      <div class="grid md:grid-cols-3 gap-5">
        <div
          v-for="item in hardware"
          :key="item.id"
          class="cy-panel overflow-hidden flex flex-col"
          :style="{borderColor: item.color + '33'}"
        >
          <!-- image -->
          <div class="aspect-square bg-[var(--cy-shell)] border-b border-[var(--cy-border)] flex items-center justify-center overflow-hidden">
            <img :src="item.img" :alt="t(`app.resources.${item.key}.name`)" class="w-full h-full object-contain p-2" loading="lazy">
          </div>

          <div class="p-4 flex flex-col gap-2 grow">
            <div class="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider" dir="ltr">
              <span :style="{color: item.color}">// {{ t(`app.resources.${item.badge}`) }}</span>
            </div>
            <h3 class="font-display text-lg font-semibold text-[var(--cy-fg)]" dir="ltr">
              {{ t(`app.resources.${item.key}.name`) }}
            </h3>
            <p class="text-[11px] font-mono uppercase tracking-wider text-[var(--cy-fg-muted)]">
              {{ t(`app.resources.${item.key}.role`) }}
            </p>
            <p class="text-sm text-[var(--cy-fg-muted)] leading-relaxed mt-1 grow">
              {{ t(`app.resources.${item.key}.desc`) }}
            </p>
            <a :href="item.href" target="_blank" rel="noopener" class="mt-3 cy-btn justify-center text-[11px]">
              <UIcon name="i-lucide-external-link" class="size-3.5" />
              {{ item.id === 'wchlinke' ? t('app.resources.wchLinkE.buy') : t('app.resources.learnMore') }}
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ───────── PROJECTS ───────── -->
    <section class="mb-16">
      <div class="flex items-center gap-3 mb-6">
        <span class="size-2 rounded-full bg-[#B14AED] shadow-[0_0_8px_#B14AED]" />
        <h2 class="font-display text-xl font-bold uppercase tracking-wider text-[#B14AED]">
          {{ t('app.resources.projectsSection') }}
        </h2>
        <div class="flex-1 h-px bg-[var(--cy-border)]" />
      </div>
      <p class="text-sm text-[var(--cy-fg-muted)] mb-8">{{ t('app.resources.projectsSub') }}</p>

      <div class="grid md:grid-cols-2 gap-5">
        <a
          v-for="p in projects"
          :key="p.id"
          :href="p.href"
          target="_blank"
          rel="noopener"
          class="cy-panel p-6 group hover:no-underline transition-all flex flex-col"
          :style="{borderColor: p.color + '33'}"
        >
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="size-12 rounded-[4px] grid place-items-center border" :style="{borderColor: p.color + '55', background: p.color + '0E'}">
              <UIcon :name="p.icon" class="size-6" :style="{color: p.color}" />
            </div>
            <UIcon name="i-simple-icons-github" class="size-5 text-[var(--cy-fg-muted)] group-hover:text-[var(--cy-fg)] transition-colors" />
          </div>
          <h3 class="font-display text-lg font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors mb-2" dir="ltr">
            {{ t(`app.resources.${p.key}.name`) }}
          </h3>
          <p class="text-sm text-[var(--cy-fg-muted)] leading-relaxed grow">
            {{ t(`app.resources.${p.key}.desc`) }}
          </p>
          <div class="mt-4 font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] group-hover:text-[var(--cy-primary)] transition-colors flex items-center gap-2">
            <span>{{ t(`app.resources.${p.key}.cta`) }}</span>
            <UIcon :name="isRtl ? 'i-lucide-arrow-left' : 'i-lucide-arrow-right'" class="size-3" />
          </div>
        </a>
      </div>
    </section>

    <!-- ───────── SUPPORT ───────── -->
    <section>
      <div class="flex items-center gap-3 mb-6">
        <span class="size-2 rounded-full bg-[#FF2E97] shadow-[0_0_8px_#FF2E97]" />
        <h2 class="font-display text-xl font-bold uppercase tracking-wider text-[#FF2E97]">
          {{ t('app.resources.supportSection') }}
        </h2>
        <div class="flex-1 h-px bg-[var(--cy-border)]" />
      </div>
      <p class="text-sm text-[var(--cy-fg-muted)] mb-8">{{ t('app.resources.supportSub') }}</p>

      <div class="grid md:grid-cols-2 gap-5">
        <a
          href="https://shakir.sd"
          target="_blank"
          rel="noopener"
          class="cy-panel p-6 group hover:no-underline flex items-start gap-4"
        >
          <div class="size-12 rounded-[4px] grid place-items-center border border-[var(--cy-primary)]/40 bg-[var(--cy-primary)]/[0.05]">
            <UIcon name="i-lucide-globe" class="size-6 text-[var(--cy-primary)]" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-display text-lg font-semibold text-[var(--cy-fg)] group-hover:text-[var(--cy-primary)] transition-colors mb-1">
              {{ t('app.resources.personalSite.title') }}
            </h3>
            <p class="text-sm text-[var(--cy-fg-muted)] mb-2">{{ t('app.resources.personalSite.desc') }}</p>
            <span class="font-mono text-[11px] uppercase text-[var(--cy-primary)] inline-flex items-center gap-1.5">
              <span>{{ t('app.resources.personalSite.cta') }}</span>
              <UIcon :name="isRtl ? 'i-lucide-arrow-left' : 'i-lucide-arrow-right'" class="size-3" />
            </span>
          </div>
        </a>

        <a
          href="https://paypal.me/shicolare1"
          target="_blank"
          rel="noopener"
          class="cy-panel p-6 group hover:no-underline flex items-start gap-4"
        >
          <div class="size-12 rounded-[4px] grid place-items-center border border-[#FF2E97]/40 bg-[#FF2E97]/[0.05]">
            <UIcon name="i-simple-icons-paypal" class="size-6" style="color: #FF2E97" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-display text-lg font-semibold text-[var(--cy-fg)] group-hover:text-[#FF2E97] transition-colors mb-1">
              {{ t('app.resources.paypal.title') }}
            </h3>
            <p class="text-sm text-[var(--cy-fg-muted)] mb-2">{{ t('app.resources.paypal.desc') }}</p>
            <span class="font-mono text-[11px] uppercase inline-flex items-center gap-1.5" style="color: #FF2E97">
              <span>{{ t('app.resources.paypal.cta') }}</span>
              <UIcon :name="isRtl ? 'i-lucide-arrow-left' : 'i-lucide-arrow-right'" class="size-3" />
            </span>
          </div>
        </a>
      </div>
    </section>
  </div>
</template>
