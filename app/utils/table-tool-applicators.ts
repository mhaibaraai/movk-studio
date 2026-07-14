import type { Ref } from 'vue'
import type { ToolOutput } from '#shared/utils/tools'
import type { TableColumn, TableSchema } from '#shared/utils/table-schema'
import { createTableSchema } from '#shared/utils/table-schema'

// 派发上下文：export-table-code 的 effect 要读当前完整表格来生成代码，并格式化后再下载
export interface TableEffectContext {
  schema: Ref<TableSchema>
  format: (source: string) => Promise<string>
}

type TableApplicator = ToolApplicator<TableSchema, TableEffectContext>

const define = createDefine<TableSchema, TableEffectContext>()

type ColumnPatch = ToolOutput<'upsert-column'>

/**
 * 打补丁的三态约定：未传的键保持原样，传 null 的键清除（写成 undefined，与「没有这一项」等价），其余覆盖。
 * 不能整体展开 patch——那会把未传的键一并写成 undefined，等同于误删。
 */
function patchObject<T>(target: T, patch: Record<string, unknown>, skip: string[] = []): T {
  const next: Record<string, unknown> = { ...(target as Record<string, unknown>) }

  for (const [key, value] of Object.entries(patch)) {
    if (skip.includes(key) || value === undefined) continue
    next[key] = value === null ? undefined : value
  }

  return next as T
}

/** 新增列：数据列的 accessorKey 缺省取 key，表头缺省取 key，不让画布因 AI 漏传而崩掉 */
function createColumn(patch: ColumnPatch): TableColumn {
  const base = patch.type
    ? { key: patch.key, type: patch.type }
    : { key: patch.key, accessorKey: patch.accessorKey ?? patch.key, header: patch.header ?? patch.key }

  return patchObject(base as TableColumn, patch, ['afterColumn'])
}

function downloadText(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

// 工具名 → 「对表格做什么」；派发器的 handled 集合由此表派生
export const DATA_TOOL_APPLICATORS: Record<string, TableApplicator> = {
  'generate-table': define('generate-table', {
    reduce: (draft, o) => {
      draft.options = o.options
      draft.columns = o.columns
      draft.rows = o.rows
    }
  }),

  'clear-table': define('clear-table', {
    reduce: draft => Object.assign(draft, createTableSchema())
  }),

  'upsert-column': define('upsert-column', {
    // 同 key 即修改而非追加，故重放全部消息时不会累积出重复列
    reduce: (draft, o) => {
      const index = draft.columns.findIndex(column => column.key === o.key)

      if (index >= 0) {
        draft.columns = draft.columns.map((column, at) => (
          at === index ? patchObject(column, o, ['afterColumn']) : column
        ))
        return
      }

      const at = o.afterColumn ? draft.columns.findIndex(column => column.key === o.afterColumn) : -1
      const created = createColumn(o)

      draft.columns = at >= 0
        ? [...draft.columns.slice(0, at + 1), created, ...draft.columns.slice(at + 1)]
        : [...draft.columns, created]
    }
  }),

  'remove-column': define('remove-column', {
    reduce: (draft, o) => {
      draft.columns = draft.columns.filter(column => column.key !== o.key)
    }
  }),

  'reorder-columns': define('reorder-columns', {
    // 未列出的列接在后面；重复或不存在的 key 忽略
    reduce: (draft, o) => {
      const byKey = new Map(draft.columns.map(column => [column.key, column]))
      const taken = new Set<string>()
      const ordered: TableColumn[] = []

      for (const key of o.keys) {
        const column = byKey.get(key)
        if (!column || taken.has(key)) continue
        taken.add(key)
        ordered.push(column)
      }

      draft.columns = [...ordered, ...draft.columns.filter(column => !taken.has(column.key))]
    }
  }),

  'set-table-options': define('set-table-options', {
    reduce: (draft, o) => {
      draft.options = patchObject(draft.options, o)
    }
  }),

  // 只写 effect 且不 replayOnLoad：刷新页面不该重复触发一次下载（同 form 的 export-form-code）
  'export-table-code': define('export-table-code', {
    effect: (ctx, o) => {
      void ctx.format(generateTableCode(ctx.schema.value))
        .then(code => downloadText(`${o.fileName}.vue`, code))
    },
    replayOnLoad: false
  })
}
