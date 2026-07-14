import { z } from 'zod'

/**
 * 声明式条件的契约，被表单的字段联动与数据表格的行内动作共享。
 *
 * 绝不接受表达式字符串、绝不 eval——八个算子的语义见 condition-semantics 的 CONDITION_OPS。
 */

export const CONDITION_OP_NAMES = ['eq', 'ne', 'in', 'notIn', 'gt', 'lt', 'truthy', 'falsy'] as const

export type ConditionOp = typeof CONDITION_OP_NAMES[number]

export const conditionSchema = z.object({
  field: z.string().describe('被依赖字段的 name'),
  op: z.enum(CONDITION_OP_NAMES).describe('比较方式：eq 等于、ne 不等于、in 在集合内、notIn 不在集合内、gt 大于、lt 小于、truthy 有值、falsy 无值'),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()]))
  ]).optional().describe('比较值；op 为 truthy / falsy 时不需要，in / notIn 时传数组')
})

export type Condition = z.infer<typeof conditionSchema>
