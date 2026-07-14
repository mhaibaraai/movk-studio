<script setup lang="ts">
import { COLUMN_CLASS } from '#shared/utils/form-semantics'

// afz.layout 的容器组件：字段进默认插槽，栅格列数由 columns 决定
const { title, columns = 1, collapsible = false } = defineProps<{
  title?: string
  /**
   * 组内字段的栅格列数
   * @defaultValue 1
   */
  columns?: 1 | 2 | 3
  /**
   * 是否可折叠
   * @defaultValue false
   */
  collapsible?: boolean
}>()

const open = ref(true)
const gridClass = computed(() => COLUMN_CLASS[columns])

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <div class="rounded-lg ring ring-default p-4 flex flex-col gap-4">
    <div v-if="title" class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ title }}
      </h3>

      <UButton
        v-if="collapsible"
        :icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :aria-label="open ? '折叠' : '展开'"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="toggle"
      />
    </div>

    <div v-show="!collapsible || open" :class="gridClass">
      <slot />
    </div>
  </div>
</template>
