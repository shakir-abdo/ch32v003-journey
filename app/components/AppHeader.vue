<script setup lang="ts">
const route = useRoute()
const {locale, locales, setLocale, t} = useI18n()
const colorMode = useColorMode()

const navItems = computed(() => [
  {label: t('app.header.home'),      to: '/',           match: (p: string) => p === '/'},
  {label: t('app.header.lessons'),   to: '/lessons',    match: (p: string) => p.startsWith('/lessons')},
  {label: t('app.header.playground'),to: '/playground', match: (p: string) => p.startsWith('/playground'), beta: true},
  {label: t('app.header.resources'), to: '/resources',  match: (p: string) => p === '/resources'},
  {label: t('app.header.about'),     to: '/about',      match: (p: string) => p === '/about'}
])

const isActive = (item: {match: (p: string) => boolean}) => item.match(route.path)

function toggleLocale() {
  setLocale(locale.value === 'ar' ? 'en' : 'ar')
}
function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const otherLocale = computed(() => {
  const list = locales.value as Array<{code: string; name: string}>
  return list.find((l) => l.code !== locale.value)
})

const isRtl = computed(() => locale.value === 'ar')
const isDark = computed(() => colorMode.value === 'dark')
</script>

<template>
  <header class="sticky top-0 z-50 bg-[var(--cy-shell)]/95 backdrop-blur-md border-b border-[var(--cy-border)]">
    <div class="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4" :dir="isRtl ? 'rtl' : 'ltr'">
      <NuxtLink to="/" class="group flex items-center gap-3 font-mono text-sm uppercase tracking-wider" dir="ltr">
        <span class="size-2 rounded-full bg-[var(--cy-primary)] shadow-[0_0_8px_var(--cy-primary)] animate-pulse" />
        <span class="text-[var(--cy-fg)] font-bold group-hover:text-[var(--cy-primary)] transition-colors">
          CH32V003<span class="text-[var(--cy-primary)]">::</span>JOURNEY
        </span>
      </NuxtLink>

      <nav class="hidden md:flex items-center gap-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all inline-flex items-center gap-1.5"
          :class="[
            isActive(item)
              ? 'text-[var(--cy-primary)] border-b border-[var(--cy-primary)]'
              : 'text-[var(--cy-fg-muted)] hover:text-[var(--cy-fg)]'
          ]"
        >
          {{ item.label }}
          <span
            v-if="(item as any).beta"
            class="font-mono text-[8px] tracking-wider px-1 py-px rounded-[1px] border"
            :style="{
              color: 'var(--cy-warning)',
              borderColor: 'var(--cy-warning)',
              background: 'rgba(255,184,0,0.08)',
              boxShadow: '0 0 6px rgba(255,184,0,0.35)'
            }"
          >BETA</span>
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        <button
          type="button"
          class="size-7 grid place-items-center border border-[var(--cy-border)] hover:border-[var(--cy-border-strong)] hover:text-[var(--cy-primary)] transition-colors rounded-[2px]"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <ClientOnly>
            <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-3.5" />
            <template #fallback>
              <UIcon name="i-lucide-moon" class="size-3.5" />
            </template>
          </ClientOnly>
        </button>
        <button
          type="button"
          class="px-2 py-1 border border-[var(--cy-border)] hover:border-[var(--cy-border-strong)] hover:text-[var(--cy-primary)] transition-colors rounded-[2px]"
          :aria-label="`Switch to ${otherLocale?.name}`"
          @click="toggleLocale"
        >
          {{ otherLocale?.code === 'ar' ? 'AR ع' : 'EN' }}
        </button>
        <span class="hidden sm:inline text-[var(--cy-primary)]">{{ t('app.header.status') }}</span>
      </div>
    </div>
  </header>
</template>
