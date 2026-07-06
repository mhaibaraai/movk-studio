import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@movk/nuxt',
    '@comark/nuxt',
    '@movk/mapbox',
    '@nuxthub/core',
    'nuxt-csurf'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2026-06-30',

  hub: {
    db: {
      dialect: 'postgresql',
      driver: 'postgres-js',
      applyMigrationsDuringBuild: false
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        '@ai-sdk/vue',
        '@shikijs/langs/c',
        '@shikijs/langs/cpp',
        '@shikijs/langs/css',
        '@shikijs/langs/diff',
        '@shikijs/langs/dockerfile',
        '@shikijs/langs/go',
        '@shikijs/langs/graphql',
        '@shikijs/langs/html',
        '@shikijs/langs/java',
        '@shikijs/langs/kotlin',
        '@shikijs/langs/php',
        '@shikijs/langs/python',
        '@shikijs/langs/ruby',
        '@shikijs/langs/rust',
        '@shikijs/langs/sql',
        '@shikijs/langs/swift',
        '@shikijs/langs/toml',
        '@shikijs/langs/xml',
        'ai'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    customCollections: [{
      prefix: 'custom',
      dir: resolve('./app/assets/icons')
    }]
  },

  mapbox: {
    accessToken: process.env.NUXT_MAPBOX_TOKEN
  }
})
