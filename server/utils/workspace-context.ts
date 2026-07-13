import type { Feature } from 'geojson'
import { z } from 'zod'
import type { Workspace } from '#shared/utils/workspace'
import { fieldSchema, groupSchema } from '#shared/utils/tools/form/shapes'

/**
 * 客户端上传的工作区上下文快照 → system prompt 摘要。
 *
 * 上下文来自客户端，是不可信输入：每个工作区在此处按 schema 校验并加尺寸上限，
 * 校验不通过一律返回 null（宁可不注入，也不把畸形数据喂给 prompt）。
 */

const mapContextSchema = z.object({
  drawnFeatures: z.array(z.custom<Feature>()).max(50)
})

const formContextSchema = z.object({
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    submitText: z.string().optional(),
    groups: z.array(groupSchema).max(20),
    fields: z.array(fieldSchema).max(100)
  }),
  values: z.record(z.string(), z.unknown()).optional()
})

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

  return null
}
