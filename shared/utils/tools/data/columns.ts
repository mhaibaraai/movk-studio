import { z } from 'zod'
import type { ToolContract } from '../types'
import { actionSchema, cellSchema, dataColumnSchema, SELECTION_MODES, TREE_STRATEGIES } from '../../table-schema'
import { conditionSchema } from '../../condition'

/**
 * 一个 upsert 覆盖全部列种类：数据列给 accessorKey，特殊列给 type，分组表头给 children。
 * 定位一律靠 key，与表单里靠 name 定位字段同构。
 */
const upsertColumn = dataColumnSchema.partial().extend({
  key: z.string().describe('列的唯一标识。已存在则修改该列，不存在则新增；数据列的 key 须与 accessorKey 一致'),
  accessorKey: z.string().optional().describe('绑定的数据字段名；新增数据列时必传'),
  type: z.enum(['selection', 'index', 'expand', 'row-pinning', 'actions']).optional().describe('特殊列的种类；新增特殊列时必传，数据列不要传'),
  cell: cellSchema.nullish().describe('完整的单元格渲染配置，整体替换原有配置（改 colorMap 时要把完整映射一并传上）；传 null 退回纯文本'),
  fixed: z.enum(['left', 'right']).nullish().describe('固定到左侧或右侧；传 null 取消固定'),
  truncate: z.union([z.boolean(), z.number().int().min(1).max(5)]).nullish().describe('文本截断；传 null 取消'),
  tooltip: z.union([z.boolean(), z.number().int().min(1).max(5)]).nullish().describe('截断并溢出时浮出完整内容；传 null 取消'),
  children: z.array(dataColumnSchema).nullish().describe('分组表头下的数据列，整体替换；传 null 取消分组'),
  mode: z.enum(SELECTION_MODES).optional().describe('选择列：多选 multiple（缺省）或单选 single'),
  strategy: z.enum(TREE_STRATEGIES).optional().describe('选择列在树形表格下的父子勾选关系'),
  position: z.enum(['top', 'bottom']).optional().describe('行固定列：钉到表头还是表尾'),
  maxInline: z.number().int().min(0).max(6).optional().describe('操作列：平铺的按钮数，超出的折叠进溢出菜单'),
  actions: z.array(actionSchema).nullish().describe('操作列的完整动作列表，整体替换（增删单个动作时要把完整列表一并传上）'),
  disabledWhen: conditionSchema.nullish().describe('选择列：满足条件的行不可勾选；传 null 清除'),
  afterColumn: z.string().optional().describe('新增列时插入到哪一列之后（传该列的 key）；不传则追加到末尾。修改已有列时忽略')
}).shape

const removeColumn = {
  key: z.string().describe('要移除的列的 key')
}

const reorderColumns = {
  keys: z.array(z.string()).min(1).describe('按新顺序排列的全部列 key；未列出的列保持在原有相对位置之后')
}

export const DATA_COLUMN_TOOLS = {
  'upsert-column': {
    description: '新增一列，或修改已有列的任意属性：表头、单元格渲染方式、排序、固定、列宽、截断、对齐、可见性，以及特殊列（选择、序号、展开、行固定、操作）的专属配置。用户说「加一个状态列」「薪资列右对齐显示成金额」「状态做成彩色标签」「加一个操作列，带编辑和删除」「把地址列截断」时都用它。只传需要改的项，未传的保持原样。',
    input: upsertColumn,
    icon: 'i-lucide-pencil',
    status: ['正在编辑列…', '已编辑列'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'remove-column': {
    description: '从表格中移除一列。',
    input: removeColumn,
    icon: 'i-lucide-minus',
    status: ['正在移除列…', '已移除列'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'reorder-columns': {
    description: '重新排列列顺序。传入按新顺序排列的全部列 key。用户说「把状态挪到最前面」「操作列放最后」时使用。',
    input: reorderColumns,
    icon: 'i-lucide-arrow-left-right',
    status: ['正在调整列顺序…', '已调整列顺序'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
