import { z } from 'zod'
import type { ToolContract } from '../types'
import { paginationSchema, tableOptionsSchema } from '../../table-schema'

const setTableOptions = tableOptionsSchema.partial().extend({
  childrenKey: z.string().nullish().describe('子行字段名，设了就是树形表格；传 null 退回平铺表格。切成树形时示例数据必须在该键下带嵌套子行——没有嵌套数据就先用 generate-table 重造一份'),
  pagination: paginationSchema.nullish().describe('完整分页配置，整体替换；传 null 关闭分页'),
  emptyCell: z.string().max(20).nullish().describe('空值占位文案；传 null 恢复默认')
}).shape

export const DATA_OPTIONS_TOOLS = {
  'set-table-options': {
    description: '调整表格级配置：行标识字段、树形（childrenKey）、分页、排序 / 列固定 / 列宽拖拽的总开关，以及斑马纹、边框、密度、粘性表头、空值占位等外观。用户说「开启分页，每页 10 条」「加上斑马纹」「所有列都能排序」「做成树形表格」「紧凑一点」时使用。只传需要改的项，未传的保持原样。',
    input: setTableOptions,
    icon: 'i-lucide-settings-2',
    status: ['正在调整表格配置…', '已调整表格配置'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
