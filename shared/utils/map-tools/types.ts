import type { ZodRawShape, ZodType } from 'zod'
import type { Workspace } from '../workspace'

// MCP 工具行为提示，透传给 MCP 客户端决定是否需要用户确认
export interface MapToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/**
 * 一个工具「长什么样」的唯一真源：服务端用 input/description/annotations 注册 MCP 工具，
 * 客户端用 output 校验工具回显、用 status 渲染聊天流文案，两侧共用 workspaces 做过滤。
 */
export interface MapToolContract {
  /** 可用工作区；server 端按当前工作区过滤后下发给 streamText */
  workspaces: Workspace[]
  description: string
  /** ZodRawShape 裸对象，直接作为 defineMcpTool 的 inputSchema */
  input: ZodRawShape
  /** 工具回显的输出 schema；仅需要驱动地图的工具声明，纯信息类工具省略 */
  output?: ZodType
  /** 聊天流气泡左侧图标（Iconify 名），未设置时气泡不显示图标区域 */
  icon?: string
  /** 聊天流中的进行时 / 完成态文案 */
  status: [string, string]
  annotations?: MapToolAnnotations
}
