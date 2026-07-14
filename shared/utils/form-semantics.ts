import type { z } from 'zod'
import type { FieldType, FieldValidation, FormField, FormGroup, FormSchema } from './form-schema'

/**
 * 表单语义的唯一真源，被三个消费者共享：
 * 画布编译（app/utils/form-compiler）、代码导出（app/utils/form-codegen）、prompt 摘要（server/utils/form-context）。
 *
 * 每条语义只在这里定义一次，并同时给出三个视图：怎么求值、怎么生成代码、怎么说成人话。
 * 三视图同义由 test/form-semantics.spec.ts 对拍保证。
 */

export interface FieldTypeSpec {
  /** afz 的工厂方法名 */
  factory: string
  /** 控件 key（DEFAULT_CONTROLS 的键）；省略表示用该 zod 类型的默认控件 */
  control?: string
}

export const FIELD_SPEC: Record<FieldType, FieldTypeSpec> = {
  text: { factory: 'string' },
  textarea: { factory: 'string', control: 'textarea' },
  password: { factory: 'string', control: 'withPasswordToggle' },
  email: { factory: 'email' },
  url: { factory: 'url' },
  phone: { factory: 'string', control: 'asPhoneNumberInput' },
  number: { factory: 'number' },
  slider: { factory: 'number', control: 'slider' },
  rating: { factory: 'number', control: 'starRating' },
  switch: { factory: 'boolean', control: 'switch' },
  checkbox: { factory: 'boolean' },
  select: { factory: 'enum', control: 'selectMenu' },
  radio: { factory: 'enum', control: 'radioGroup' },
  pills: { factory: 'enum', control: 'pillGroup' },
  tags: { factory: 'array', control: 'inputTags' },
  date: { factory: 'calendarDate' },
  time: { factory: 'inputTime' },
  file: { factory: 'file' },
  color: { factory: 'string', control: 'colorChooser' },
  pin: { factory: 'string', control: 'pinInput' }
}

/** 分组栅格类名。必须是完整字面量，Tailwind 不扫描拼接出来的类名 */
export const COLUMN_CLASS: Record<1 | 2 | 3, string> = {
  1: 'grid grid-cols-1 gap-4',
  2: 'grid grid-cols-1 sm:grid-cols-2 gap-4',
  3: 'grid grid-cols-1 sm:grid-cols-3 gap-4'
}

// 只有文本 / 数值 / 选择类控件认 placeholder；开关、评分、取色器传了只会漏成 DOM 属性
const PLACEHOLDER_TYPES = new Set<FieldType>([
  'text', 'textarea', 'password', 'email', 'url', 'phone', 'number', 'select', 'tags'
])

const EVENT_PROP = /^on[A-Z]/

/** AI 生成的正则源串长度上限，缓解 ReDoS 卡死浏览器主线程 */
const MAX_PATTERN_LENGTH = 200

/** 正则来自 AI，非法或过长时返回 undefined，由调用方跳过这一条校验，而不是让整个表单编译失败 */
export function compileRegExp(pattern?: string): RegExp | undefined {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return undefined

  try {
    return new RegExp(pattern)
  } catch {
    return undefined
  }
}

/** controlProps 直通 AI 输入，剔除事件处理器键（包侧同样用 /^on[A-Z]/ 检测） */
function safeControlProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {}
  return Object.fromEntries(Object.entries(props).filter(([key]) => !EVENT_PROP.test(key)))
}

export function fieldControlProps(field: FormField): Record<string, unknown> {
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

/** 一条校验规则的三视图，值已在 activeRules 里绑定好 */
export interface ActiveRule {
  /** 运行时：把这条规则套到 zod schema 上 */
  apply: (schema: z.ZodType) => z.ZodType
  /** 导出：afz 链上的一节，如 `.min(2, '最少 2 个字符')` */
  code: string
  /** prompt 摘要：如 `最少 2 个字符` */
  label: string
}

interface Rule<S extends z.ZodType, V> {
  /** 从校验规则里取出这一条的值；返回 undefined 表示未设置或不可用（如非法正则），三个消费者一致跳过 */
  pick: (rules: FieldValidation) => V | undefined
  /** 校验失败的提示文案；运行时与导出代码共用同一句 */
  message: (value: V, rules: FieldValidation) => string
  apply: (schema: S, value: V, message: string) => S
  code: (value: V, message: string) => string
  label: (value: V) => string
}

/**
 * 规则数组是异构的（V 分别是 number / RegExp / true，S 分别是 ZodString / ZodNumber），
 * 这里收口成擦除后的形态：定义处按具体类型做完整检查，消费处只见 ZodType / unknown。
 *
 * 擦除靠转换完成——apply 的入参是逆变的，窄类型的函数赋不回宽类型。
 * 安全性由 rulesFor 保证：它只把 STRING_RULES 交给文本族的 schema，NUMBER_RULES 交给数值族的。
 */
function defineRule<S extends z.ZodType, V>(rule: Rule<S, V>): Rule<z.ZodType, unknown> {
  return rule as unknown as Rule<z.ZodType, unknown>
}

/** 正则字面量：内部的斜杠必须转义，否则会提前闭合 */
function printRegExp(pattern: string): string {
  return `/${pattern.replace(/\//g, '\\/')}/`
}

const STRING_RULES = [
  defineRule<z.ZodString, number>({
    pick: rules => rules.min,
    message: value => `最少 ${value} 个字符`,
    apply: (schema, value, message) => schema.min(value, message),
    code: (value, message) => `.min(${value}, ${JSON.stringify(message)})`,
    label: value => `最少 ${value} 个字符`
  }),
  defineRule<z.ZodString, number>({
    pick: rules => rules.max,
    message: value => `最多 ${value} 个字符`,
    apply: (schema, value, message) => schema.max(value, message),
    code: (value, message) => `.max(${value}, ${JSON.stringify(message)})`,
    label: value => `最多 ${value} 个字符`
  }),
  defineRule<z.ZodString, RegExp>({
    // 非法正则在这里就被剔除：预览不套、导出不写、prompt 不提，三处不会各自漏判
    pick: rules => compileRegExp(rules.pattern),
    message: (_value, rules) => rules.patternMessage ?? '格式不正确',
    apply: (schema, value, message) => schema.regex(value, message),
    code: (value, message) => `.regex(${printRegExp(value.source)}, ${JSON.stringify(message)})`,
    label: value => `正则 ${value.source}`
  })
]

const NUMBER_RULES = [
  defineRule<z.ZodNumber, true>({
    pick: rules => rules.integer || undefined,
    message: () => '必须是整数',
    apply: (schema, _value, message) => schema.int(message),
    code: (_value, message) => `.int(${JSON.stringify(message)})`,
    label: () => '必须是整数'
  }),
  defineRule<z.ZodNumber, number>({
    pick: rules => rules.min,
    message: value => `不能小于 ${value}`,
    apply: (schema, value, message) => schema.min(value, message),
    code: (value, message) => `.min(${value}, ${JSON.stringify(message)})`,
    label: value => `不能小于 ${value}`
  }),
  defineRule<z.ZodNumber, number>({
    pick: rules => rules.max,
    message: value => `不能大于 ${value}`,
    apply: (schema, value, message) => schema.max(value, message),
    code: (value, message) => `.max(${value}, ${JSON.stringify(message)})`,
    label: value => `不能大于 ${value}`
  })
]

/** 链式校验只对文本族与数值族成立；其余字段类型（开关、日期、文件…）没有可链的规则 */
function rulesFor(type: FieldType): Rule<z.ZodType, unknown>[] {
  const { factory } = FIELD_SPEC[type]

  if (factory === 'number') return NUMBER_RULES
  if (factory === 'string' || factory === 'email' || factory === 'url') return STRING_RULES

  return []
}

/**
 * 某字段上真正生效的校验规则，按声明顺序。
 *
 * required 不在其中——它决定的是 .optional()，不是链上的一节，由调用方各自处理。
 */
export function activeRules(type: FieldType, rules: FieldValidation | undefined): ActiveRule[] {
  if (!rules) return []

  const active: ActiveRule[] = []

  for (const rule of rulesFor(type)) {
    const value = rule.pick(rules)
    if (value === undefined) continue

    const message = rule.message(value, rules)

    active.push({
      apply: schema => rule.apply(schema, value, message),
      code: rule.code(value, message),
      label: rule.label(value)
    })
  }

  return active
}

export type FormNode
  = | { kind: 'field', field: FormField }
    | { kind: 'group', group: FormGroup, fields: FormField[] }

/**
 * 表单的渲染顺序：按字段的扁平顺序走，首次遇到某分组的字段时就地展开整组，
 * 组内字段仍按扁平顺序排列——分组字段交错时行为可预期。指向不存在分组的字段落回顶层。
 */
export function walkForm(schema: FormSchema): FormNode[] {
  const groups = new Map(schema.groups.map(group => [group.id, group]))
  const expanded = new Set<string>()
  const nodes: FormNode[] = []

  for (const field of schema.fields) {
    const group = field.group ? groups.get(field.group) : undefined

    if (!group) {
      nodes.push({ kind: 'field', field })
      continue
    }

    if (expanded.has(group.id)) continue
    expanded.add(group.id)

    nodes.push({
      kind: 'group',
      group,
      fields: schema.fields.filter(member => member.group === group.id)
    })
  }

  return nodes
}
