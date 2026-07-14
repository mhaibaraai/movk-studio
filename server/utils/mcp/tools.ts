import type { ToolSet } from 'ai'
import { jsonSchema, tool } from 'ai'
import { z } from 'zod'
import { tools as mcpToolDefinitions } from '#nuxt-mcp-toolkit/tools.mjs'
import type { Workspace } from '#shared/utils/workspace'
import { getTool } from '#shared/utils/tools'

/**
 * 工具所属工作区 = 它在 server/mcp/tools/ 下的子目录名。
 * mcp-toolkit 扫描目录时把子目录名注入 _meta.group（显式声明 group 时才落在 def.group 上）。
 */
function toolGroup(def: { group?: string, _meta?: Record<string, unknown> }): string | undefined {
  return def.group ?? (def._meta?.group as string | undefined)
}

export function getToolsForWorkspace(workspace: Workspace): ToolSet {
  const aiTools: ToolSet = {}

  for (const def of mcpToolDefinitions) {
    if (!def.name || toolGroup(def) !== workspace) continue
    const contract = getTool(def.name)
    if (!contract) continue

    const schema = def.inputSchema
      ? z.toJSONSchema(z.object(def.inputSchema)) as Record<string, unknown>
      : { type: 'object' as const, properties: {} }

    aiTools[def.name] = tool({
      description: contract.description,
      inputSchema: jsonSchema(schema),
      execute: async (args) => {
        try {
          return await def.handler(args, {} as Parameters<typeof def.handler>[1])
        } catch (error) {
          // 回显 { error }：客户端派发器据此跳过，不把畸形输出注入画布状态
          return { error: error instanceof Error ? error.message : String(error) }
        }
      }
    })
  }

  return aiTools
}
