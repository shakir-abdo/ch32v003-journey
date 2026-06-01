<script setup lang="ts">
const {locale, locales} = useI18n()

const toaster = {
  position: 'top-right' as const,
  expand: true,
  duration: 5000
}

// Keep <html lang> and <html dir> in sync with the active locale.
useHead(() => {
  const list = locales.value as Array<{code: string; dir?: string; language?: string}>
  const active = list.find((l) => l.code === locale.value)
  return {
    htmlAttrs: {
      lang: active?.language || locale.value,
      dir: active?.dir || 'ltr'
    }
  }
})
</script>

<template>
  <UApp :toaster="toaster">
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
