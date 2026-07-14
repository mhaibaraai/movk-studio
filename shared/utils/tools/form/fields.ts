import { z } from 'zod'
import type { ToolContract } from '../types'
import { conditionSchema, fieldSchema, optionSchema, validationSchema } from '../../form-schema'

const upsertField = fieldSchema.partial().extend({
  name: z.string().describe('字段 name，表单内唯一。已存在则修改该字段，不存在则新增；新增时必须同时传 type 与 label'),
  options: z.array(optionSchema).nullish().describe('完整选项列表，整体替换原有选项（增删单个选项时要把完整列表一并传上）；传 null 清除。select / radio / pills 必须有选项'),
  validation: validationSchema.nullish().describe('完整校验规则，整体替换原有规则（要保留的规则须一并传上）；传 null 清除全部校验'),
  condition: conditionSchema.nullish().describe('显示条件，只能是「某字段 + 比较方式 + 比较值」这种声明式结构，不支持任意表达式；传 null 清除条件让该字段恒定显示。被隐藏的字段不参与校验，不会挡住提交'),
  afterField: z.string().optional().describe('新增字段时插入到哪个字段之后（传该字段的 name）；不传则追加到末尾。修改已有字段时忽略')
}).shape

const removeField = {
  name: z.string().describe('要移除的字段 name')
}

const reorderFields = {
  names: z.array(z.string()).min(1).describe('按新顺序排列的全部字段 name；未列出的字段保持在原有相对位置之后')
}

export const FORM_FIELD_TOOLS = {
  'upsert-field': {
    description: '新增一个字段，或修改已有字段的任意属性：类型、标签、说明、占位文案、所属分组、默认值、校验规则、选项、显示条件。用户说「再加一个手机号」「在姓名后面加个性别」「手机号改成必填」「姓名至少两个字」「勾选了有车才显示车牌号」时都用它。只传需要改的项，未传的保持原样。',
    input: upsertField,
    icon: 'i-lucide-pencil',
    status: ['正在编辑字段…', '已编辑字段'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'remove-field': {
    description: '从表单中移除一个字段。',
    input: removeField,
    icon: 'i-lucide-minus',
    status: ['正在移除字段…', '已移除字段'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'reorder-fields': {
    description: '重新排列字段顺序。传入按新顺序排列的全部字段 name。用户说「把手机号挪到最前面」「按姓名、性别、年龄排」时使用。',
    input: reorderFields,
    icon: 'i-lucide-arrow-up-down',
    status: ['正在调整字段顺序…', '已调整字段顺序'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
