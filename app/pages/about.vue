<script setup lang="ts">
const {t, locale, messages} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

useSeoMeta({
  title: () => locale.value === 'ar'
    ? 'عن المشروع · CH32V003 Journey'
    : 'About · CH32V003 Journey',
  description: () => locale.value === 'ar'
    ? 'لماذا هذا المنهج، ولمن، وكيف بُني.'
    : 'Why this curriculum, who it is for, and how it was built.'
})

// Vue I18n v9+ pre-compiles messages into AST nodes ({type, source, body, ...}).
// Walk the raw tree and pull the plain text out of each item.
const extractText = (item: any): string => {
  if (item == null) return ''
  if (typeof item === 'string') return item
  return item.source ?? item.body?.static ?? ''
}

const readList = (path: string): string[] => {
  const root = messages.value[locale.value] as Record<string, any> | undefined
  if (!root) return []
  const node = path.split('.').reduce<any>((acc, key) => acc?.[key], root)
  if (!Array.isArray(node)) return []
  return node.map(extractText).filter(Boolean)
}

const whoList     = computed(() => readList('app.about.whoList'))
const licenseList = computed(() => readList('app.about.licenseList'))
</script>

<template>
  <div class="max-w-3xl mx-auto px-6 py-12" :dir="isRtl ? 'rtl' : 'ltr'">
    <header class="mb-10 pb-6 border-b border-[var(--cy-border)]">
      <div class="font-mono text-[11px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-2" dir="ltr">
        // ROUTE: /about
      </div>
      <h1 class="font-display text-4xl font-bold text-[var(--cy-fg)] mb-2" :dir="isRtl ? 'rtl' : 'ltr'">
        {{ t('app.about.title') }}
      </h1>
    </header>

    <div class="cy-prose">
      <h2>{{ t('app.about.whyHeading') }}</h2>
      <p>{{ t('app.about.whyBody') }}</p>

      <h2>{{ t('app.about.whoHeading') }}</h2>
      <ul>
        <li v-for="(item, i) in whoList" :key="i">{{ item }}</li>
      </ul>

      <h2>{{ t('app.about.howHeading') }}</h2>
      <p>{{ t('app.about.howBody') }}</p>

      <h2>{{ t('app.about.licenseHeading') }}</h2>
      <ul>
        <li v-for="(item, i) in licenseList" :key="i">{{ item }}</li>
      </ul>

      <h2>{{ t('app.about.authorHeading') }}</h2>
      <p>{{ t('app.about.authorBody') }}</p>
      <ul>
        <li>GitHub: <a href="https://github.com/shakir-abdo" target="_blank" rel="noopener">shakir-abdo</a></li>
        <li>X (Twitter): <a href="https://x.com/shakir_abdoo" target="_blank" rel="noopener">@shakir_abdoo</a></li>
        <li>Telegram: <a href="https://t.me/shakir_abdo" target="_blank" rel="noopener">@shakir_abdo</a></li>
      </ul>

      <hr>

      <p class="text-[var(--cy-fg-muted)] text-sm" dir="ltr">
        // <span class="text-[var(--cy-primary)]">v0.1.0</span> · {{ new Date().toISOString().slice(0, 10) }}
      </p>
    </div>
  </div>
</template>
