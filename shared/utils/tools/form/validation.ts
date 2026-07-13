import { z } from 'zod'
import type { ToolContract } from '../types'
import { optionSchema, validationSchema } from './shapes'

const setFieldValidation = {
  name: z.string().describe('要设置校验的字段 name'),
  validation: validationSchema.describe('该字段的完整校验规则，整体替换原有规则')
}

const setFieldOptions = {
  name: z.string().describe('要设置选项的字段 name；该字段类型须为 select / radio / pills'),
  options: z.array(optionSchema).min(1).describe('完整选项列表，整体替换原有选项')
}

export const FORM_VALIDATION_TOOLS = {
  'set-field-validation': {
    workspaces: ['form'],
    description: '设置一个字段的校验规则：是否必填、长度或数值范围、正则格式。整体替换该字段原有的校验规则，所以要把希望保留的规则一并传上。用户说「手机号改成必填」「姓名至少两个字」「邮箱要校验格式」时使用。',
    input: setFieldValidation,
    output: z.object(setFieldValidation),
    icon: 'i-lucide-shield-check',
    status: ['正在设置校验规则…', '已设置校验规则'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'set-field-options': {
    workspaces: ['form'],
    description: '设置下拉选择、单选组或胶囊选择字段的可选项。整体替换原有选项，所以增删单个选项时要把完整列表一并传上。',
    input: setFieldOptions,
    output: z.object(setFieldOptions),
    icon: 'i-lucide-list',
    status: ['正在设置选项…', '已设置选项'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
