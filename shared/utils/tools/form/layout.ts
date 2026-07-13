import { z } from 'zod'
import type { ToolContract } from '../types'
import { groupSchema } from './shapes'

const setLayout = {
  groups: z.array(groupSchema).describe('完整的分组定义，整体替换原有分组；传空数组即取消所有分组'),
  assignments: z.record(z.string(), z.string()).optional()
    .describe('字段归属：键为字段 name，值为分组 id；未列出的字段保持原有归属。分组被删除时其字段自动回到顶层')
}

export const FORM_LAYOUT_TOOLS = {
  'set-layout': {
    workspaces: ['form'],
    description: '定义表单的分组与栅格布局，并指定哪些字段属于哪个分组。整体替换现有分组，所以要把希望保留的分组一并传上。用户说「按基本信息和联系方式分两块」「这几个字段并排放两列」「补充信息折叠起来」时使用。',
    input: setLayout,
    output: z.object(setLayout),
    icon: 'i-lucide-layout-grid',
    status: ['正在调整布局…', '已调整布局'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
