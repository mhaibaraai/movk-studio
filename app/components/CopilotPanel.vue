<script lang="ts" setup>
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/vue'

const input = ref('')

const toast = useToast()

const { chatOpen, workspace, isDraft, chatId, persistToUrl, newChat, refreshChats } = useCopilot()
const { model } = useModels()
const { csrf, headerName } = useCsrf()

const quickChats = [
  '什么是 MOVK？',
  '飞到上海并标注外滩，叠加天地图影像',
  '这附近有哪些 POI？',
  '切换 3D 倾斜视角',
  '删除所有标注'
]

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

const transport = new DefaultChatTransport<UIMessage>({
  prepareSendMessagesRequest: ({ messages }) => ({
    api: `/api/chats/${chatId.value}`,
    headers: { [headerName]: csrf },
    body: { messages, model: model.value, workspace: workspace.value }
  })
})

const { messages, status, error, sendMessage, regenerate, stop } = useChat({
  transport,
  onError: (err) => {
    let message = err.message
    if (typeof message === 'string' && message[0] === '{') {
      try {
        message = JSON.parse(message).message || message
      } catch {
        // keep original message on malformed JSON
      }
    }

    toast.add({ description: message, icon: 'i-lucide-circle-alert', color: 'error', duration: 0 })
  },
  onFinish: () => {
    refreshChats()
  }
})

// 会话切换：草稿清空消息，历史拉取并回显；末条为 user 时补生成 assistant
watch(chatId, async (id, prev) => {
  if (id === prev) return

  if (isDraft.value) {
    messages.value = []
    return
  }

  try {
    const chat = await $fetch<{ messages?: UIMessage[] }>(`/api/chats/${id}`)
    messages.value = chat.messages ?? []
    if (messages.value.at(-1)?.role === 'user') {
      regenerate()
    }
  } catch {
    messages.value = []
  }
}, { immediate: true })

function send(text: string) {
  const value = text.trim()
  if (!value) return

  const wasDraft = isDraft.value
  sendMessage({ text: value })

  if (wasDraft) {
    persistToUrl()
  }
}

function onSubmit() {
  send(input.value)
  input.value = ''
}
</script>

<template>
  <USidebar
    v-model:open="chatOpen"
    side="right"
    :style="{ '--sidebar-width': '25rem' }"
    title="Copilot"
  >
    <template #actions>
      <UTooltip text="新建对话">
        <UButton
          icon="i-lucide-circle-plus"
          color="primary"
          variant="soft"
          aria-label="新建对话"
          @click="newChat"
        />
      </UTooltip>
    </template>

    <UTheme :ui="ui">
      <UChatMessages
        v-if="messages.length"
        :messages="messages"
        :status="status"
        should-auto-scroll
        compact
        class="px-0 gap-2"
        :user="{ ui: { container: 'max-w-full' } }"
      >
        <template #content="{ message }">
          <ChatMessageContent :message="message" />
        </template>
      </UChatMessages>

      <div v-else class="flex flex-wrap gap-2">
        <UButton
          v-for="quickChat in quickChats"
          :key="quickChat"
          :label="quickChat"
          size="sm"
          color="neutral"
          variant="subtle"
          class="rounded-full"
          @click="send(quickChat)"
        />
      </div>
    </UTheme>

    <template #footer>
      <UChatPrompt
        v-model="input"
        :error="error"
        class="[view-transition-name:chat-prompt]"
        variant="subtle"
        autofocus
        placeholder="输入指令，让 AI 操作当前模块…"
        size="sm"
        :ui="{ base: 'px-1.5' }"
        @submit="onSubmit"
      >
        <template #footer>
          <div class="flex items-center gap-1">
            <ModelSelect />
          </div>

          <UChatPromptSubmit
            :status="status"
            :disabled="!input.trim()"
            color="neutral"
            size="sm"
            @stop="stop()"
            @reload="regenerate()"
          />
        </template>
      </UChatPrompt>
    </template>
  </USidebar>
</template>
