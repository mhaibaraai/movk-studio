<script lang="ts" setup>
import type { Workspace } from '#shared/utils/workspace'

// 首页文案，不属于跨端契约，故留在页面本地
const WORKSPACE_DESCRIPTIONS: Record<Exclude<Workspace, 'global'>, string> = {
  map: '定位、路线、热力与聚合，让 AI 帮你在地图上把空间问题讲清楚。',
  form: '描述字段与校验规则，实时预览表单并导出可用的 Vue 组件代码。',
  data: '定义列、格式与交互，搭出可排序分页的数据表格并导出代码。'
}

const cards = WORKSPACES
  .filter((workspace): workspace is Exclude<Workspace, 'global'> => workspace !== 'global')
  .map(workspace => ({
    workspace,
    label: WORKSPACE_LABELS[workspace],
    icon: WORKSPACE_ICONS[workspace],
    description: WORKSPACE_DESCRIPTIONS[workspace],
    to: workspacePath(workspace)
  }))
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col overflow-y-auto">
    <div class="m-auto w-full max-w-3xl px-6 py-12">
      <div class="flex flex-col items-center text-center">
        <AppLogo class="h-10 w-auto" />

        <p class="mt-6 text-lg text-muted text-balance">
          基于 Nuxt UI 与 Vercel AI SDK 的 AI Copilot 工作台，用自然语言驱动地图、表单与数据等 movk 生态组件。
        </p>
      </div>

      <div class="mt-10 grid gap-4 sm:grid-cols-3">
        <UPageCard
          v-for="card in cards"
          :key="card.workspace"
          :to="card.to"
          :icon="card.icon"
          :title="card.label"
          :description="card.description"
          variant="subtle"
          spotlight
        />
      </div>

      <p class="mt-10 text-center text-sm text-muted">
        也可以直接在右侧 Copilot 里描述你的需求。
      </p>
    </div>
  </div>
</template>
