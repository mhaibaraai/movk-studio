import type { FieldCondition, FormField, FormGroup, FormSchema } from '#shared/utils/form-schema'
import { activeRules, walkForm } from '#shared/utils/form-semantics'
import { CONDITION_OPS } from '#shared/utils/condition-semantics'

/** 单个已填值的字符串上限，避免长文本备注挤占 prompt */
const MAX_VALUE_LENGTH = 60

function describeCondition(condition: FieldCondition | undefined): string[] {
  if (!condition) return []

  const { label, needsValue } = CONDITION_OPS[condition.op]
  const value = needsValue ? ` ${JSON.stringify(condition.value)}` : ''

  return [`显示条件：${condition.field} ${label}${value}`]
}

function describeField(field: FormField, index: number): string {
  const segments = [
    `${index + 1}. ${field.name}`,
    field.type,
    `「${field.label}」`,
    field.validation?.required === false ? '选填' : '必填'
  ]

  if (field.group) segments.push(`组 ${field.group}`)
  if (field.options?.length) {
    segments.push(`选项：${field.options.map(option => `${option.label}=${option.value}`).join(' / ')}`)
  }
  if (field.defaultValue !== undefined) segments.push(`默认值 ${JSON.stringify(field.defaultValue)}`)

  const rules = activeRules(field.type, field.validation)
  if (rules.length) segments.push(`校验：${rules.map(rule => rule.label).join('、')}`)

  segments.push(...describeCondition(field.condition))

  return segments.join('  ')
}

function describeGroup(group: FormGroup): string {
  const parts = [`${group.id}「${group.title ?? '未命名'}」${group.columns ?? 1} 列`]
  if (group.collapsible) parts.push('可折叠')
  return parts.join('，')
}

/** 已填值来自客户端，可能含 File 等非 JSON 值，一律防御性字符串化并截断 */
function describeValues(values: Record<string, unknown>): string | null {
  const entries = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
      const clipped = text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
      return `${key}=${clipped}`
    })

  return entries.length ? `用户当前填写的值：${entries.join('，')}` : null
}

/**
 * 把当前表单结构与已填值摘要成一段可注入 system prompt 的文本；空表单返回 null。
 *
 * 必须带 name 列——AI 靠它定位字段做增量修改。不注入的话它只能把归约算法在脑子里
 * 重跑一遍（generate-form 之后接一串 upsert-field），既贵又不可靠。
 */
export function summarizeForm(schema: FormSchema, values: Record<string, unknown>): string | null {
  if (!schema.fields.length) return null

  const lines: string[] = []

  // 分组的展示顺序与画布一致
  const groups = walkForm(schema).flatMap(node => (node.kind === 'group' ? [node.group] : []))
  if (groups.length) {
    lines.push(`分组：${groups.map(describeGroup).join('；')}`)
  }

  lines.push('当前表单的字段（按展示顺序）：')
  lines.push(...schema.fields.map(describeField))

  const filled = describeValues(values)
  if (filled) lines.push(filled)

  lines.push('修改表单时用上面第二列的 name 定位字段，调用 upsert-field 等增量工具。不要为了改动局部而重新调用 generate-form——那会丢掉现有内容。')

  return lines.join('\n')
}
