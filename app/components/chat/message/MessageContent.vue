<script setup lang="ts">
import type { UIMessage } from 'ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from 'ai'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

defineProps<{
  message: UIMessage
}>()
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
      :text="getToolName(part)"
      :streaming="isToolStreaming(part)"
      chevron="trailing"
    />

    <template v-else-if="isTextUIPart(part) && part.text.length > 0">
      <ChatComark v-if="message.role === 'assistant'" :markdown="part.text" :streaming="isPartStreaming(part)" />
      <p v-else-if="message.role === 'user'" class="whitespace-pre-wrap text-sm/6">
        {{ part.text }}
      </p>
    </template>
  </template>
</template>
