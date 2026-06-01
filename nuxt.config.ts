// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-05-22',
  future: {
    compatibilityVersion: 4
  },
  devtools: {enabled: true},

  modules: [
    '@nuxt/ui-pro',
    '@nuxt/image',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/content',
    '@vueuse/nuxt',
    '@vite-pwa/nuxt',
    '@nuxtjs/i18n'
  ],

  content: {
    build: {
      markdown: {
        toc: {depth: 3, searchDepth: 3},
        highlight: {
          theme: {
            default: 'github-dark',
            dark:    'github-dark',
            light:   'github-light'
          },
          langs: ['c', 'cpp', 'asm', 'bash', 'json', 'js', 'ts', 'vue', 'html']
        }
      }
    }
  },

  imports: {
    dirs: ['schemas/**']
  },

  // https://i18n.nuxtjs.org
  // - Two locales out of the box: English (LTR) + Arabic (RTL)
  // - "no_prefix" keeps URLs the same; locale is persisted in a cookie
  // - Lazy-loads locale JSON files from i18n/locales/
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root',
      fallbackLocale: 'en'
    },
    lazy: true,
    locales: [
      {code: 'en', language: 'en-US', name: 'English', file: 'en.json', dir: 'ltr'},
      {code: 'ar', language: 'ar-SA', name: 'العربية', file: 'ar.json', dir: 'rtl'}
    ]
  },

  css: ['~/assets/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: ''
  },

  app: {
    // Page + layout transitions (Nuxt 4). Wraps <NuxtPage> / <NuxtLayout>
    // with named <Transition>, with CSS for `.page-*` and `.layout-*` defined
    // in app/assets/main.css. Override per-page with definePageMeta({
    //   pageTransition: {name: 'slide-left', mode: 'out-in'}
    // }) or disable per-page with `pageTransition: false`.
    pageTransition: {name: 'page', mode: 'out-in'},
    layoutTransition: {name: 'layout', mode: 'out-in'},
    head: {
      title: "CH32V003 Journey",
      meta: [
        {charset: 'utf-8'},
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
        },
        {property: 'og:title', content: "CH32V003 Journey"},
        {property: 'og:site_name', content: "CH32V003 Journey"},
        {property: 'og:url', content: "https://ch32v003.shakir.sd/"},
        {property: 'og:description', content: "Master bare-metal RISC-V programming, one register at a time."},
        {property: 'og:type', content: 'product'},
        {property: 'og:image', content: "https://ch32v003.shakir.sd/icon.png"},
        {property: 'twitter:card', content: 'summary'},
        {property: 'twitter:url', content: "https://ch32v003.shakir.sd/"},
        {property: 'twitter:title', content: "CH32V003 Journey"},
        {property: 'twitter:description', content: "Master bare-metal RISC-V programming, one register at a time."},
        {property: 'twitter:image', content: "https://ch32v003.shakir.sd/icon.png"}
      ],
      link: [
        {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
        {rel: 'icon', type: 'image/png', sizes: '192x192', href: '/android-chrome-192x192.png'},
        {rel: 'icon', type: 'image/png', sizes: '512x512', href: '/android-chrome-512x512.png'},
        {rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png'},
        {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
        {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: ''},
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Rajdhani:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap'
        }
      ]
    }
  },

  pwa: {
    manifest: {
      name: "CH32V003 Journey",
      short_name: "CH32V003 Jou",
      description: "Master bare-metal RISC-V programming, one register at a time.",
      theme_color: "#00F0FF",
      background_color: '#ffffff',
      icons: [
        {src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png'},
        {src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png'},
        {src: '/icon.png', sizes: 'any', type: 'image/png'},
        {src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon'}
      ]
    },
    workbox: {
      navigateFallback: '/'
    }
  },

  typescript: {
    typeCheck: false,
    strict: true
  }
})
