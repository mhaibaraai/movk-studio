<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { TableActionEvent } from '~/utils/table-compiler'

const schema = useTableWorkspace()
const selection = useTableSelection()
const toast = useToast()

const { $prettier } = useNuxtApp()

// 画布上的行内动作只是演示：真实行为由使用者在导出的代码里补上
function onAction({ action, row }: TableActionEvent) {
  toast.add({
    title: `${action.label ?? action.key} ${String(row[schema.value.options.rowKey] ?? '')}`,
    description: '画布上的动作只是演示，导出的代码里可以接上真实逻辑',
    icon: 'i-lucide-mouse-pointer-click'
  })
}

const compiled = computed(() => compileTable(schema.value, onAction))
const isEmpty = computed(() => schema.value.columns.length === 0)

const pagination = ref(initialPagination(schema.value))
watch(() => schema.value.options.pagination?.pageSize, (pageSize) => {
  if (pageSize) pagination.value = { pageIndex: 0, pageSize }
})

// 列被删除或改名后，选中态里的陈旧行同样会随 workspaceContext 回灌给模型；换一批数据即清空选中
watch(() => schema.value.rows, () => {
  selection.value = {}
})

const source = computed(() => generateTableCode(schema.value))

// server: false —— 画布整体在 ClientOnly 内，服务端格式化一份用不上的空表格代码纯属浪费。
// 格式化失败（生成的代码混进非法语法）时退回原始源码，代码页签不能因此空白
const { data: code } = await useAsyncData(
  'table-code',
  () => $prettier.format(source.value).catch(() => source.value),
  { watch: [source], default: () => '', server: false }
)

const codeMarkdown = computed(() => `\`\`\`vue\n${code.value || source.value}\n\`\`\``)

const tab = ref('preview')
const tabs: TabsItem[] = [
  { value: 'preview', label: '预览', icon: 'i-lucide-eye' },
  { value: 'code', label: '代码', icon: 'i-lucide-code' }
]

const { copy, copied } = useClipboard()
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <div v-if="isEmpty" class="flex-1 flex items-center justify-center p-6">
      <div class="flex flex-col items-center gap-3 text-center max-w-sm">
        <UIcon name="i-lucide-table" class="size-10 text-dimmed" />
        <p class="text-sm text-muted">
          告诉 Copilot 你想要什么表格，例如「做一张员工花名册」。列、示例数据与交互能力会实时出现在这里，可以直接排序、勾选、翻页试用。
        </p>
      </div>
    </div>

    <template v-else>
      <div class="flex items-center justify-between gap-4 px-6 pt-4">
        <UTabs
          v-model="tab"
          :items="tabs"
          size="sm"
          :content="false"
          class="w-fit"
        />

        <UButton
          v-if="tab === 'code'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied ? '已复制' : '复制代码'"
          color="neutral"
          variant="subtle"
          size="sm"
          @click="copy(code)"
        />
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex flex-col gap-6 p-6">
          <MDataTable
            v-if="tab === 'preview'"
            v-model:pagination="pagination"
            v-model:row-selection="selection"
            :columns="compiled.columns"
            :data="compiled.data"
            v-bind="compiled.props"
          />

          <ChatComark v-else :markdown="codeMarkdown" />
        </div>
      </div>
    </template>
  </div>
</template>
