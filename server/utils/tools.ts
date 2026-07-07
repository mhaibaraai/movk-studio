import type { ToolSet } from 'ai'
import { jsonSchema, tool } from 'ai'
import { z } from 'zod'
import { tools as mcpToolDefinitions } from '#nuxt-mcp-toolkit/tools.mjs'
import type { Workspace } from '#shared/utils/workspace'
import { TOOL_WORKSPACES } from '#shared/utils/tool-workspaces'

type McpToolDefinition = typeof mcpToolDefinitions[number]

// 工具名与 mcp-toolkit 一致：优先显式 name，否则由文件名去扩展名（文件名已是 kebab-case）
function resolveToolName(def: McpToolDefinition): string | undefined {
  if (def.name) return def.name
  const filename = def._meta?.filename
  return typeof filename === 'string' ? filename.replace(/\.(ts|js|mts|mjs)$/, '') : undefined
}

// 把 mcp-toolkit 的工具定义桥接成 AI SDK 的 tools 对象，并按工作区过滤
export function getToolsForWorkspace(workspace: Workspace): ToolSet {
  const aiTools: ToolSet = {}

  for (const def of mcpToolDefinitions) {
    const name = resolveToolName(def)
    if (!name || !TOOL_WORKSPACES[name]?.includes(workspace)) continue

    const schema = def.inputSchema
      ? z.toJSONSchema(z.object(def.inputSchema)) as Record<string, unknown>
      : { type: 'object' as const, properties: {} }

    aiTools[name] = tool({
      description: def.description ?? '',
      inputSchema: jsonSchema(schema),
      execute: async (args) => {
        try {
          return await def.handler(args, {} as Parameters<typeof def.handler>[1])
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      }
    })
  }

  return aiTools
}
