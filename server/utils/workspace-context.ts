import type { Feature } from 'geojson'
import { z } from 'zod'
import type { Workspace } from '#shared/utils/workspace'
import { fieldSchema, formSchema, groupSchema } from '#shared/utils/form-schema'
import { columnSchema, tableOptionsSchema } from '#shared/utils/table-schema'

const mapContextSchema = z.object({
  drawnFeatures: z.array(z.custom<Feature>()).max(50)
})

const formContextSchema = z.object({
  schema: formSchema.extend({
    groups: z.array(groupSchema).max(20),
    fields: z.array(fieldSchema).max(100)
  }),
  values: z.record(z.string(), z.unknown()).optional()
})

const tableContextSchema = z.object({
  schema: z.object({
    options: tableOptionsSchema,
    columns: z.array(columnSchema).max(50)
  }),
  rowCount: z.number().int().min(0).max(10000),
  selectedKeys: z.array(z.string()).max(200).optional()
})

/**
 * 上下文来自客户端，是不可信输入：按工作区 schema 校验并加尺寸上限，
 * 校验不通过一律返回 null——宁可不注入，也不把畸形数据喂给 prompt。
 */
export function summarizeWorkspaceContext(workspace: Workspace, raw: unknown): string | null {
  if (raw === undefined || raw === null) return null

  if (workspace === 'map') {
    const parsed = mapContextSchema.safeParse(raw)
    return parsed.success ? summarizeDrawnFeatures(parsed.data.drawnFeatures) : null
  }

  if (workspace === 'form') {
    const parsed = formContextSchema.safeParse(raw)
    return parsed.success ? summarizeForm(parsed.data.schema, parsed.data.values ?? {}) : null
  }

  if (workspace === 'data') {
    const parsed = tableContextSchema.safeParse(raw)
    if (!parsed.success) return null

    const { schema, rowCount, selectedKeys } = parsed.data
    return summarizeTable(schema, rowCount, selectedKeys ?? [])
  }

  return null
}
