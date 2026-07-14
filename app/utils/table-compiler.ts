import type { VNode } from 'vue'
import { h } from 'vue'
import type { DataTableColumn } from '@movk/nuxt'
import { UAvatar, UBadge, ULink, UProgress } from '#components'
import type { ActionsColumn, CellConfig, DataColumn, RowAction, TableRow, TableSchema } from '#shared/utils/table-schema'
import { isGroupColumn } from '#shared/utils/table-schema'
import { normalizeTable, renderCell } from '#shared/utils/table-semantics'
import { evalCondition } from '#shared/utils/condition-semantics'

/**
 * TableSchema → <MDataTable> 要的 columns / data / props。
 *
 * MDataTable 的 cell、onClick、disabled 都是函数式配置，而画布状态必须可序列化：
 * 这里是「声明式结构 → 活函数」的唯一转换处，语义一律取自 table-semantics，
 * 与代码导出（table-codegen）读的是同一份真源。
 */

export interface TableActionEvent {
  action: RowAction
  row: TableRow
}

export interface CompiledTable {
  columns: DataTableColumn<TableRow>[]
  data: TableRow[]
  props: Record<string, unknown>
}

function renderCellVNode(cell: CellConfig, value: unknown): VNode | string {
  const { kind, text, props, tags } = renderCell(cell, value)

  if (kind === 'badge') return h(UBadge, props, () => text)
  if (kind === 'link') return h(ULink, props, () => text)
  if (kind === 'progress') return h(UProgress, props)
  if (kind === 'avatar') {
    return h('span', { class: 'flex items-center gap-2' }, [h(UAvatar, props), text])
  }
  if (kind === 'tags') {
    return h(
      'span',
      { class: 'flex flex-wrap items-center gap-1' },
      tags.map(tag => h(UBadge, { color: tag.color, variant: 'subtle', size: 'sm' }, () => tag.text))
    )
  }

  return text
}

function compileDataColumn(column: DataColumn): Record<string, unknown> {
  const { key, cell, ...rest } = column

  return {
    ...rest,
    ...(cell ? { cell: (ctx: { getValue: () => unknown }) => renderCellVNode(cell, ctx.getValue()) } : {})
  }
}

/** onClick 不可序列化：画布上的动作是演示，由调用方接住并提示 */
function compileActions(column: ActionsColumn, onAction: (event: TableActionEvent) => void): Record<string, unknown> {
  const { key, actions, ...rest } = column

  return {
    ...rest,
    actions: (ctx: { row: { original: TableRow } }) => actions
      .filter(action => !action.visibleWhen || evalCondition(action.visibleWhen, ctx.row.original))
      .map(action => ({
        key: action.key,
        divider: action.divider,
        buttonProps: {
          icon: action.icon,
          label: action.label,
          color: action.color,
          variant: action.variant ?? 'ghost',
          size: 'xs'
        },
        disabled: action.disabledWhen
          ? (inner: { row: TableRow }) => evalCondition(action.disabledWhen!, inner.row)
          : undefined,
        ...(action.confirm
          ? {
              confirm: true,
              confirmProps: () => ({
                title: action.confirm!.title,
                description: action.confirm!.description,
                type: action.confirm!.type ?? 'warning',
                confirmText: action.confirm!.confirmText
              })
            }
          : {}),
        onClick: (inner: { row: TableRow }) => onAction({ action, row: inner.row })
      }))
  }
}

export function compileTable(schema: TableSchema, onAction: (event: TableActionEvent) => void): CompiledTable {
  const normalized = normalizeTable(schema)
  const { rowKey, childrenKey, pagination, emptyCell, ...flags } = normalized.options

  const columns = normalized.columns.map((column) => {
    if (isGroupColumn(column)) {
      const { key, children, ...rest } = column
      return { ...rest, children: children.map(compileDataColumn) }
    }

    if ('type' in column && column.type === 'actions') return compileActions(column, onAction)

    if ('type' in column && column.type === 'selection') {
      const { key, disabledWhen, ...rest } = column

      return {
        ...rest,
        ...(disabledWhen
          ? {
              checkboxProps: (ctx: { scope: string, cellContext?: { row: { original: TableRow } } }) => (
                ctx.scope === 'header' || !ctx.cellContext
                  ? {}
                  : { disabled: evalCondition(disabledWhen, ctx.cellContext.row.original) }
              )
            }
          : {})
      }
    }

    const { key, ...rest } = column
    return rest
  })

  return {
    // 声明式结构 → 运行时列定义的类型收口处：cell / onClick / disabled 在上面刚被折成活函数，
    // 逐列窄化到 DataTableColumn 的判别联合只会换来一堆等价的断言
    columns: columns as unknown as DataTableColumn<TableRow>[],
    data: normalized.rows,
    props: {
      rowKey,
      ...(childrenKey ? { childrenKey } : {}),
      ...(emptyCell ? { emptyCell } : {}),
      ...(pagination ? { paginationUi: { show: true, pageSizes: pagination.pageSizes } } : {}),
      ...flags
    }
  }
}

/** 分页状态是画布交互态，不进画布结构；这里只给它一个跟随 schema 的初值 */
export function initialPagination(schema: TableSchema): { pageIndex: number, pageSize: number } {
  return { pageIndex: 0, pageSize: schema.options.pagination?.pageSize ?? 10 }
}
