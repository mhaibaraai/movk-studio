import { z } from 'zod'
import type { ToolContract } from '../types'
import { fieldSchema, formMetaShape, groupSchema } from './shapes'

const generateForm = {
  ...formMetaShape,
  groups: z.array(groupSchema).optional().describe('分组定义；字段超过 6 个时建议分组，不分组则省略'),
  fields: z.array(fieldSchema).min(1).describe('全部字段，按展示顺序排列')
}

const setFormMeta = {
  title: z.string().optional().describe('新的表单标题'),
  description: z.string().optional().describe('新的表单说明'),
  submitText: z.string().optional().describe('新的提交按钮文案')
}

export const FORM_SCHEMA_TOOLS = {
  'generate-form': {
    workspaces: ['form'],
    description: '一次性生成一份完整表单，整体替换画布上现有的表单。用户描述一个新表单需求（如「做一个员工入职登记表」「我要一份客户满意度问卷」）时使用。已有表单需要局部修改时不要用它——那会丢掉现有内容，请改用 add-field / update-field 等增量工具。',
    input: generateForm,
    output: z.object(generateForm),
    icon: 'i-lucide-wand-sparkles',
    status: ['正在生成表单…', '已生成表单'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'clear-form': {
    workspaces: ['form'],
    description: '清空画布上的整个表单，包括全部字段与分组。用户明确要求「清空 / 重来 / 全部删掉」时使用。',
    input: {},
    output: z.object({}),
    icon: 'i-lucide-trash-2',
    status: ['正在清空表单…', '已清空表单'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'set-form-meta': {
    workspaces: ['form'],
    description: '修改表单自身的标题、说明或提交按钮文案，不影响任何字段。只传需要改的项。',
    input: setFormMeta,
    output: z.object(setFormMeta),
    icon: 'i-lucide-heading',
    status: ['正在修改表单信息…', '已修改表单信息'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
