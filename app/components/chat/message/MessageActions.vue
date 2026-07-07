<script setup lang="ts">
import type { UIMessage } from 'ai'
import { getTextFromMessage } from '@nuxt/ui/utils/ai'
import { sleep } from '@movk/core'

const props = defineProps<{
  message: UIMessage
  streaming: boolean
  editing: boolean
  vote: boolean | null
}>()

const emit = defineEmits<{
  edit: [message: UIMessage]
  regenerate: [message: UIMessage]
  vote: [message: UIMessage, isUpvoted: boolean]
}>()

const clipboard = useClipboard()
const toast = useToast()
const copied = ref(false)

function copy() {
  clipboard.copy(getTextFromMessage(props.message))
  copied.value = true
  toast.add({ description: '已复制到剪贴板', icon: 'i-lucide-copy-check', color: 'success' })

  sleep(2000).then(() => {
    copied.value = false
  })
}
</script>

<template>
  <template v-if="message.role === 'assistant' && !streaming">
    <UTooltip text="复制">
      <UButton
        size="sm"
        :color="copied ? 'primary' : 'neutral'"
        variant="ghost"
        :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
        aria-label="复制"
        @click="copy"
      />
    </UTooltip>

    <UTooltip text="点赞">
      <UButton
        size="sm"
        :color="vote === true ? 'success' : 'neutral'"
        variant="ghost"
        icon="i-lucide-thumbs-up"
        aria-label="点赞"
        @click="emit('vote', message, true)"
      />
    </UTooltip>

    <UTooltip text="点踩">
      <UButton
        size="sm"
        :color="vote === false ? 'error' : 'neutral'"
        variant="ghost"
        icon="i-lucide-thumbs-down"
        aria-label="点踩"
        @click="emit('vote', message, false)"
      />
    </UTooltip>

    <UTooltip text="重新生成">
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-rotate-cw"
        aria-label="重新生成"
        @click="emit('regenerate', message)"
      />
    </UTooltip>
  </template>

  <template v-if="message.role === 'user' && !streaming && !editing">
    <UTooltip text="编辑">
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-pencil"
        aria-label="编辑"
        @click="emit('edit', message)"
      />
    </UTooltip>
  </template>
</template>
