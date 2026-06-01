<script setup lang="ts">
const b = useBrand()
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      :aria-label="`${b.name.value} logo`"
      class="size-8 shrink-0"
    >
      <rect width="32" height="32" rx="8" :style="{fill: b.colors.primary}" />
      <path
        d="M10 22 L10 10 L16 18 L16 10 M19 22 L22 10 L25 22 M20 18 L24 18"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
        :style="{stroke: b.colors.primaryFg}"
      />
    </svg>
    <span class="text-lg font-bold tracking-tight text-highlighted">
      {{ b.logo.text }}
    </span>
  </div>
</template>
