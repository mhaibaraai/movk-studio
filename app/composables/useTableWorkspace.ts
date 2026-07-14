import type { RowSelectionState } from '@movk/nuxt'
import type { TableSchema } from '#shared/utils/table-schema'
import { createTableSchema } from '#shared/utils/table-schema'

/** 表格结构：消息的纯归约，只有 AI 工具能改 */
export function useTableWorkspace() {
  return useState<TableSchema>('table-workspace', createTableSchema)
}

/**
 * 用户在画布表格上的选中行。刻意不进消息归约状态——它是交互产物、不是任何工具输出的函数，
 * 塞进归约状态会在下一条消息到达时被重算清空（与 form 的 useFormValues 同一模式）。
 */
export function useTableSelection() {
  return useState<RowSelectionState>('table-selection', () => ({}))
}
