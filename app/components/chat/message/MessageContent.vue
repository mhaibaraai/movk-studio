<script setup lang="ts">
import type { UIMessage } from 'ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from 'ai'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'
import { getTool } from '#shared/utils/tools'

defineProps<{
  message: UIMessage
  editing: boolean
}>()

const emit = defineEmits<{
  save: [message: UIMessage, text: string]
  cancelEdit: []
}>()

// 工具调用状态文案取自契约的 status: [进行中, 已完成]
function toolStatusText(part: Parameters<typeof getToolName>[0]): string {
  const name = getToolName(part)
  const status = getTool(name)?.status
  if (!status) return name
  return part.state === 'output-available' ? status[1] : status[0]
}

function toolIcon(part: Parameters<typeof getToolName>[0]): string | undefined {
  return getTool(getToolName(part))?.icon
}
</script>

<template>
  <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
    <UChatReasoning
      v-if="isReasoningUIPart(part)"
      :text="part.text"
      :streaming="isPartStreaming(part)"
      chevron="trailing"
      icon="i-lucide-brain"
    >
      <ChatComark :markdown="part.text" :streaming="isPartStreaming(part)" />
    </UChatReasoning>

    <UChatTool
      v-else-if="isToolUIPart(part)"
      :text="toolStatusText(part)"
      :streaming="isToolStreaming(part)"
      :icon="toolIcon(part)"
      chevron="trailing"
    />

    <template v-else-if="isTextUIPart(part) && part.text.length > 0">
      <ChatComark v-if="message.role === 'assistant'" :markdown="part.text" :streaming="isPartStreaming(part)" />

      <template v-else-if="message.role === 'user'">
        <ChatMessageEdit
          v-if="editing"
          :message="message"
          :text="part.text"
          @save="(msg, text) => emit('save', msg, text)"
          @cancel="emit('cancelEdit')"
        />

        <p v-else class="whitespace-pre-wrap text-sm/6">
          {{ part.text }}
        </p>
      </template>
    </template>
  </template>
</template>
