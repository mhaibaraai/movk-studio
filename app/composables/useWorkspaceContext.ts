import type { Ref } from 'vue'
import type { Workspace } from '#shared/utils/workspace'

/**
 * 随每条消息上传的工作区上下文快照：用户在画布上的交互产物（map 的手绘要素、
 * form 的当前表单结构与已填值），由服务端摘要后拼进 system prompt。
 *
 * 收敛成单一通道，而不是在 CopilotPanel 的请求体里按工作区堆 if 分支。
 * 无上下文时返回 undefined，请求体里就不带这个键。
 */
export function useWorkspaceContext(workspace: Ref<Workspace>) {
  const drawnFeatures = useDrawnFeatures()
  const formSchema = useFormWorkspace()
  const formValues = useFormValues()
  const tableSchema = useTableWorkspace()
  const tableSelection = useTableSelection()

  return computed<Record<string, unknown> | undefined>(() => {
    if (workspace.value === 'map') {
      return drawnFeatures.value.length ? { drawnFeatures: drawnFeatures.value } : undefined
    }

    if (workspace.value === 'form') {
      // 空表单不注入：AI 该做的是 generate-form，给它一份空结构只会浪费 token
      if (!formSchema.value.fields.length) return undefined
      return { schema: formSchema.value, values: formValues.value }
    }

    if (workspace.value === 'data') {
      // 空表格不注入：AI 该做的是 generate-table
      if (!tableSchema.value.columns.length) return undefined

      // 示例数据可能很长，模型只需要知道列结构与规模；行数据不随每条消息回灌
      const { rows, ...structure } = tableSchema.value

      return {
        schema: structure,
        rowCount: rows.length,
        selectedKeys: Object.keys(tableSelection.value).filter(key => tableSelection.value[key])
      }
    }

    return undefined
  })
}
