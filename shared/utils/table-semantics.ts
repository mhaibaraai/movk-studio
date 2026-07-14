import type {
  ActionsColumn,
  CellConfig,
  CellOptions,
  CellType,
  DataColumn,
  ExpandColumn,
  GroupColumn,
  IndexColumn,
  RowPinningColumn,
  SelectionColumn,
  TableSchema,
  UiColor
} from './table-schema'
import { isDataColumn, isGroupColumn } from './table-schema'

/**
 * 表格语义的唯一真源，被三个消费者共享：
 * 画布编译（app/utils/table-compiler）、代码导出（app/utils/table-codegen）、prompt 摘要（server/utils/table-context）。
 *
 * 每条语义只在这里定义一次，并同时给出三个视图：怎么求值、怎么生成代码、怎么说成人话。
 * 三视图同义由 test/table-semantics.spec.ts 对拍保证。
 */

export type CellRenderKind = 'text' | 'badge' | 'link' | 'avatar' | 'progress' | 'tags'

export interface CellTypeSpec {
  /** prompt 摘要里的说法 */
  label: string
  /** 渲染形态：compiler 用 h() 落成 VNode，codegen 落成等价源码 */
  render: CellRenderKind
  /** 单元格的文本内容 */
  format: (value: unknown, options: CellOptions) => string
  /** 导出：与 format 同义的表达式源码，自由变量为 value */
  formatCode: (options: CellOptions) => string
  /** 渲染组件的额外 props（badge 的颜色、link 的 href、progress 的进度）；text 形态没有 */
  props?: (value: unknown, options: CellOptions) => Record<string, unknown>
  /** 导出：与 props 同义的表达式源码，自由变量为 value */
  propsCode?: (options: CellOptions) => string
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/** 与 isEmpty 同义的表达式源码；变量名可变，tags 的每一项走 item */
function emptyCode(name: string): string {
  return `(${name} === null || ${name} === undefined || ${name} === '')`
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return isEmpty(value) ? [] : [value]
}

/** 空值不能落成 0——Number(null) 与 Number('') 都是 0，会把空单元格渲染成「¥0」而不是交给 emptyCell */
function formatNumber(value: unknown, decimals: number): string {
  if (isEmpty(value)) return ''

  const num = Number(value)
  if (!Number.isFinite(num)) return ''

  return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function numberCode(decimals: number): string {
  const locale = `Number(value).toLocaleString('zh-CN', { minimumFractionDigits: ${decimals}, maximumFractionDigits: ${decimals} })`
  return `(${emptyCode('value')} || !Number.isFinite(Number(value)) ? '' : ${locale})`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(value: unknown, format: NonNullable<CellOptions['dateFormat']>): string {
  if (isEmpty(value)) return ''

  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return ''

  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (format === 'time') return time
  if (format === 'datetime') return `${day} ${time}`

  return day
}

/**
 * 日期格式化的表达式源码。生成的是自包含的 IIFE 而不是调用某个 helper——
 * 导出的组件粘回项目即可用，不需要一并带走本仓库的工具函数。
 */
function dateCode(format: NonNullable<CellOptions['dateFormat']>): string {
  const day = '`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, \'0\')}-${String(d.getDate()).padStart(2, \'0\')}`'
  const time = '`${String(d.getHours()).padStart(2, \'0\')}:${String(d.getMinutes()).padStart(2, \'0\')}`'
  const body = format === 'time' ? time : format === 'datetime' ? `${day} + ' ' + ${time}` : day

  return `(${emptyCode('value')} ? '' : ((d) => Number.isNaN(d.getTime()) ? '' : ${body})(new Date(value)))`
}

function labelOf(value: unknown, options: CellOptions): string {
  if (isEmpty(value)) return ''
  return options.labelMap?.[String(value)] ?? String(value)
}

function labelCode(options: CellOptions, name = 'value'): string {
  const mapped = options.labelMap
    ? `(${JSON.stringify(options.labelMap)}[String(${name})] ?? String(${name}))`
    : `String(${name})`

  return `(${emptyCode(name)} ? '' : ${mapped})`
}

function colorOf(value: unknown, options: CellOptions): UiColor {
  return options.colorMap?.[String(value)] ?? 'neutral'
}

function colorCode(options: CellOptions, name = 'value'): string {
  return options.colorMap
    ? `(${JSON.stringify(options.colorMap)}[String(${name})] ?? 'neutral')`
    : '\'neutral\''
}

/** 单元格的十一种渲染方式 */
export const CELL_SPEC: Record<CellType, CellTypeSpec> = {
  text: {
    label: '纯文本',
    render: 'text',
    format: labelOf,
    formatCode: labelCode
  },

  number: {
    label: '千分位数字',
    render: 'text',
    format: (value, options) => formatNumber(value, options.decimals ?? 0),
    formatCode: options => numberCode(options.decimals ?? 0)
  },

  currency: {
    label: '金额',
    render: 'text',
    format: (value, options) => {
      const text = formatNumber(value, options.decimals ?? 0)
      return text && `${options.currency ?? '¥'}${text}`
    },
    formatCode: (options) => {
      const symbol = JSON.stringify(options.currency ?? '¥')
      return `((text) => text && ${symbol} + text)(${numberCode(options.decimals ?? 0)})`
    }
  },

  percent: {
    label: '百分比',
    render: 'text',
    format: (value, options) => {
      const text = formatNumber(value, options.decimals ?? 0)
      return text && `${text}%`
    },
    formatCode: options => `((text) => text && text + '%')(${numberCode(options.decimals ?? 0)})`
  },

  date: {
    label: '日期',
    render: 'text',
    format: (value, options) => formatDate(value, options.dateFormat ?? 'date'),
    formatCode: options => dateCode(options.dateFormat ?? 'date')
  },

  badge: {
    label: '彩色标签',
    render: 'badge',
    format: labelOf,
    formatCode: labelCode,
    props: (value, options) => ({ color: colorOf(value, options), variant: 'subtle', size: 'sm' }),
    propsCode: options => `{ color: ${colorCode(options)}, variant: 'subtle', size: 'sm' }`
  },

  link: {
    label: '链接',
    render: 'link',
    format: labelOf,
    formatCode: labelCode,
    props: (value, options) => ({ to: `${options.hrefPrefix ?? ''}${String(value ?? '')}`, target: '_blank' }),
    propsCode: options => `{ to: ${JSON.stringify(options.hrefPrefix ?? '')} + String(value ?? ''), target: '_blank' }`
  },

  avatar: {
    label: '头像加名字',
    render: 'avatar',
    format: labelOf,
    formatCode: labelCode,
    props: value => ({ alt: String(value ?? ''), size: '2xs' }),
    propsCode: () => '{ alt: String(value ?? \'\'), size: \'2xs\' }'
  },

  boolean: {
    label: '是否',
    render: 'text',
    // false 要显示成「否」而不是空——只有 null / undefined / '' 才算没有值
    format: (value, options) => (isEmpty(value) ? '' : (value ? options.trueLabel ?? '是' : options.falseLabel ?? '否')),
    formatCode: (options) => {
      const yes = JSON.stringify(options.trueLabel ?? '是')
      const no = JSON.stringify(options.falseLabel ?? '否')
      return `(${emptyCode('value')} ? '' : (value ? ${yes} : ${no}))`
    }
  },

  progress: {
    label: '进度条',
    render: 'progress',
    format: (value, options) => {
      if (isEmpty(value)) return ''

      const num = Number(value)
      if (!Number.isFinite(num)) return ''

      return `${Math.round((num / (options.max ?? 100)) * 100)}%`
    },
    formatCode: (options) => {
      const percent = `Math.round((Number(value) / ${options.max ?? 100}) * 100) + '%'`
      return `(${emptyCode('value')} || !Number.isFinite(Number(value)) ? '' : ${percent})`
    },
    props: (value, options) => ({ modelValue: Number(value) || 0, max: options.max ?? 100, size: 'sm' }),
    propsCode: options => `{ modelValue: Number(value) || 0, max: ${options.max ?? 100}, size: 'sm' }`
  },

  tags: {
    label: '多个标签',
    render: 'tags',
    // 渲染成一排 badge，每个 badge 的文案与颜色仍走 labelOf / colorOf；这里的文本是它们的合并
    format: (value, options) => toArray(value).map(item => labelOf(item, options)).join('、'),
    formatCode: options => `(Array.isArray(value) ? value : ${emptyCode('value')} ? [] : [value]).map((item) => ${labelCode(options, 'item')}).join('、')`
  }
}

/** 一个单元格的渲染意图：compiler 落成 VNode，codegen 落成源码，两边都只读这一份 */
export interface CellRender {
  kind: CellRenderKind
  text: string
  props: Record<string, unknown>
  /** tags 形态下每个标签的文案与颜色 */
  tags: Array<{ text: string, color: UiColor }>
}

export function renderCell(cell: CellConfig, value: unknown): CellRender {
  const spec = CELL_SPEC[cell.type]
  const options = cell.options ?? {}

  return {
    kind: spec.render,
    text: spec.format(value, options),
    props: spec.props?.(value, options) ?? {},
    tags: spec.render === 'tags'
      ? toArray(value).map(item => ({ text: labelOf(item, options), color: colorOf(item, options) }))
      : []
  }
}

export type SpecialColumn = SelectionColumn | IndexColumn | ExpandColumn | RowPinningColumn | ActionsColumn

export type TableNode
  = | { kind: 'column', column: DataColumn | SpecialColumn }
    | { kind: 'group', column: GroupColumn }

/**
 * 表格的列顺序：分组列就地展开成一个节点，组内数据列按声明顺序。
 * 编译、导出、prompt 摘要三处共享同一个遍历。
 */
export function walkColumns(schema: TableSchema): TableNode[] {
  return schema.columns.map(column => (
    isGroupColumn(column)
      ? { kind: 'group' as const, column }
      : { kind: 'column' as const, column }
  ))
}

/** 表格里所有绑定了数据字段的列，含分组表头下的子列 */
export function dataColumnsOf(schema: TableSchema): DataColumn[] {
  return schema.columns.flatMap((column) => {
    if (isGroupColumn(column)) return column.children
    return isDataColumn(column) ? [column] : []
  })
}

/**
 * 把 AI 产出的结构收敛成合法的表格，三个消费者共享同一份结果——
 * 非法组合只在这里剔除一次，不让编译、导出、摘要各自漏判。
 */
export function normalizeTable(schema: TableSchema): TableSchema {
  const isTree = Boolean(schema.options.childrenKey)
  const seen = new Set<string>()

  const columns = schema.columns
    // 非树形表格没有可展开的子行，expand 列会渲染出一列永远点不动的箭头
    .filter(column => isTree || !('type' in column && column.type === 'expand'))
    .filter((column) => {
      if (seen.has(column.key)) return false
      seen.add(column.key)
      return true
    })
    .map((column) => {
      const next = { ...column }

      // 树形选择策略只在树形下成立
      if ('type' in next && next.type === 'selection' && !isTree) {
        delete (next as { strategy?: unknown }).strategy
      }
      // 固定列要参与 sticky 偏移计算，必须有确定宽度
      if (next.fixed && next.size === undefined && next.minSize === undefined) {
        next.size = 'md'
      }
      // 分组列不允许再嵌套分组：子列一律当数据列
      if (isGroupColumn(next)) {
        next.children = next.children.filter(child => 'accessorKey' in child)
      }

      return next
    })
    .filter(column => !isGroupColumn(column) || column.children.length > 0)

  return { ...schema, columns }
}
