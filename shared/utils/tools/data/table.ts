import { z } from 'zod'
import type { ToolContract } from '../types'
import { columnSchema, tableOptionsSchema } from '../../table-schema'

const generateTable = {
  options: tableOptionsSchema.describe('表格级配置：行标识字段、分页与外观；至少要给 rowKey'),
  columns: z.array(columnSchema).min(1).describe('全部列，按展示顺序排列'),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(50).describe('示例数据，8 到 15 行即可；字段与数据列的 accessorKey 对应，且每行都要有 rowKey 指定的键')
}

export const DATA_TABLE_TOOLS = {
  'generate-table': {
    description: '一次性生成一张完整的数据表格（列定义 + 示例数据 + 表格配置），整体替换画布上现有的表格。用户描述一个新表格需求（如「做一张员工花名册」「我要一个订单列表」）时使用。已有表格需要局部修改时不要用它——那会丢掉现有内容，请改用 upsert-column 等增量工具。',
    input: generateTable,
    icon: 'i-lucide-wand-sparkles',
    status: ['正在生成表格…', '已生成表格'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'clear-table': {
    description: '清空画布上的整个表格，包括全部列与示例数据。用户明确要求「清空 / 重来 / 全部删掉」时使用。',
    input: {},
    icon: 'i-lucide-trash-2',
    status: ['正在清空表格…', '已清空表格'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'export-table-code': {
    description: '把当前表格导出为一个 Vue 单文件组件并下载，内容是可直接粘回项目使用的 MDataTable 写法代码。用户说「导出代码 / 下载下来 / 给我代码文件」时使用。用户只是想看看代码时不必调用——画布上的「代码」页签已经实时展示了同一份代码。',
    input: {
      fileName: z.string().max(80).optional().describe('下载文件名，不含扩展名（会自动加 .vue），缺省为 data-table')
    },
    output: z.object({ fileName: z.string() }),
    icon: 'i-lucide-download',
    status: ['正在导出代码…', '已导出代码'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
