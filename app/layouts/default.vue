<template>
  <div class="min-h-screen flex flex-col bg-[var(--cy-bg)] text-[var(--cy-fg)]">
    <AppHeader />
    <main class="flex-1 w-full">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
