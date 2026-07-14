import type { ZodRawShape, ZodType } from 'zod'
import type { McpToolAnnotations } from '@nuxtjs/mcp-toolkit/server'

/**
 * 一个工具「长什么样」的唯一真源：服务端用 input/description/annotations 注册 MCP 工具，
 * 客户端用 output 校验工具回显、用 status 渲染聊天流文案。
 *
 * 工具属于哪个工作区不在这里声明——由它在 server/mcp/tools/ 下的子目录决定（见 server/utils/mcp/tools.ts）。
 */
export interface ToolContract {
  description: string
  /** ZodRawShape 裸对象，直接作为 defineMcpTool 的 inputSchema */
  input: ZodRawShape
  /**
   * 工具回显的输出 schema。绝大多数工具的 handler 原样退回入参，回显即输入的形状，省略即可。
   * 仅当服务端真的加工过输出时才声明——如 export-form-code 会补上默认文件名，
   * 输入里 fileName 是可选的，回显里则必有。
   */
  output?: ZodType
  /** 聊天流气泡左侧图标（Iconify 名），未设置时气泡不显示图标区域 */
  icon?: string
  /** 聊天流中的进行时 / 完成态文案 */
  status: [string, string]
  annotations?: McpToolAnnotations
}
