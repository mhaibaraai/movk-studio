import { z } from 'zod'
import { conditionSchema } from './condition'

/**
 * data 工作区的画布状态：可序列化的数据表格结构，对应 form 的 FormSchema。
 *
 * zod schema 是唯一真源，类型一律由 z.infer 派生：工具契约（shared/utils/tools/data/）拿它做
 * input/output，服务端拿它校验上下文快照，客户端拿它编译成 <MDataTable> 要的 columns / data / props。
 * 字段说明写在 .describe() 里——AI 靠它选参数。
 *
 * MDataTable 的 cell / onClick / confirmProps 等都是函数式配置，无法序列化。这里一律折成声明式：
 * 单元格渲染是 CELL_TYPES 里的一种，行内动作的可用性是 condition，点击行为在画布上是演示、在导出代码里是占位。
 */

export const CELL_TYPES = [
  'text',
  'number',
  'currency',
  'percent',
  'date',
  'badge',
  'link',
  'avatar',
  'boolean',
  'progress',
  'tags'
] as const

export type CellType = typeof CELL_TYPES[number]

export const UI_COLORS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const

export type UiColor = typeof UI_COLORS[number]

export const ALIGNS = ['left', 'center', 'right'] as const

/** MDataTable 的列宽预设；也可直接给像素数 */
export const SIZE_PRESETS = ['xs', 'sm', 'md', 'lg', 'xl'] as const

export const DENSITIES = ['compact', 'normal', 'comfortable'] as const

export const SELECTION_MODES = ['multiple', 'single'] as const

export const TREE_STRATEGIES = ['cascade', 'isolated', 'leaf'] as const

export const DATE_FORMATS = ['date', 'datetime', 'time'] as const

const sizeSchema = z.union([z.number().int().min(40).max(600), z.enum(SIZE_PRESETS)])

export const cellOptionsSchema = z.object({
  currency: z.string().max(4).optional().describe('货币符号，仅 currency 生效，缺省 ¥'),
  decimals: z.number().int().min(0).max(6).optional().describe('小数位数，仅 number / currency / percent 生效'),
  dateFormat: z.enum(DATE_FORMATS).optional().describe('日期展示粒度，仅 date 生效，缺省 date'),
  labelMap: z.record(z.string(), z.string()).optional().describe('原始值 → 展示文案，如 active 显示成「在职」；text / badge / tags 生效'),
  colorMap: z.record(z.string(), z.enum(UI_COLORS)).optional().describe('原始值 → 标签颜色，仅 badge / tags 生效，未命中的值用 neutral'),
  trueLabel: z.string().optional().describe('布尔真值的文案，仅 boolean 生效，缺省「是」'),
  falseLabel: z.string().optional().describe('布尔假值的文案，仅 boolean 生效，缺省「否」'),
  max: z.number().positive().optional().describe('进度条的满值，仅 progress 生效，缺省 100'),
  hrefPrefix: z.string().max(200).optional().describe('链接前缀，与单元格值拼成 href，如 mailto: 或 https://example.com/user/；仅 link 生效')
})

export const cellSchema = z.object({
  type: z.enum(CELL_TYPES).describe(
    '单元格渲染方式：text 纯文本、number 千分位数字、currency 金额、percent 百分比、date 日期、'
    + 'badge 彩色标签（状态类字段用它）、link 可点击链接、avatar 头像加名字、boolean 是否、'
    + 'progress 进度条（完成率类字段用它）、tags 多个标签（值为数组）'
  ),
  options: cellOptionsSchema.optional()
})

const columnBaseSchema = z.object({
  key: z.string().describe('列的唯一标识，后续所有针对该列的工具都靠它定位；数据列须与 accessorKey 一致，特殊列自取一个英文小驼峰名'),
  header: z.string().optional().describe('表头文案'),
  visibility: z.boolean().optional().describe('默认是否显示，缺省显示'),
  pinable: z.boolean().optional().describe('用户能否手动固定此列'),
  resizable: z.boolean().optional().describe('用户能否拖拽此列宽度'),
  fixed: z.enum(['left', 'right']).optional().describe('把列贴到表格左侧或右侧，横向滚动时保持可见'),
  align: z.enum(ALIGNS).optional().describe('对齐方式；数字、金额类列用 right'),
  size: sizeSchema.optional().describe('固定列宽，像素数或预设 xs–xl'),
  minSize: z.number().int().min(40).max(600).optional().describe('自适应宽度的下限'),
  maxSize: z.number().int().min(40).max(600).optional().describe('拖拽宽度的上限')
})

export const dataColumnSchema = columnBaseSchema.extend({
  accessorKey: z.string().describe('绑定的数据字段名，须是 rows 里存在的键'),
  cell: cellSchema.optional().describe('单元格渲染方式；不传即纯文本'),
  sortable: z.boolean().optional().describe('此列能否点表头排序；覆盖表格级的 sortable'),
  truncate: z.union([z.boolean(), z.number().int().min(1).max(5)]).optional().describe('文本截断：true 单行，数字为最多行数；长文本列用它'),
  tooltip: z.union([z.boolean(), z.number().int().min(1).max(5)]).optional().describe('截断并在溢出时浮出完整内容；与 truncate 二选一')
})

export const groupColumnSchema = columnBaseSchema.extend({
  header: z.string().describe('分组表头文案'),
  children: z.array(dataColumnSchema).min(1).describe('组内的数据列，不能再嵌套分组')
})

export const selectionColumnSchema = columnBaseSchema.extend({
  type: z.literal('selection'),
  mode: z.enum(SELECTION_MODES).optional().describe('multiple 多选（缺省），single 单选'),
  strategy: z.enum(TREE_STRATEGIES).optional().describe('树形表格下的父子勾选关系：cascade 级联、isolated 独立、leaf 仅叶子可选；非树形时无意义'),
  disabledWhen: conditionSchema.optional().describe('满足条件的行不可勾选')
})

export const indexColumnSchema = columnBaseSchema.extend({
  type: z.literal('index')
})

export const expandColumnSchema = columnBaseSchema.extend({
  type: z.literal('expand')
})

export const rowPinningColumnSchema = columnBaseSchema.extend({
  type: z.literal('row-pinning'),
  position: z.enum(['top', 'bottom']).optional().describe('把行钉到表头还是表尾，缺省 top')
})

export const actionSchema = z.object({
  key: z.string().describe('动作唯一标识，英文小驼峰'),
  label: z.string().optional().describe('按钮文案；只给 icon 时是图标按钮'),
  icon: z.string().optional().describe('图标名，如 i-lucide-pencil'),
  color: z.enum(UI_COLORS).optional().describe('按钮颜色；删除类动作用 error'),
  variant: z.enum(['solid', 'outline', 'soft', 'subtle', 'ghost', 'link']).optional().describe('按钮变体，缺省 ghost'),
  divider: z.boolean().optional().describe('在溢出菜单里于此项前插入分隔线'),
  confirm: z.object({
    title: z.string().describe('确认框标题'),
    description: z.string().optional().describe('确认框正文'),
    type: z.enum(['info', 'success', 'warning', 'error']).optional().describe('确认框语气，缺省 warning'),
    confirmText: z.string().optional().describe('确认按钮文案')
  }).optional().describe('二次确认；删除等不可逆动作必须带上'),
  disabledWhen: conditionSchema.optional().describe('满足条件的行禁用此动作'),
  visibleWhen: conditionSchema.optional().describe('仅满足条件的行显示此动作')
})

export const actionsColumnSchema = columnBaseSchema.extend({
  type: z.literal('actions'),
  maxInline: z.number().int().min(0).max(6).optional().describe('平铺的按钮数，超出的折叠进溢出菜单，缺省 2'),
  actions: z.array(actionSchema).min(1).describe('行内动作，按展示顺序排列')
})

export const columnSchema = z.union([
  selectionColumnSchema,
  indexColumnSchema,
  expandColumnSchema,
  rowPinningColumnSchema,
  actionsColumnSchema,
  groupColumnSchema,
  dataColumnSchema
])

export const paginationSchema = z.object({
  pageSize: z.number().int().min(1).max(100).describe('每页行数'),
  pageSizes: z.array(z.number().int().min(1).max(100)).optional().describe('可切换的每页行数选项')
})

export const tableOptionsSchema = z.object({
  rowKey: z.string().describe('行唯一标识字段，须是 rows 里存在的键；选择、展开、行固定都依赖它'),
  childrenKey: z.string().optional().describe('子行字段名，设了就是树形表格；rows 里的行须在该键下嵌套子行'),
  sortable: z.boolean().optional().describe('表格级：所有数据列可点表头排序'),
  pinable: z.boolean().optional().describe('表格级：所有列可手动固定'),
  resizable: z.boolean().optional().describe('表格级：所有列可拖拽宽度'),
  stripe: z.boolean().optional().describe('斑马纹'),
  bordered: z.boolean().optional().describe('纵向边框'),
  density: z.enum(DENSITIES).optional().describe('视觉密度，缺省 normal'),
  sticky: z.boolean().optional().describe('粘性表头，缺省开启'),
  fitContent: z.boolean().optional().describe('表格宽度由列宽决定而非撑满容器'),
  emptyCell: z.string().max(20).optional().describe('空值占位文案，如 -'),
  pagination: paginationSchema.optional().describe('分页；行数超过 10 时建议开启')
})

export const tableSchema = z.object({
  options: tableOptionsSchema,
  columns: z.array(columnSchema).describe('列定义，按展示顺序排列；key 唯一'),
  rows: z.array(z.record(z.string(), z.unknown())).describe('示例数据，字段与数据列的 accessorKey 对应；树形时子行嵌在 childrenKey 下')
})

export type CellOptions = z.infer<typeof cellOptionsSchema>
export type CellConfig = z.infer<typeof cellSchema>
export type DataColumn = z.infer<typeof dataColumnSchema>
export type GroupColumn = z.infer<typeof groupColumnSchema>
export type SelectionColumn = z.infer<typeof selectionColumnSchema>
export type IndexColumn = z.infer<typeof indexColumnSchema>
export type ExpandColumn = z.infer<typeof expandColumnSchema>
export type RowPinningColumn = z.infer<typeof rowPinningColumnSchema>
export type ActionsColumn = z.infer<typeof actionsColumnSchema>
export type RowAction = z.infer<typeof actionSchema>
export type TableColumn = z.infer<typeof columnSchema>
export type TableOptions = z.infer<typeof tableOptionsSchema>
export type TableSchema = z.infer<typeof tableSchema>
export type TableRow = Record<string, unknown>

/** 表格结构的初始 / 复位值；派发器每次重算都基于它构造草稿 */
export function createTableSchema(): TableSchema {
  return {
    options: { rowKey: 'id' },
    columns: [],
    rows: []
  }
}

export function isDataColumn(column: TableColumn): column is DataColumn {
  return 'accessorKey' in column
}

export function isGroupColumn(column: TableColumn): column is GroupColumn {
  return 'children' in column
}
