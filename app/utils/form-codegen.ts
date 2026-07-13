import type { FieldCondition, FieldValidation, FormField, FormGroup, FormSchema } from '#shared/utils/form-schema'

/**
 * FormSchema → 可直接粘回项目的 Vue 单文件组件（afz 写法）。
 *
 * 与 form-compiler 共用 FIELD_SPEC / fieldControlProps / RULE_MESSAGE / compileRegExp，
 * 所以导出的代码与画布上的预览逐字一致——两边各写一套的话会悄悄漂移。
 *
 * meta 拆两处，这是 @movk/nuxt 的类型分界线而非风格选择：afz 工厂的入参只接受
 * type / controlProps / controlSlots / error（AutoFormControlsMeta），label / description / if
 * 属于 ZodAutoFormFieldMeta，注册在 zod 的 GlobalMeta 上，只能经 .meta() 传入。
 * 混在一起写运行时能跑（底层都是 .meta()），但过不了 typecheck。
 *
 * 校验链在 .meta() 之前：getAutoFormMetadata 沿 _zod.parent 回溯合并，两段 meta 最终并成一份。
 */

/** 标记一段原样输出的代码（如条件表达式），区别于需要字面量化的数据 */
interface RawCode {
  __raw: string
}

function raw(code: string): RawCode {
  return { __raw: code }
}

function isRaw(value: unknown): value is RawCode {
  return typeof value === 'object' && value !== null && '__raw' in value
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** 生成的 if 回调的入参类型名；有条件字段时在文件头声明 */
const CTX_TYPE = 'FieldCtx'

function printKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key)
}

function printValue(value: unknown, indent: string): string {
  if (isRaw(value)) return value.__raw
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const inner = `${indent}  `
    const items = value.map(item => `${inner}${printValue(item, inner)}`)
    return `[\n${items.join(',\n')}\n${indent}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
    if (!entries.length) return '{}'
    const inner = `${indent}  `
    const props = entries.map(([key, item]) => `${inner}${printKey(key)}: ${printValue(item, inner)}`)
    return `{\n${props.join(',\n')}\n${indent}}`
  }

  return 'undefined'
}

/**
 * 声明式条件 → 真实的 if 表达式，语义与 evalCondition 逐条对应。
 * ctx.state 的值是 unknown，故数值比较套 Number()、集合判断用 some 而非 includes。
 */
function printCondition(condition: FieldCondition): string {
  const path = IDENTIFIER.test(condition.field)
    ? `ctx.state.${condition.field}`
    : `ctx.state[${JSON.stringify(condition.field)}]`
  const value = JSON.stringify(condition.value)
  const head = `(ctx: ${CTX_TYPE}) =>`

  switch (condition.op) {
    case 'truthy':
      return `${head} Boolean(${path})`
    case 'falsy':
      return `${head} !${path}`
    case 'eq':
      return `${head} ${path} === ${value}`
    case 'ne':
      return `${head} ${path} !== ${value}`
    case 'in':
      return `${head} ${value}.some(item => item === ${path})`
    case 'notIn':
      return `${head} !${value}.some(item => item === ${path})`
    case 'gt':
      return `${head} Number(${path}) > ${value}`
    case 'lt':
      return `${head} Number(${path}) < ${value}`
  }
}

/** afz 工厂入参：只放 AutoFormControlsMeta 认的键 */
function factoryMeta(field: FormField): Record<string, unknown> {
  const { control } = FIELD_SPEC[field.type]
  const controlProps = fieldControlProps(field)

  return {
    ...(control ? { type: control } : {}),
    ...(Object.keys(controlProps).length ? { controlProps } : {})
  }
}

/** .meta() 入参：ZodAutoFormFieldMeta 的键 */
function fieldMeta(field: FormField): Record<string, unknown> {
  return {
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    ...(field.condition ? { if: raw(printCondition(field.condition)) } : {})
  }
}

/** 正则字面量：内部的斜杠必须转义，否则会提前闭合 */
function printRegExp(pattern: string): string {
  return `/${pattern.replace(/\//g, '\\/')}/`
}

function ruleChain(field: FormField): string[] {
  const rules: FieldValidation | undefined = field.validation
  const { factory } = FIELD_SPEC[field.type]
  const chain: string[] = []

  if (factory === 'number') {
    if (rules?.integer) chain.push(`.int(${JSON.stringify(RULE_MESSAGE.integer)})`)
    if (rules?.min !== undefined) chain.push(`.min(${rules.min}, ${JSON.stringify(RULE_MESSAGE.minValue(rules.min))})`)
    if (rules?.max !== undefined) chain.push(`.max(${rules.max}, ${JSON.stringify(RULE_MESSAGE.maxValue(rules.max))})`)
  } else if (factory === 'string' || factory === 'email' || factory === 'url') {
    if (rules?.min !== undefined) chain.push(`.min(${rules.min}, ${JSON.stringify(RULE_MESSAGE.minLength(rules.min))})`)
    if (rules?.max !== undefined) chain.push(`.max(${rules.max}, ${JSON.stringify(RULE_MESSAGE.maxLength(rules.max))})`)
    // 非法正则在编译器里被跳过，导出时同样跳过——否则代码里会出现一条画布上并不生效的校验
    if (rules?.pattern && compileRegExp(rules.pattern)) {
      chain.push(`.regex(${printRegExp(rules.pattern)}, ${JSON.stringify(rules.patternMessage ?? RULE_MESSAGE.pattern)})`)
    }
  }

  return chain
}

function printField(field: FormField, indent: string): string {
  const { factory } = FIELD_SPEC[field.type]
  const meta = factoryMeta(field)
  const inner = `${indent}  `

  const factoryArgs = factory === 'enum'
    ? `${printValue((field.options ?? []).map(option => option.value), indent)}${Object.keys(meta).length ? `, ${printValue(meta, indent)}` : ''}`
    : factory === 'array'
      ? `z.string()${Object.keys(meta).length ? `, ${printValue(meta, indent)}` : ''}`
      : Object.keys(meta).length
        ? printValue(meta, indent)
        : ''

  const tail: string[] = [
    ...ruleChain(field),
    `.meta(${printValue(fieldMeta(field), indent)})`
  ]

  if (field.defaultValue !== undefined) tail.push(`.default(${printValue(field.defaultValue, indent)})`)
  if (field.validation?.required === false) tail.push('.optional()')

  return `afz.${factory}(${factoryArgs})\n${tail.map(call => `${inner}${call}`).join('\n')}`
}

function printFields(fields: FormField[], indent: string): string {
  return fields
    .map(field => `${indent}${printKey(field.name)}: ${printField(field, indent)}`)
    .join(',\n')
}

function printGroup(group: FormGroup, fields: FormField[], indent: string): string {
  const inner = `${indent}  `
  const body = `${inner}  `
  const columns = group.columns ?? 1
  const layoutClass = `grid grid-cols-1 sm:grid-cols-${columns} gap-4`

  const header = group.title
    ? `${indent}// 分组「${group.title}」${group.collapsible ? '（原为可折叠；折叠与标题需自备容器组件，经 afz.layout 的 component 传入）' : ''}\n`
    : ''

  return `${header}${indent}${printKey(`${group.id}Layout`)}: afz.layout({
${inner}class: ${JSON.stringify(layoutClass)},
${inner}fields: {
${printFields(fields, body)}
${inner}}
${indent}})`
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

function escapeText(text: string): string {
  return text.replace(/[&<>]/g, char => HTML_ESCAPE[char]!)
}

/** 落在模板双引号属性里的字符串，用单引号字面量，不能用 JSON.stringify */
function singleQuoted(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
}

/**
 * 顺序与编译器一致：按字段的扁平顺序走，首次遇到某分组的字段时就地展开整个分组。
 * afz.layout 的键会被 AutoForm 展平剥离，不进入表单数据，取什么名字都不影响结果。
 */
function printSchemaBody(schema: FormSchema): string {
  const groups = new Map(schema.groups.map(group => [group.id, group]))
  const expanded = new Set<string>()
  const entries: string[] = []
  const indent = '  '

  for (const field of schema.fields) {
    const group = field.group ? groups.get(field.group) : undefined

    if (!group) {
      entries.push(`${indent}${printKey(field.name)}: ${printField(field, indent)}`)
      continue
    }

    if (expanded.has(group.id)) continue
    expanded.add(group.id)

    entries.push(printGroup(group, schema.fields.filter(member => member.group === group.id), indent))
  }

  return entries.join(',\n')
}

/** FormSchema → 可直接落地为 .vue 文件的单文件组件源码 */
export function generateFormCode(schema: FormSchema): string {
  // 标签输入用 afz.array(z.string())，此时 z 是值引用；其余场景只用到 z.output 类型
  const needsZodValue = schema.fields.some(field => FIELD_SPEC[field.type].factory === 'array')
  const hasCondition = schema.fields.some(field => field.condition)

  const script = [
    `// ${schema.title || '未命名表单'}${schema.description ? ` —— ${schema.description}` : ''}`,
    '// 由 Movk Studio 表单工作区导出',
    'import type { FormSubmitEvent } from \'@nuxt/ui\'',
    needsZodValue ? 'import { z } from \'zod\'' : 'import type { z } from \'zod\'',
    '',
    ...(hasCondition ? [`type ${CTX_TYPE} = { state: Record<string, unknown> }`, ''] : []),
    'const { afz } = useAutoForm()',
    '',
    'const formSchema = afz.object({',
    printSchemaBody(schema),
    '})',
    '',
    'type FormValues = z.output<typeof formSchema>',
    '',
    'const formState = ref<Partial<FormValues>>({})',
    'const submitted = ref<FormValues>()',
    '',
    'function onSubmit(event: FormSubmitEvent<FormValues>) {',
    '  // event.data 已通过全部校验',
    '  submitted.value = event.data',
    '}'
  ]

  const heading = schema.title || schema.description
    ? [
        '    <div class="flex flex-col gap-1">',
        ...(schema.title ? [`      <h1 class="text-xl font-semibold text-highlighted">${escapeText(schema.title)}</h1>`] : []),
        ...(schema.description ? [`      <p class="text-sm text-muted">${escapeText(schema.description)}</p>`] : []),
        '    </div>',
        ''
      ]
    : []

  const template = [
    '  <div class="flex flex-col gap-6">',
    ...heading,
    '    <MAutoForm',
    '      :schema="formSchema"',
    '      :state="formState"',
    `      :submit-button-props="{ label: ${singleQuoted(schema.submitText || '提交')} }"`,
    '      @submit="onSubmit"',
    '    />',
    '  </div>'
  ]

  return [
    '<script setup lang="ts">',
    ...script,
    '</script>',
    '',
    '<template>',
    ...template,
    '</template>',
    ''
  ].join('\n')
}
