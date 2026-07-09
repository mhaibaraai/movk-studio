import type { ToolSet } from 'ai'
import { jsonSchema, tool } from 'ai'
import { z } from 'zod'
import { tools as mcpToolDefinitions } from '#nuxt-mcp-toolkit/tools.mjs'
import type { Workspace } from '#shared/utils/workspace'
import { getMapTool } from '#shared/utils/map-tools'

// 把 mcp-toolkit 的工具定义桥接成 AI SDK 的 tools 对象，并按契约声明的工作区过滤
export function getToolsForWorkspace(workspace: Workspace): ToolSet {
  const aiTools: ToolSet = {}

  for (const def of mcpToolDefinitions) {
    // 工具名由 mcpToolFrom 从契约 key 显式写入，不再靠文件名推断
    const contract = def.name ? getMapTool(def.name) : undefined
    if (!def.name || !contract?.workspaces.includes(workspace)) continue

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
          // 回显 { error }：客户端派发器据此跳过，不把畸形输出注入地图状态
          return { error: error instanceof Error ? error.message : String(error) }
        }
      }
    })
  }

  return aiTools
}
