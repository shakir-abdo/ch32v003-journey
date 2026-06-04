<script setup lang="ts">
/**
 * First-visit tutorial overlay for the playground.
 *
 * Pure presentation — the parent owns the open/dismiss flag and
 * persists the "seen" bit in localStorage. We just emit `close`
 * when the learner dismisses.
 */

const {t, locale} = useI18n()
const isRtl = computed(() => locale.value === 'ar')

defineProps<{open: boolean}>()
const emit = defineEmits<{close: []}>()

const steps = computed(() => [
  {icon: 'i-lucide-list',           title: t('app.sim.tutorial.s1Title'), body: t('app.sim.tutorial.s1Body')},
  {icon: 'i-lucide-play',           title: t('app.sim.tutorial.s2Title'), body: t('app.sim.tutorial.s2Body')},
  {icon: 'i-lucide-step-forward',   title: t('app.sim.tutorial.s3Title'), body: t('app.sim.tutorial.s3Body')},
  {icon: 'i-lucide-eye',            title: t('app.sim.tutorial.s4Title'), body: t('app.sim.tutorial.s4Body')},
  {icon: 'i-lucide-gauge',          title: t('app.sim.tutorial.s5Title'), body: t('app.sim.tutorial.s5Body')},
  {icon: 'i-lucide-undo-2',         title: t('app.sim.tutorial.s6Title'), body: t('app.sim.tutorial.s6Body')}
])

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      @click="onBackdrop"
    >
      <div
        class="cy-panel max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8"
        :dir="isRtl ? 'rtl' : 'ltr'"
      >
        <div class="flex items-start justify-between gap-4 mb-6">
          <div>
            <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-primary)] mb-1" dir="ltr">
              // TUTORIAL
            </div>
            <h2 class="font-display text-2xl font-bold text-[var(--cy-fg)] uppercase">
              {{ t('app.sim.tutorial.title') }}
            </h2>
            <p class="text-[var(--cy-fg-muted)] text-sm mt-1">
              {{ t('app.sim.tutorial.subtitle') }}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 size-7 grid place-items-center border border-[var(--cy-border)] hover:border-[var(--cy-destructive)] hover:text-[var(--cy-destructive)] transition-colors rounded-[2px]"
            :aria-label="t('app.sim.tutorial.close')"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>

        <ol class="space-y-4">
          <li
            v-for="(s, i) in steps"
            :key="i"
            class="flex gap-4 p-3 border border-[var(--cy-border)] rounded-[2px] bg-[var(--cy-card-elev)]"
          >
            <div
              class="shrink-0 size-10 grid place-items-center border rounded-[2px]"
              :style="{color: 'var(--cy-primary)', borderColor: 'var(--cy-primary)55', background: 'rgba(0,240,255,0.06)'}"
            >
              <UIcon :name="s.icon" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-mono text-[10px] tabular-nums text-[var(--cy-fg-muted)]" dir="ltr">
                  {{ String(i + 1).padStart(2, '0') }}
                </span>
                <span class="font-display text-base font-semibold text-[var(--cy-fg)]">
                  {{ s.title }}
                </span>
              </div>
              <p class="text-[var(--cy-fg-muted)] text-sm leading-relaxed">{{ s.body }}</p>
            </div>
          </li>
        </ol>

        <div class="mt-6 pt-4 border-t border-[var(--cy-border)] flex items-center justify-between flex-wrap gap-3">
          <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]" dir="ltr">
            // {{ t('app.sim.tutorial.dismissNote') }}
          </div>
          <button
            type="button"
            class="cy-btn"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-arrow-right" class="size-3.5" :class="isRtl ? 'rotate-180' : ''" />
            {{ t('app.sim.tutorial.cta') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
