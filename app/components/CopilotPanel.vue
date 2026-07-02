<script lang="ts" setup>
import type { UIMessage } from 'ai'
import { isTextUIPart } from 'ai'
import { useChat } from '@ai-sdk/vue'
import { isPartStreaming } from '@nuxt/ui/utils/ai'

const open = ref(true)

const ui = {
  prose: {
    p: { base: 'my-2 text-sm/6' },
    li: { base: 'my-0.5 text-sm/6' },
    ul: { base: 'my-2' },
    ol: { base: 'my-2' },
    h1: { base: 'text-xl mb-4' },
    h2: { base: 'text-lg mt-6 mb-3' },
    h3: { base: 'text-base mt-4 mb-2' },
    h4: { base: 'text-sm mt-3 mb-1.5' },
    code: { base: 'text-xs' },
    pre: { root: 'my-2', base: 'text-xs/5' },
    table: { root: 'my-2' },
    hr: { base: 'my-4' }
  }
}

const { messages } = useChat({
  messages: [
    {
      id: '1',
      role: 'user',
      parts: [{ type: 'text', text: 'What is Nuxt UI?' }]
    },
    {
      id: '2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Nuxt UI is a Vue component library built on Reka UI, Tailwind CSS, and Tailwind Variants. It provides 125+ accessible components for building modern web apps.'
        }
      ]
    }
  ]
})
</script>

<template>
  <USidebar
    v-model:open="open"
    side="right"
    close
    close-icon="i-lucide-panel-right-close"
    rail
    collapsible="icon"
    :style="{ '--sidebar-width': '24rem' }"
    title="Copilot"
  >
    <UTheme :ui="ui">
      <UChatMessages
        :messages="messages"
        should-auto-scroll
        compact
        class="px-0"
      />
    </UTheme>

    <template #footer>
      <UChatPrompt
        :autofocus="false"
        variant="subtle"
        size="sm"
        :ui="{ base: 'px-0' }"
      >
        <!-- <UChatPromptSubmit
          size="sm"
          :status="chat.status"
          @stop="chat.stop()"
          @reload="chat.regenerate()"
        /> -->
      </UChatPrompt>
    </template>
  </USidebar>
</template>
