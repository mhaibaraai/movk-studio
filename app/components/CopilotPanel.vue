<script lang="ts" setup>
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/vue'

const input = ref('')

const toast = useToast()

const { chatOpen, workspace, isDraft, chatId, persistToUrl, newChat, refreshChats } = useCopilot()
const { addChat } = useChatActions()
const { model } = useModels()
const { csrf, headerName } = useCsrf()

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

const drawnFeatures = useDrawnFeatures()

// transport 只构造一次，回调闭包读取 ref，每次发送带上当前手绘快照供服务端拼进 system prompt
const transport = new DefaultChatTransport<UIMessage>({
  prepareSendMessagesRequest: ({ messages }) => ({
    api: `/api/chats/${chatId.value}`,
    headers: { [headerName]: csrf },
    body: {
      messages,
      model: model.value,
      ...(workspace.value === 'map' && drawnFeatures.value.length
        ? { drawnFeatures: drawnFeatures.value }
        : {})
    }
  })
})

interface Vote {
  messageId: string
  isUpvoted: boolean
}

// SSR 预取历史：刷新时服务端直出消息，切换会话时随 chatId 重取
const requestFetch = useRequestFetch()
const { data: history, status: historyStatus } = await useAsyncData(
  'copilot-history',
  async (): Promise<{ messages: UIMessage[], votes: Vote[] }> => {
    if (isDraft.value) return { messages: [], votes: [] }
    const id = chatId.value
    const [chat, chatVotes] = await Promise.all([
      requestFetch<{ messages?: UIMessage[] }>(`/api/chats/${id}`),
      requestFetch<Vote[]>(`/api/chats/${id}/votes`).catch(() => [])
    ])
    return { messages: chat.messages ?? [], votes: chatVotes }
  },
  { watch: [chatId], default: () => ({ messages: [] as UIMessage[], votes: [] as Vote[] }) }
)

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

const votes = ref<Vote[]>([])
const editingMessageId = ref<string | null>(null)

const isLoadingHistory = computed(
  () => !isDraft.value && historyStatus.value === 'pending' && !messages.value.length
)

// 历史回填：immediate 回调在 setup 期同步执行，SSR 首屏即带消息；切换会话时随 history 重填
// 仅当会话只有一条未回复的 user 消息（首次发送后被中断）时才自动续答
watch(history, (h) => {
  editingMessageId.value = null
  messages.value = h.messages
  votes.value = h.votes
  if (import.meta.client && !isDraft.value
    && h.messages.length === 1 && h.messages[0]?.role === 'user') {
    regenerate()
  }
}, { immediate: true })

// map 工作区工具输出 → 驱动地图（CopilotPanel 常驻，composable 内部按 workspace 守卫）
useMapToolDispatch(messages, workspace, chatId)

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
    addChat(chatId.value, workspace.value)
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

      <div v-else-if="isLoadingHistory" class="flex flex-col gap-3">
        <USkeleton class="h-4 w-3/4" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-16 w-full" />
      </div>

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
