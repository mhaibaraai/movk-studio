<script setup lang="ts">
import type { UIMessage } from 'ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from 'ai'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

defineProps<{
  message: UIMessage
  editing: boolean
}>()

const emit = defineEmits<{
  save: [message: UIMessage, text: string]
  cancelEdit: []
}>()

// map 工具调用状态的中文文案：[进行中, 已完成]
const TOOL_STATUS_LABELS: Record<string, [string, string]> = {
  'fly-to': ['正在定位…', '已定位到目标位置'],
  'fit-bounds': ['正在缩放…', '已缩放到目标范围'],
  'set-basemap': ['正在切换底图…', '已切换底图'],
  'add-marker': ['正在添加标注…', '已添加标注'],
  'remove-marker': ['正在移除标注…', '已移除标注'],
  'buffer-circle': ['正在绘制范围圈…', '已绘制范围圈'],
  'add-geojson': ['正在绘制图层…', '已绘制图层'],
  'export-image': ['正在导出图片…', '已导出地图图片'],
  'measure-distance': ['正在计算距离…', '距离计算完成'],
  'convert-coordinate': ['正在转换坐标…', '坐标转换完成']
}

function mapToolStatusText(part: Parameters<typeof getToolName>[0]): string {
  const name = getToolName(part)
  const labels = TOOL_STATUS_LABELS[name]
  if (!labels) return name
  return part.state === 'output-available' ? labels[1] : labels[0]
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
      :text="mapToolStatusText(part)"
      :streaming="isToolStreaming(part)"
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
