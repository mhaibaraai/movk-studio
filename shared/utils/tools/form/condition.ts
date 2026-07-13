import { z } from 'zod'
import type { ToolContract } from '../types'
import { conditionSchema } from './shapes'

const setFieldCondition = {
  name: z.string().describe('要设置显示条件的字段 name'),
  condition: conditionSchema.nullable()
    .describe('显示条件；传 null 清除条件，让该字段恒定显示')
}

export const FORM_CONDITION_TOOLS = {
  'set-field-condition': {
    workspaces: ['form'],
    description: '让一个字段只在另一个字段满足某条件时才显示。用户说「勾选了有车才显示车牌号」「选其他时才让填备注」时使用。条件只能是「某字段 + 比较方式 + 比较值」这种声明式结构，不支持任意表达式。被隐藏的字段不参与校验，不会挡住提交。',
    input: setFieldCondition,
    output: z.object(setFieldCondition),
    icon: 'i-lucide-git-branch',
    status: ['正在设置显示条件…', '已设置显示条件'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
