// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-19',

  // Fully client-rendered, prerendered to static files by `nuxt generate`.
  ssr: false,

  devtools: { enabled: true },

  modules: ['vuetify-nuxt-module'],

  typescript: {
    tsConfig: {
      compilerOptions: {
        // Nuxt 4 turns this on by default. The game logic in app/scripts does
        // its own bounds checking on the 2D block grid, so enabling it would
        // only add non-null assertions, not safety. Revisit if that changes.
        noUncheckedIndexedAccess: false,
      },
    },
  },

  app: {
    head: {
      titleTemplate: '%s - VerticalVenture',
      title: 'VerticalVenture',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },

  vuetify: {
    moduleOptions: {
      // Bundles only the MDI glyphs actually referenced in templates.
      includeTransformAssetsUrls: true,
    },
    vuetifyOptions: {
      icons: { defaultSet: 'mdi' },
      theme: {
        defaultTheme: 'dark',
        themes: {
          dark: {
            dark: true,
            colors: {
              primary: '#1976D2',
              accent: '#424242',
              secondary: '#FF8F00',
              info: '#26A69A',
              warning: '#FFC107',
              error: '#DD2C00',
              success: '#00E676',
            },
          },
        },
      },
    },
  },
})
