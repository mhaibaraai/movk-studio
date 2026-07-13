import type { z } from 'zod'
import { z as zod } from 'zod'
import { FormGroup as FormGroupComponent } from '#components'
import type { FieldCondition, FieldType, FieldValidation, FormField, FormSchema } from '#shared/utils/form-schema'

type Afz = ReturnType<typeof useAutoForm>['afz']

/** 字段类型 → 控件 key（DEFAULT_CONTROLS 的键）；undefined 表示用该 zod 类型的默认控件 */
const FIELD_CONTROL: Record<FieldType, string | undefined> = {
  text: undefined,
  textarea: 'textarea',
  password: 'withPasswordToggle',
  email: undefined,
  url: undefined,
  phone: 'asPhoneNumberInput',
  number: undefined,
  slider: 'slider',
  rating: 'starRating',
  switch: 'switch',
  checkbox: undefined,
  select: 'selectMenu',
  radio: 'radioGroup',
  pills: 'pillGroup',
  tags: 'inputTags',
  date: undefined,
  time: undefined,
  file: undefined,
  color: 'colorChooser',
  pin: 'pinInput'
}

// 只有文本 / 数值 / 选择类控件认 placeholder；开关、评分、取色器传了只会漏成 DOM 属性
const PLACEHOLDER_TYPES = new Set<FieldType>([
  'text', 'textarea', 'password', 'email', 'url', 'phone', 'number', 'select', 'tags'
])

const EVENT_PROP = /^on[A-Z]/

/** AI 生成的正则源串长度上限，缓解 ReDoS 卡死浏览器主线程 */
const MAX_PATTERN_LENGTH = 200

/** 正则来自 AI，非法或过长时跳过这一条校验，而不是让整个表单编译失败 */
function compileRegExp(pattern?: string): RegExp | undefined {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return undefined

  try {
    return new RegExp(pattern)
  } catch {
    return undefined
  }
}

/** 声明式条件求值；绝不 eval AI 产出的字符串 */
export function evalCondition(condition: FieldCondition, state: Record<string, unknown>): boolean {
  const actual = state[condition.field]
  const { op, value } = condition

  switch (op) {
    case 'truthy':
      return Boolean(actual)
    case 'falsy':
      return !actual
    case 'eq':
      return actual === value
    case 'ne':
      return actual !== value
    case 'in':
      return Array.isArray(value) && value.some(item => item === actual)
    case 'notIn':
      return Array.isArray(value) && !value.some(item => item === actual)
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value
  }
}

/** controlProps 直通 AI 输入，剔除事件处理器键（包侧同样用 /^on[A-Z]/ 检测） */
function safeControlProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {}
  return Object.fromEntries(Object.entries(props).filter(([key]) => !EVENT_PROP.test(key)))
}

function controlPropsFor(field: FormField): Record<string, unknown> {
  const derived: Record<string, unknown> = {}

  if (field.placeholder && PLACEHOLDER_TYPES.has(field.type)) {
    derived.placeholder = field.placeholder
  }
  if (field.options?.length) {
    derived.items = field.options
  }
  // 日期值默认是 CalendarDate 实例，无法进 JSON（落 prompt、落 codegen 都会失真）；统一取 ISO 字符串
  if (field.type === 'date') {
    derived.valueFormat = 'iso'
  }

  return { ...derived, ...safeControlProps(field.controlProps) }
}

/**
 * afz 的重载按控件 key 静态收窄 controlProps 的类型，而这里的控件 key 与 props 全部来自
 * 运行时 JSON，类型层无从对上号。整个编译器只在这一处收口成 never，其余保持类型安全。
 */
function fieldMeta(field: FormField): never {
  const control = FIELD_CONTROL[field.type]
  const condition = field.condition

  return {
    ...(control ? { type: control } : {}),
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    // meta.if 收 ReactiveValue<boolean, AutoFormFieldContext>，ctx.state 是整个表单的当前值
    ...(condition
      ? { if: (ctx: { state: Record<string, unknown> }) => evalCondition(condition, ctx.state) }
      : {}),
    controlProps: controlPropsFor(field)
  } as never
}

function stringRules(schema: z.ZodString, rules: FieldValidation | undefined): z.ZodString {
  let out = schema
  if (rules?.min !== undefined) out = out.min(rules.min, `最少 ${rules.min} 个字符`)
  if (rules?.max !== undefined) out = out.max(rules.max, `最多 ${rules.max} 个字符`)

  const pattern = compileRegExp(rules?.pattern)
  if (pattern) out = out.regex(pattern, rules?.patternMessage ?? '格式不正确')

  return out
}

function numberRules(schema: z.ZodNumber, rules: FieldValidation | undefined): z.ZodNumber {
  let out = schema
  if (rules?.integer) out = out.int('必须是整数')
  if (rules?.min !== undefined) out = out.min(rules.min, `不能小于 ${rules.min}`)
  if (rules?.max !== undefined) out = out.max(rules.max, `不能大于 ${rules.max}`)

  return out
}

function baseSchema(field: FormField, afz: Afz): z.ZodType {
  const meta = fieldMeta(field)
  const rules = field.validation

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'password':
    case 'phone':
    case 'color':
    case 'pin':
      return stringRules(afz.string(meta), rules)
    case 'email':
      return stringRules(afz.email(meta), rules)
    case 'url':
      return stringRules(afz.url(meta), rules)
    case 'number':
    case 'slider':
    case 'rating':
      return numberRules(afz.number(meta), rules)
    case 'switch':
    case 'checkbox':
      return afz.boolean(meta)
    case 'select':
    case 'radio':
    case 'pills':
      // 选项为空时 afz.enum 退化成 z.string()，控件仍渲染但无可选项——不崩，等 AI 补 set-field-options
      return afz.enum((field.options ?? []).map(option => option.value), meta)
    case 'tags':
      return afz.array(zod.string(), meta)
    case 'date':
      return afz.calendarDate(meta)
    case 'time':
      return afz.inputTime(meta)
    case 'file':
      return afz.file(meta)
  }
}

function compileField(field: FormField, afz: Afz): z.ZodType {
  let schema = baseSchema(field, afz)

  if (field.defaultValue !== undefined) schema = schema.default(field.defaultValue as never)
  // AutoForm 的必填星号从 zod 的可选性反推（required: !decorators.isOptional），无需另写 meta
  if (field.validation?.required === false) schema = schema.optional()

  return schema
}

/**
 * FormSchema → 带 meta 的 z.ZodObject，直接喂给 <AutoForm :schema>。
 *
 * 分组用 afz.layout 包一层：它产出的 LayoutFieldMarker 只影响渲染，
 * 类型与运行时都会被展平回顶层 shape，故表单数据始终是扁平的 { name, phone, ... }。
 *
 * 顺序按 fields 的扁平顺序走：首次遇到某分组的字段时就地展开整个分组，
 * 分组内字段仍按扁平顺序排列——分组字段交错时行为可预期。
 */
export function compileFormSchema(schema: FormSchema, afz: Afz): z.ZodObject {
  const shape: Record<string, z.ZodType> = {}
  const groups = new Map(schema.groups.map(group => [group.id, group]))
  const expanded = new Set<string>()

  for (const field of schema.fields) {
    const group = field.group ? groups.get(field.group) : undefined

    // 无分组，或指向了不存在的分组：直接落在顶层
    if (!group) {
      shape[field.name] = compileField(field, afz)
      continue
    }

    if (expanded.has(group.id)) continue
    expanded.add(group.id)

    const groupFields: Record<string, z.ZodType> = {}
    for (const member of schema.fields) {
      if (member.group === group.id) groupFields[member.name] = compileField(member, afz)
    }

    shape[`__group_${group.id}`] = afz.layout({
      component: FormGroupComponent,
      props: { title: group.title, columns: group.columns ?? 1, collapsible: group.collapsible ?? false },
      fields: groupFields
    })
  }

  return afz.object(shape)
}
