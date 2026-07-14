import type { Condition } from '#shared/utils/condition'
import type { TableColumn, TableOptions, TableSchema } from '#shared/utils/table-schema'
import { isDataColumn, isGroupColumn } from '#shared/utils/table-schema'
import { CELL_SPEC } from '#shared/utils/table-semantics'
import { CONDITION_OPS } from '#shared/utils/condition-semantics'

/** 注入 prompt 的表格结构：行数据不回灌，只给规模 */
export type TableStructure = Omit<TableSchema, 'rows'>

function describeCondition(condition: Condition): string {
  const { label, needsValue } = CONDITION_OPS[condition.op]
  return `${condition.field} ${label}${needsValue ? ` ${JSON.stringify(condition.value)}` : ''}`
}

function describeOptions(options: TableOptions): string[] {
  const lines = [`行标识字段：${options.rowKey}`]

  if (options.childrenKey) lines.push(`树形表格，子行字段：${options.childrenKey}`)
  if (options.pagination) lines.push(`分页：每页 ${options.pagination.pageSize} 条`)

  const flags = [
    options.sortable && '全列可排序',
    options.pinable && '全列可固定',
    options.resizable && '全列可拖拽列宽',
    options.stripe && '斑马纹',
    options.bordered && '边框',
    options.sticky === false && '表头不粘连',
    options.fitContent && '宽度自适应内容',
    options.density && options.density !== 'normal' && `密度 ${options.density}`
  ].filter(Boolean)

  if (flags.length) lines.push(`外观与能力：${flags.join('、')}`)

  return lines
}

function describeColumn(column: TableColumn, index: number): string {
  const segments = [`${index + 1}. ${column.key}`]

  if (isGroupColumn(column)) {
    segments.push(`分组表头「${column.header}」`, `子列：${column.children.map(child => child.key).join(' / ')}`)
    return segments.join('  ')
  }

  if (isDataColumn(column)) {
    segments.push('数据列', `「${column.header ?? column.key}」`)
    if (column.cell) segments.push(`单元格：${CELL_SPEC[column.cell.type].label}`)
    if (column.sortable !== undefined) segments.push(column.sortable ? '可排序' : '不可排序')
  } else {
    segments.push(`${column.type} 列`)

    if (column.type === 'selection') {
      segments.push(column.mode === 'single' ? '单选' : '多选')
      if (column.strategy) segments.push(`树形策略 ${column.strategy}`)
      if (column.disabledWhen) segments.push(`禁用条件：${describeCondition(column.disabledWhen)}`)
    }

    if (column.type === 'actions') {
      segments.push(`动作：${column.actions.map((action) => {
        const parts = [action.key]
        if (action.confirm) parts.push('带二次确认')
        if (action.visibleWhen) parts.push(`仅当 ${describeCondition(action.visibleWhen)}`)
        if (action.disabledWhen) parts.push(`禁用当 ${describeCondition(action.disabledWhen)}`)
        return parts.join('（') + (parts.length > 1 ? '）' : '')
      }).join(' / ')}`)
    }
  }

  if (column.fixed) segments.push(`固定在${column.fixed === 'left' ? '左' : '右'}`)
  if (column.visibility === false) segments.push('默认隐藏')

  return segments.join('  ')
}

/**
 * 把当前表格结构摘要成一段可注入 system prompt 的文本；空表格返回 null。
 *
 * 必须带 key 列——AI 靠它定位列做增量修改。不注入的话它只能把归约算法在脑子里
 * 重跑一遍（generate-table 之后接一串 upsert-column），既贵又不可靠。
 */
export function summarizeTable(schema: TableStructure, rowCount: number, selectedKeys: string[]): string | null {
  if (!schema.columns.length) return null

  const lines = [
    '当前画布上的表格：',
    ...describeOptions(schema.options),
    `示例数据：${rowCount} 行`,
    '列（按展示顺序）：',
    ...schema.columns.map(describeColumn)
  ]

  if (selectedKeys.length) {
    lines.push(`用户当前勾选了 ${selectedKeys.length} 行：${selectedKeys.slice(0, 20).join('、')}`)
  }

  lines.push('修改表格时用上面的 key 定位列，调用 upsert-column 等增量工具。不要为了改动局部而重新调用 generate-table——那会丢掉现有内容。')

  return lines.join('\n')
}
