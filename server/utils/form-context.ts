import type { FieldCondition, FieldValidation, FormField, FormGroup, FormSchema } from '#shared/utils/form-schema'

/** 单个已填值的字符串上限，避免长文本备注挤占 prompt */
const MAX_VALUE_LENGTH = 60

const OP_LABEL: Record<FieldCondition['op'], string> = {
  eq: '等于',
  ne: '不等于',
  in: '属于',
  notIn: '不属于',
  gt: '大于',
  lt: '小于',
  truthy: '有值',
  falsy: '无值'
}

function describeValidation(validation: FieldValidation | undefined, type: FormField['type']): string[] {
  if (!validation) return []

  const parts: string[] = []
  const unit = type === 'number' || type === 'slider' || type === 'rating' ? '' : '字符'

  if (validation.min !== undefined) parts.push(`最小 ${validation.min}${unit}`)
  if (validation.max !== undefined) parts.push(`最大 ${validation.max}${unit}`)
  if (validation.integer) parts.push('必须为整数')
  if (validation.pattern) parts.push(`正则 ${validation.pattern}`)

  return parts.length ? [`校验：${parts.join('、')}`] : []
}

function describeCondition(condition: FieldCondition | undefined): string[] {
  if (!condition) return []

  const target = OP_LABEL[condition.op]
  const value = condition.op === 'truthy' || condition.op === 'falsy'
    ? ''
    : ` ${JSON.stringify(condition.value)}`

  return [`显示条件：${condition.field} ${target}${value}`]
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

  segments.push(...describeValidation(field.validation, field.type))
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
 * 重跑一遍（generate-form 之后接一串 update-field），既贵又不可靠。
 */
export function summarizeForm(schema: FormSchema, values: Record<string, unknown>): string | null {
  if (!schema.fields.length) return null

  const header = [`当前表单「${schema.title || '未命名表单'}」`]
  if (schema.description) header.push(`说明：${schema.description}`)
  if (schema.submitText) header.push(`提交按钮：${schema.submitText}`)

  const lines = [header.join('，')]

  if (schema.groups.length) {
    lines.push(`分组：${schema.groups.map(describeGroup).join('；')}`)
  }

  lines.push('字段（按展示顺序）：')
  lines.push(...schema.fields.map(describeField))

  const filled = describeValues(values)
  if (filled) lines.push(filled)

  lines.push('修改表单时用上面第二列的 name 定位字段，调用 update-field / set-field-validation / set-field-options / set-field-condition 等增量工具。不要为了改动局部而重新调用 generate-form——那会丢掉现有内容。')

  return lines.join('\n')
}
