import type { Ref } from 'vue'
import type { ToolOutput } from '#shared/utils/tools'
import type { FormField, FormSchema } from '#shared/utils/form-schema'
import { createFormSchema } from '#shared/utils/form-schema'

// 派发上下文：export-form-code 的 effect 要读当前完整表单来生成代码，并格式化后再下载
export interface FormEffectContext {
  schema: Ref<FormSchema>
  format: (source: string) => Promise<string>
}

type FormApplicator = ToolApplicator<FormSchema, FormEffectContext>

const define = createDefine<FormSchema, FormEffectContext>()

type FieldPatch = ToolOutput<'upsert-field'>

/**
 * 打补丁的三态约定：未传的键保持原样，传 null 的键清除（写成 undefined，与「没有这一项」等价），其余覆盖。
 * 不能整体展开 patch——那会把未传的键一并写成 undefined，等同于误删。
 */
function patchField(field: FormField, patch: FieldPatch): FormField {
  const next: Record<string, unknown> = { ...field }

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'afterField' || value === undefined) continue
    next[key] = value === null ? undefined : value
  }

  return next as FormField
}

/** 新增字段：type 与 label 由契约要求 AI 传，漏传时兜底，不让画布因此崩掉 */
function createField(patch: FieldPatch): FormField {
  return patchField({ name: patch.name, type: 'text', label: patch.name }, patch)
}

function downloadText(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

// 工具名 → 「对表单做什么」；派发器的 handled 集合由此表派生
export const FORM_TOOL_APPLICATORS: Record<string, FormApplicator> = {
  'generate-form': define('generate-form', {
    reduce: (draft, o) => {
      draft.groups = o.groups ?? []
      draft.fields = o.fields
    }
  }),

  'clear-form': define('clear-form', {
    reduce: draft => Object.assign(draft, createFormSchema())
  }),

  'upsert-field': define('upsert-field', {
    // 同名即修改而非追加，故重放全部消息时不会累积出重复字段
    reduce: (draft, o) => {
      const index = draft.fields.findIndex(field => field.name === o.name)

      if (index >= 0) {
        draft.fields = draft.fields.map((field, at) => (at === index ? patchField(field, o) : field))
        return
      }

      const at = o.afterField ? draft.fields.findIndex(field => field.name === o.afterField) : -1
      const created = createField(o)

      draft.fields = at >= 0
        ? [...draft.fields.slice(0, at + 1), created, ...draft.fields.slice(at + 1)]
        : [...draft.fields, created]
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

  // 只写 effect 且不 replayOnLoad：刷新页面不该重复触发一次下载（同 map 的 export-image）
  'export-form-code': define('export-form-code', {
    effect: (ctx, o) => {
      void ctx.format(generateFormCode(ctx.schema.value))
        .then(code => downloadText(`${o.fileName}.vue`, code))
    },
    replayOnLoad: false
  })
}
