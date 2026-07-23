import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@movk/nuxt',
    '@movk/mapbox',
    '@comark/nuxt',
    '@nuxthub/core',
    '@nuxtjs/mcp-toolkit',
    'nuxt-csurf'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    tiandituApiToken: ''
  },

  routeRules: {
    '/mcp/**': {
      // @ts-expect-error nuxt-csurf 运行时读取 routeRules.csurf 关闭 CSRF；Nuxt 4 新 nitro 下该类型增强未合并
      csurf: false
    }
  },

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
        '@shikijs/langs/typescript',
        '@shikijs/langs/vue',
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

  mcp: {
    name: 'Movk Studio'
  }
})
