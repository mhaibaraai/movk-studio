<script lang="ts" setup>
import type { UIMessage } from 'ai'
import type { Workspace } from '#shared/utils/workspace'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/vue'

const input = ref('')

const toast = useToast()

const { chatOpen, workspace, isDraft, chatId, persistToUrl, newChat, refreshChats } = useCopilot()
const { model } = useModels()
const { csrf, headerName } = useCsrf()

const QUICK_CHATS: Record<Workspace, string[]> = {
  global: [
    'Movk Studio 能做什么？',
    '地图、表单、数据三个工作区分别用于什么？',
    '如何开始一个新项目？'
  ],
  map: [
    '什么是 MOVK？',
    '飞到上海并标注外滩，叠加天地图影像',
    '这附近有哪些 POI？',
    '切换 3D 倾斜视角',
    '删除所有标注'
  ],
  form: [
    '如何设计一个表单结构？',
    '给字段添加校验规则',
    '常见字段类型有哪些？'
  ],
  data: [
    '如何查询和筛选数据？',
    '把结果做成可视化图表',
    '导出当前数据'
  ]
}

const quickChats = computed(() => QUICK_CHATS[workspace.value])

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
    body: { messages, model: model.value }
  })
})

const { messages, status, error, sendMessage, regenerate, stop } = useChat({
  id: chatId.value,
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

interface Vote {
  messageId: string
  isUpvoted: boolean
}

const votes = ref<Vote[]>([])
const editingMessageId = ref<string | null>(null)

// 会话切换：草稿清空消息与投票，历史拉取并回显；仅当会话只有一条未回复的 user 消息（首次发送后被中断）时才自动续答
watch(chatId, async (id, prev) => {
  if (id === prev) return

  editingMessageId.value = null

  if (isDraft.value) {
    messages.value = []
    votes.value = []
    return
  }

  try {
    const [chat, chatVotes] = await Promise.all([
      $fetch<{ messages?: UIMessage[] }>(`/api/chats/${id}`),
      $fetch<Vote[]>(`/api/chats/${id}/votes`).catch(() => [])
    ])
    messages.value = chat.messages ?? []
    votes.value = chatVotes
    if (messages.value.length === 1 && messages.value[0]?.role === 'user') {
      regenerate()
    }
  } catch {
    messages.value = []
    votes.value = []
  }
}, { immediate: true })

function getVote(messageId: string): boolean | null {
  const found = votes.value.find(v => v.messageId === messageId)
  return found ? found.isUpvoted : null
}

async function vote(message: UIMessage, isUpvoted: boolean) {
  const snapshot = votes.value.map(v => ({ ...v }))
  const toggling = getVote(message.id) === isUpvoted
  const next = toggling ? null : isUpvoted

  votes.value = next === null
    ? votes.value.filter(v => v.messageId !== message.id)
    : [...votes.value.filter(v => v.messageId !== message.id), { messageId: message.id, isUpvoted: next }]

  try {
    await $fetch(`/api/chats/${chatId.value}/votes`, {
      method: 'POST',
      headers: { [headerName]: csrf },
      body: next === null ? { messageId: message.id } : { messageId: message.id, isUpvoted: next }
    })
  } catch {
    votes.value = snapshot
    toast.add({ description: '投票失败', icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

function startEdit(message: UIMessage) {
  if (editingMessageId.value) return
  editingMessageId.value = message.id
}

async function saveEdit(message: UIMessage, text: string) {
  try {
    await $fetch(`/api/chats/${chatId.value}/messages`, {
      method: 'DELETE',
      headers: { [headerName]: csrf },
      body: { messageId: message.id, type: 'edit' }
    })
  } catch {
    toast.add({ description: '保存编辑失败', icon: 'i-lucide-circle-alert', color: 'error' })
    return
  }

  editingMessageId.value = null
  sendMessage({ text, messageId: message.id })
}

async function regenerateMessage(message: UIMessage) {
  try {
    await $fetch(`/api/chats/${chatId.value}/messages`, {
      method: 'DELETE',
      headers: { [headerName]: csrf },
      body: { messageId: message.id, type: 'regenerate' }
    })
  } catch {
    toast.add({ description: '重新生成失败', icon: 'i-lucide-circle-alert', color: 'error' })
    return
  }

  regenerate({ messageId: message.id })
}

async function send(text: string) {
  const value = text.trim()
  if (!value) return

  // 草稿首发：先建会话壳（POST /api/chats），再走流式（POST /api/chats/:id）
  if (isDraft.value) {
    try {
      await $fetch('/api/chats', {
        method: 'POST',
        headers: { [headerName]: csrf },
        body: { id: chatId.value, workspace: workspace.value }
      })
    } catch {
      toast.add({ description: '创建会话失败', icon: 'i-lucide-circle-alert', color: 'error' })
      return
    }
    persistToUrl()
  }

  sendMessage({ text: value })
}

function onSubmit() {
  send(input.value)
  input.value = ''
}

const promptRef = useTemplateRef('promptRef')
watch(chatOpen, (value) => {
  if (value) {
    nextTick(() => {
      promptRef.value?.textareaRef?.focus()
    })
  }
})
</script>

<template>
  <USidebar
    v-model:open="chatOpen"
    side="right"
    :style="{ '--sidebar-width': '30rem' }"
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
        <template #indicator>
          <ChatMessageIndicator />
        </template>

        <template #content="{ message }">
          <ChatMessageContent
            :message="message"
            :editing="editingMessageId === message.id"
            @save="saveEdit"
            @cancel-edit="editingMessageId = null"
          />
        </template>

        <template #actions="{ message }">
          <ChatMessageActions
            :message="message"
            :streaming="status === 'streaming' && message.id === messages.at(-1)?.id"
            :editing="editingMessageId === message.id"
            :vote="getVote(message.id)"
            @edit="startEdit"
            @regenerate="regenerateMessage"
            @vote="vote"
          />
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
        ref="promptRef"
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
