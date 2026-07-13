import type { ZodType, z } from 'zod'
import type { ToolContract } from './types'
import { MAP_TOOLS } from './map'

export type { ToolContract, ToolAnnotations } from './types'

/**
 * 全部工具契约，本身与工作区无关——按工作区的过滤由契约里的 workspaces 字段完成。
 * 服务端据此注册 MCP 工具并按工作区过滤，客户端据此校验工具回显与渲染状态文案。
 *
 * 新增工具：在对应工作区的域文件里加一条 → 补 server/mcp/tools/<name>.ts 的 handler
 * →（若要驱动画布）在该工作区的 applicators 表里加一条。
 */
export const TOOLS = {
  ...MAP_TOOLS
}

export type ToolName = keyof typeof TOOLS

/** 从契约推导工具回显的输出类型；未声明 output 的纯信息类工具为 never */
export type ToolOutput<N extends ToolName>
  = typeof TOOLS[N] extends { output: infer O }
    ? O extends ZodType ? z.infer<O> : never
    : never

export function getTool(name: string): ToolContract | undefined {
  return Object.hasOwn(TOOLS, name) ? TOOLS[name as ToolName] : undefined
}
