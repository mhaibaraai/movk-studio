import type { ActionsColumn, CellConfig, DataColumn, TableSchema } from '#shared/utils/table-schema'
import type { Condition } from '#shared/utils/condition'
import { isDataColumn, isGroupColumn } from '#shared/utils/table-schema'
import { CELL_SPEC, dataColumnsOf, normalizeTable } from '#shared/utils/table-semantics'
import { CONDITION_OPS } from '#shared/utils/condition-semantics'
import { printAccess, printCodeKey, printCodeValue, rawCode } from './codegen'

/**
 * TableSchema → 可直接粘回项目的 Vue 单文件组件（MDataTable 写法）。
 *
 * 单元格与行内动作的语义取自 table-semantics，与画布编译（table-compiler）同源——
 * 导出的代码渲染出的东西，与用户在画布上看到的必须是同一个。
 *
 * 生成的 cell 函数是自包含的表达式，不依赖本仓库的任何工具函数：粘回去就能跑。
 */

/** 单元格渲染要用到的组件；用到哪个就在文件头 import 哪个 */
const CELL_COMPONENT: Partial<Record<string, string>> = {
  badge: 'UBadge',
  link: 'ULink',
  avatar: 'UAvatar',
  progress: 'UProgress',
  tags: 'UBadge'
}

function printCellBody(cell: CellConfig): string {
  const spec = CELL_SPEC[cell.type]
  const options = cell.options ?? {}
  const text = spec.formatCode(options)
  const props = spec.propsCode?.(options) ?? '{}'

  if (spec.render === 'badge') return `h(UBadge, ${props}, () => ${text})`
  if (spec.render === 'link') return `h(ULink, ${props}, () => ${text})`
  if (spec.render === 'progress') return `h(UProgress, ${props})`
  if (spec.render === 'avatar') return `h('span', { class: 'flex items-center gap-2' }, [h(UAvatar, ${props}), ${text}])`

  if (spec.render === 'tags') {
    const color = options.colorMap
      ? `(${JSON.stringify(options.colorMap)}[String(item)] ?? 'neutral')`
      : '\'neutral\''
    const label = options.labelMap
      ? `(${JSON.stringify(options.labelMap)}[String(item)] ?? String(item))`
      : 'String(item)'
    const items = `(Array.isArray(value) ? value : [])`

    return `h('span', { class: 'flex flex-wrap items-center gap-1' }, ${items}.map((item) => h(UBadge, { color: ${color}, variant: 'subtle', size: 'sm' }, () => ${label})))`
  }

  return text
}

function printCell(cell: CellConfig, indent: string): string {
  const inner = `${indent}  `

  return [
    '({ getValue }) => {',
    `${inner}const value = getValue()`,
    `${inner}return ${printCellBody(cell)}`,
    `${indent}}`
  ].join('\n')
}

function conditionCode(condition: Condition, root: string): string {
  return CONDITION_OPS[condition.op].code(printAccess(root, condition.field), condition.value)
}

function printDataColumn(column: DataColumn): Record<string, unknown> {
  const { key, cell, ...rest } = column

  return {
    ...rest,
    ...(cell ? { cell: rawCode(printCell(cell, '    ')) } : {})
  }
}

/** onClick 不可序列化：导出的代码里它是一句提示，使用者把 notify 换成真实逻辑 */
function printActionsColumn(column: ActionsColumn, rowKey: string): Record<string, unknown> {
  const { key, actions, ...rest } = column

  return {
    ...rest,
    actions: actions.map(action => ({
      key: action.key,
      divider: action.divider,
      buttonProps: {
        icon: action.icon,
        label: action.label,
        color: action.color,
        variant: action.variant ?? 'ghost',
        size: 'xs'
      },
      ...(action.visibleWhen ? { visibility: rawCode(`({ row }) => ${conditionCode(action.visibleWhen, 'row')}`) } : {}),
      ...(action.disabledWhen ? { disabled: rawCode(`({ row }) => ${conditionCode(action.disabledWhen, 'row')}`) } : {}),
      ...(action.confirm
        ? {
            confirm: true,
            confirmProps: {
              title: action.confirm.title,
              description: action.confirm.description,
              type: action.confirm.type ?? 'warning',
              confirmText: action.confirm.confirmText
            }
          }
        : {}),
      onClick: rawCode(`({ row }) => notify(\`${action.label ?? action.key} \${${printAccess('row', rowKey)}}\`)`)
    }))
  }
}

function printColumns(schema: TableSchema): string {
  const { rowKey } = schema.options

  const columns = schema.columns.map((column) => {
    if (isGroupColumn(column)) {
      const { key, children, ...rest } = column
      return { ...rest, children: children.map(printDataColumn) }
    }

    if ('type' in column && column.type === 'actions') return printActionsColumn(column, rowKey)

    if ('type' in column && column.type === 'selection') {
      const { key, disabledWhen, ...rest } = column

      return {
        ...rest,
        ...(disabledWhen
          ? {
              checkboxProps: rawCode(
                `(ctx) => ctx.scope === 'header' ? {} : { disabled: ${conditionCode(disabledWhen, 'ctx.cellContext.row.original')} }`
              )
            }
          : {})
      }
    }

    if (isDataColumn(column)) return printDataColumn(column)

    const { key, ...rest } = column
    return rest
  })

  return printCodeValue(columns, '')
}

/** 行的字段类型由示例数据推断——导出的组件带一份真实可用的 Row 接口，而不是 Record<string, unknown> */
function printRowType(schema: TableSchema): string {
  const { rowKey, childrenKey } = schema.options
  const fields = new Map<string, string>()

  const typeOf = (value: unknown): string => {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return typeof value
    if (Array.isArray(value)) return 'string[]'
    return 'unknown'
  }

  for (const key of [rowKey, ...dataColumnsOf(schema).map(column => column.accessorKey)]) {
    const sample = schema.rows.find(row => row[key] !== null && row[key] !== undefined)
    fields.set(key, sample ? typeOf(sample[key]) : 'unknown')
  }

  const lines = [...fields].map(([key, type]) => `  ${printCodeKey(key)}: ${type}`)
  if (childrenKey) lines.push(`  ${printCodeKey(childrenKey)}?: Row[]`)

  return `interface Row {\n${lines.join('\n')}\n}`
}

function printTemplate(schema: TableSchema): string[] {
  const { rowKey, childrenKey, pagination, emptyCell, ...flags } = schema.options

  const attrs = [
    ...(pagination ? ['v-model:pagination="pagination"'] : []),
    `row-key="${rowKey}"`,
    ...(childrenKey ? [`children-key="${childrenKey}"`] : []),
    ':columns="columns"',
    ':data="data"',
    ...(emptyCell ? [`empty-cell="${emptyCell}"`] : []),
    ...(pagination?.pageSizes ? [`:pagination-ui="{ pageSizes: ${JSON.stringify(pagination.pageSizes)} }"`] : [])
  ]

  for (const [name, value] of Object.entries(flags)) {
    if (value === undefined) continue

    const kebab = name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)
    if (typeof value === 'boolean') attrs.push(value ? kebab : `:${kebab}="false"`)
    else attrs.push(`${kebab}="${String(value)}"`)
  }

  return ['  <MDataTable', ...attrs.map(attr => `    ${attr}`), '  />']
}

export function generateTableCode(schema: TableSchema): string {
  const normalized = normalizeTable(schema)
  const { pagination } = normalized.options

  const cells = dataColumnsOf(normalized).map(column => column.cell?.type).filter(Boolean) as string[]
  const components = [...new Set(cells.map(type => CELL_COMPONENT[type]).filter(Boolean))].sort()
  const hasActions = normalized.columns.some(column => 'type' in column && column.type === 'actions')

  const script = [
    '// 由 Movk Studio 数据工作区导出',
    'import type { DataTableColumn } from \'@movk/nuxt\'',
    ...(components.length ? [`import { ${components.join(', ')} } from '#components'`] : []),
    '',
    printRowType(normalized),
    '',
    ...(hasActions
      ? [
          'const toast = useToast()',
          '// 行内动作目前只是提示，把 notify 换成你的真实逻辑',
          'const notify = (message: string): void => { toast.add({ title: message, duration: 1500 }) }',
          ''
        ]
      : []),
    ...(pagination
      ? [`const pagination = ref({ pageIndex: 0, pageSize: ${pagination.pageSize} })`, '']
      : []),
    `const data: Row[] = ${printCodeValue(normalized.rows, '')}`,
    '',
    `const columns: DataTableColumn<Row>[] = ${printColumns(normalized)}`
  ]

  return [
    '<script setup lang="ts">',
    ...script,
    '</script>',
    '',
    '<template>',
    ...printTemplate(normalized),
    '</template>',
    ''
  ].join('\n')
}
