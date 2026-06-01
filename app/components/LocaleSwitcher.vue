<script setup lang="ts">
/**
 * Headless-ish locale switcher.
 * Reads available locales from i18n + the active one.
 * Emits a label that callers can style per system; clicking cycles
 * to the next locale.
 *
 * Use the default render or pass a #default slot to fully restyle:
 *
 *   <LocaleSwitcher>
 *     <template #default="{label, locale, switchLocale}">
 *       <ClayButton variant="white" size="sm" @click="switchLocale">{{ label }}</ClayButton>
 *     </template>
 *   </LocaleSwitcher>
 */
interface LocaleObj {
  code: string
  name?: string
}

const {locale, locales, setLocale} = useI18n()

const list = computed(() => locales.value as LocaleObj[])
const current = computed(() => list.value.find((l) => l.code === locale.value))
const next = computed(() => {
  const i = list.value.findIndex((l) => l.code === locale.value)
  return list.value[(i + 1) % list.value.length]
})

const switchLocale = async () => {
  if (next.value) await setLocale(next.value.code)
}

// The label shown for the next locale (so the button reads as "switch to <X>")
const nextLabel = computed(() => next.value?.name ?? next.value?.code ?? '')

defineExpose({switchLocale})
</script>

<template>
  <slot :label="nextLabel" :locale="current?.code" :next="next?.code" :switch-locale="switchLocale">
    <!-- Default render: a bare unstyled button. Callers should use the slot to apply system theming. -->
    <button type="button" @click="switchLocale" class="text-sm font-medium hover:underline">
      {{ nextLabel }}
    </button>
  </slot>
</template>
