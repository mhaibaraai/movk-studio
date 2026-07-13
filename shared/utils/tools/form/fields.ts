import { z } from 'zod'
import type { ToolContract } from '../types'
import { fieldSchema } from './shapes'

const addField = {
  field: fieldSchema,
  afterField: z.string().optional().describe('插入到哪个字段之后（传该字段的 name）；不传则追加到末尾')
}

// 除 name 外全部可选：只传需要改的项，未传的项保持原样
const updateField = {
  name: z.string().describe('要修改的字段 name'),
  type: fieldSchema.shape.type.optional(),
  label: fieldSchema.shape.label.optional(),
  description: fieldSchema.shape.description,
  placeholder: fieldSchema.shape.placeholder,
  group: fieldSchema.shape.group,
  defaultValue: fieldSchema.shape.defaultValue,
  controlProps: fieldSchema.shape.controlProps
}

const removeField = {
  name: z.string().describe('要移除的字段 name')
}

const reorderFields = {
  names: z.array(z.string()).min(1).describe('按新顺序排列的全部字段 name；未列出的字段保持在原有相对位置之后')
}

export const FORM_FIELD_TOOLS = {
  'add-field': {
    workspaces: ['form'],
    description: '往当前表单追加或插入一个字段。用户说「再加一个手机号」「在姓名后面加个性别」时使用。字段的 name 必须在表单内唯一。',
    input: addField,
    output: z.object(addField),
    icon: 'i-lucide-plus',
    status: ['正在添加字段…', '已添加字段'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  'update-field': {
    workspaces: ['form'],
    description: '修改一个已有字段的类型、标签、说明、占位文案、所属分组或默认值。只传需要改的项，未传的保持原样。改校验规则用 set-field-validation，改选项用 set-field-options，改显示条件用 set-field-condition。',
    input: updateField,
    output: z.object(updateField),
    icon: 'i-lucide-pencil',
    status: ['正在修改字段…', '已修改字段'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'remove-field': {
    workspaces: ['form'],
    description: '从表单中移除一个字段。',
    input: removeField,
    output: z.object(removeField),
    icon: 'i-lucide-minus',
    status: ['正在移除字段…', '已移除字段'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'reorder-fields': {
    workspaces: ['form'],
    description: '重新排列字段顺序。传入按新顺序排列的全部字段 name。用户说「把手机号挪到最前面」「按姓名、性别、年龄排」时使用。',
    input: reorderFields,
    output: z.object(reorderFields),
    icon: 'i-lucide-arrow-up-down',
    status: ['正在调整字段顺序…', '已调整字段顺序'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
