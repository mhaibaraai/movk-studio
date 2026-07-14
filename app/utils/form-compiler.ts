import type { z } from 'zod'
import { z as zod } from 'zod'
import { FormGroup as FormGroupComponent } from '#components'
import type { FormField, FormSchema } from '#shared/utils/form-schema'
import { FIELD_SPEC, activeRules, fieldControlProps, walkForm } from '#shared/utils/form-semantics'
import { evalCondition } from '#shared/utils/condition-semantics'

type Afz = ReturnType<typeof useAutoForm>['afz']

/**
 * afz 的重载按控件 key 静态收窄 controlProps 的类型，而这里的控件 key 与 props 全部来自
 * 运行时 JSON，类型层无从对上号。整个编译器只在这一处收口成 never，其余保持类型安全。
 */
function fieldMeta(field: FormField): never {
  const { control } = FIELD_SPEC[field.type]
  const condition = field.condition

  return {
    ...(control ? { type: control } : {}),
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    // meta.if 收 ReactiveValue<boolean, AutoFormFieldContext>，ctx.state 是整个表单的当前值
    ...(condition
      ? { if: (ctx: { state: Record<string, unknown> }) => evalCondition(condition, ctx.state) }
      : {}),
    controlProps: fieldControlProps(field)
  } as never
}

function baseSchema(field: FormField, afz: Afz): z.ZodType {
  const meta = fieldMeta(field)

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'password':
    case 'phone':
    case 'color':
    case 'pin':
      return afz.string(meta)
    case 'email':
      return afz.email(meta)
    case 'url':
      return afz.url(meta)
    case 'number':
    case 'slider':
    case 'rating':
      return afz.number(meta)
    case 'switch':
    case 'checkbox':
      return afz.boolean(meta)
    case 'select':
    case 'radio':
    case 'pills':
      // 选项为空时 afz.enum 退化成 z.string()，控件仍渲染但无可选项——不崩，等 AI 补上选项
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
  let schema = activeRules(field.type, field.validation)
    .reduce((acc, rule) => rule.apply(acc), baseSchema(field, afz))

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
 */
export function compileFormSchema(schema: FormSchema, afz: Afz): z.ZodObject {
  const shape: Record<string, z.ZodType> = {}

  for (const node of walkForm(schema)) {
    if (node.kind === 'field') {
      shape[node.field.name] = compileField(node.field, afz)
      continue
    }

    const { group, fields } = node
    const groupFields: Record<string, z.ZodType> = {}
    for (const member of fields) {
      groupFields[member.name] = compileField(member, afz)
    }

    shape[`__group_${group.id}`] = afz.layout({
      component: FormGroupComponent,
      props: { title: group.title, columns: group.columns ?? 1, collapsible: group.collapsible ?? false },
      fields: groupFields
    })
  }

  return afz.object(shape)
}
