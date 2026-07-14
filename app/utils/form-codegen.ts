import type { FieldCondition, FormField, FormGroup, FormSchema } from '#shared/utils/form-schema'
import { COLUMN_CLASS, CONDITION_OPS, FIELD_SPEC, activeRules, fieldControlProps, walkForm } from '#shared/utils/form-semantics'

/**
 * FormSchema → 可直接粘回项目的 Vue 单文件组件（afz 写法）。
 *
 * meta 必须拆两处，这是 @movk/nuxt 的类型分界线而非风格选择：afz 工厂的入参只接受
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

function printCondition(condition: FieldCondition): string {
  const path = IDENTIFIER.test(condition.field)
    ? `ctx.state.${condition.field}`
    : `ctx.state[${JSON.stringify(condition.field)}]`

  return `(ctx: ${CTX_TYPE}) => ${CONDITION_OPS[condition.op].code(path, condition.value)}`
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
    ...activeRules(field.type, field.validation).map(rule => rule.code),
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
  const layoutClass = COLUMN_CLASS[group.columns ?? 1]

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

/** afz.layout 的键会被 AutoForm 展平剥离，不进入表单数据，取什么名字都不影响结果 */
function printSchemaBody(schema: FormSchema): string {
  const indent = '  '

  return walkForm(schema)
    .map(node => (node.kind === 'field'
      ? `${indent}${printKey(node.field.name)}: ${printField(node.field, indent)}`
      : printGroup(node.group, node.fields, indent)))
    .join(',\n')
}

export function generateFormCode(schema: FormSchema): string {
  // 标签输入用 afz.array(z.string())，此时 z 是值引用；其余场景只用到 z.output 类型
  const needsZodValue = schema.fields.some(field => FIELD_SPEC[field.type].factory === 'array')
  const hasCondition = schema.fields.some(field => field.condition)

  const script = [
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

  const template = [
    '  <MAutoForm',
    '    :schema="formSchema"',
    '    :state="formState"',
    '    @submit="onSubmit"',
    '  />'
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
