<script setup lang="ts">
const {t, locale} = useI18n()
const year = new Date().getFullYear()
const isRtl = computed(() => locale.value === 'ar')
</script>

<template>
  <footer class="border-t border-[var(--cy-border)] bg-[var(--cy-shell)] mt-24" :dir="isRtl ? 'rtl' : 'ltr'">
    <div class="max-w-7xl mx-auto px-6 py-10 grid md:grid-cols-2 lg:grid-cols-4 gap-8">

      <!-- Brand column -->
      <div>
        <div class="flex items-center justify-center gap-2 font-mono text-sm uppercase tracking-wider mb-3" dir="ltr">
          <span class="size-1.5 rounded-full bg-[var(--cy-primary)]" />
          <span class="text-[var(--cy-fg)] font-bold">CH32V003::JOURNEY</span>
        </div>
        <p class="text-[12px] leading-relaxed text-[var(--cy-fg-muted)]">
          {{ t('app.footer.tagline') }}
        </p>
      </div>

      <!-- Connect -->
      <div>
        <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-3 text-center">{{ t('app.footer.connect') }}</div>
        <ul class="space-y-2 font-mono text-[12px]" dir="ltr">
          <li>
            <a href="https://github.com/shakir-abdo" target="_blank" rel="noopener" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-simple-icons-github" class="size-3.5" />
              github.com/shakir-abdo
            </a>
          </li>
          <li>
            <a href="https://x.com/shakir_abdoo" target="_blank" rel="noopener" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-simple-icons-x" class="size-3.5" />
              x.com/shakir_abdoo
            </a>
          </li>
          <li>
            <a href="https://t.me/shakir_abdo" target="_blank" rel="noopener" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-simple-icons-telegram" class="size-3.5" />
              t.me/shakir_abdo
            </a>
          </li>
        </ul>
      </div>

      <!-- Resources -->
      <div>
        <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-3 text-center">{{ t('app.footer.resources') }}</div>
        <ul class="space-y-2 font-mono text-[12px]" dir="ltr">
          <li>
            <NuxtLink to="/resources" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-lucide-package" class="size-3.5" />
              Hardware + projects
            </NuxtLink>
          </li>
          <li>
            <a href="https://shakir.sd" target="_blank" rel="noopener" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-lucide-globe" class="size-3.5" />
              shakir.sd
            </a>
          </li>
          <li>
            <a href="https://paypal.me/shicolare1" target="_blank" rel="noopener" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-simple-icons-paypal" class="size-3.5" />
              Support on PayPal
            </a>
          </li>
          <li>
            <a href="https://github.com/cnlohr/ch32v003fun" target="_blank" rel="noopener" class="text-[var(--cy-fg)] hover:text-[var(--cy-primary)] transition-colors inline-flex items-center gap-2">
              <UIcon name="i-lucide-external-link" class="size-3.5" />
              ch32v003fun
            </a>
          </li>
        </ul>
      </div>

      <!-- SYS column -->
      <div>
        <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)] mb-3 text-center">// SYS</div>
        <div class="font-mono text-[11px] space-y-1.5 text-[var(--cy-fg-muted)]" dir="ltr">
          <div>{{ t('app.footer.version') }}</div>
          <div>{{ t('app.footer.build') }} <span class="text-[var(--cy-primary)]">{{ year }}.06.01</span></div>
          <div>{{ t('app.footer.uptime') }} <span class="text-[var(--cy-success)]">{{ t('app.footer.uptimeOk') }}</span></div>
          <div>© {{ year }} Shakir Abdo</div>
        </div>
      </div>
    </div>

    <div class="border-t border-[var(--cy-border)] py-3 px-6 max-w-7xl mx-auto flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]" :dir="isRtl ? 'rtl' : 'ltr'">
      <span>{{ t('app.footer.eof') }}</span>
      <span>{{ t('app.footer.madeWith') }}</span>
    </div>
  </footer>
</template>
