<script setup>
import { zh_cn } from '@nuxt/ui/locale'

const { color, link, style } = useTheme()
const appConfig = useAppConfig()

const title = 'Movk Studio'
const description = '基于 Nuxt UI 与 Vercel AI SDK 的 AI Copilot 工作台，用自然语言驱动地图、表单与数据等 movk 生态组件。'

useHead({
  title,
  meta: [{ key: 'theme-color', name: 'theme-color', content: color }],
  link,
  style
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/chat-light.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp
    :locale="zh_cn"
    :toaster="appConfig.toaster"
    :tooltip="appConfig.tooltip"
    :dir="appConfig.movk?.dir"
  >
    <NuxtLoadingIndicator color="var(--ui-primary)" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
