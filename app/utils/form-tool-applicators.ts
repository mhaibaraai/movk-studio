import type { Ref } from 'vue'
import type { FormField, FormSchema } from '#shared/utils/form-schema'
import { createFormSchema } from '#shared/utils/form-schema'

// 派发上下文：export-form-code 的 effect 需要读当前完整表单才能生成代码
export interface FormEffectContext {
  schema: Ref<FormSchema>
}

type FormApplicator = ToolApplicator<FormSchema, FormEffectContext>

const define = createDefine<FormSchema, FormEffectContext>()

/** 按 name 替换一个字段；整段状态由消息重放重建，故一律不可变更新 */
function mapField(draft: FormSchema, name: string, update: (field: FormField) => FormField) {
  draft.fields = draft.fields.map(field => (field.name === name ? update(field) : field))
}

// 工具名 → 「对表单做什么」；派发器的 handled 集合由此表派生
export const FORM_TOOL_APPLICATORS: Record<string, FormApplicator> = {
  'generate-form': define('generate-form', {
    // 整表替换：新需求即新表单，不与旧表单合并
    reduce: (draft, o) => {
      draft.title = o.title
      draft.description = o.description
      draft.submitText = o.submitText
      draft.groups = o.groups ?? []
      draft.fields = o.fields
    }
  }),

  'clear-form': define('clear-form', {
    reduce: draft => Object.assign(draft, createFormSchema())
  }),

  'set-form-meta': define('set-form-meta', {
    reduce: (draft, o) => {
      if (o.title !== undefined) draft.title = o.title
      if (o.description !== undefined) draft.description = o.description
      if (o.submitText !== undefined) draft.submitText = o.submitText
    }
  }),

  'add-field': define('add-field', {
    // 先剔同名再插入：同名视为替换，重放时不会累积出重复字段
    reduce: (draft, o) => {
      const others = draft.fields.filter(field => field.name !== o.field.name)
      const at = o.afterField ? others.findIndex(field => field.name === o.afterField) : -1

      draft.fields = at >= 0
        ? [...others.slice(0, at + 1), o.field, ...others.slice(at + 1)]
        : [...others, o.field]
    }
  }),

  'update-field': define('update-field', {
    // 逐字段判 undefined：未传的项保持原样，不能整体展开 o（会把未传的键写成 undefined）
    reduce: (draft, o) => {
      mapField(draft, o.name, field => ({
        ...field,
        ...(o.type !== undefined ? { type: o.type } : {}),
        ...(o.label !== undefined ? { label: o.label } : {}),
        ...(o.description !== undefined ? { description: o.description } : {}),
        ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
        ...(o.group !== undefined ? { group: o.group } : {}),
        ...(o.defaultValue !== undefined ? { defaultValue: o.defaultValue } : {}),
        ...(o.controlProps !== undefined ? { controlProps: o.controlProps } : {})
      }))
    }
  }),

  'remove-field': define('remove-field', {
    reduce: (draft, o) => {
      draft.fields = draft.fields.filter(field => field.name !== o.name)
    }
  }),

  'reorder-fields': define('reorder-fields', {
    // 未列出的字段接在后面；重复或不存在的 name 忽略
    reduce: (draft, o) => {
      const byName = new Map(draft.fields.map(field => [field.name, field]))
      const taken = new Set<string>()
      const ordered: FormField[] = []

      for (const name of o.names) {
        const field = byName.get(name)
        if (!field || taken.has(name)) continue
        taken.add(name)
        ordered.push(field)
      }

      draft.fields = [...ordered, ...draft.fields.filter(field => !taken.has(field.name))]
    }
  }),

  'set-field-validation': define('set-field-validation', {
    reduce: (draft, o) => mapField(draft, o.name, field => ({ ...field, validation: o.validation }))
  }),

  'set-field-options': define('set-field-options', {
    reduce: (draft, o) => mapField(draft, o.name, field => ({ ...field, options: o.options }))
  }),

  'set-layout': define('set-layout', {
    // 分组整体替换；字段归属随之收敛——指向已删除分组的字段回到顶层，否则编译器会把它们当无分组处理却仍留着脏 group 值
    reduce: (draft, o) => {
      draft.groups = o.groups

      const existing = new Set(o.groups.map(group => group.id))
      const assignments = o.assignments ?? {}

      draft.fields = draft.fields.map((field) => {
        const group = assignments[field.name] ?? field.group
        return { ...field, group: group && existing.has(group) ? group : undefined }
      })
    }
  }),

  'set-field-condition': define('set-field-condition', {
    reduce: (draft, o) => mapField(draft, o.name, field => ({ ...field, condition: o.condition ?? undefined }))
  })
}
