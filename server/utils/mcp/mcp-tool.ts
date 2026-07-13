import type { ToolAnnotations, ToolName } from '#shared/utils/tools'
import { TOOLS } from '#shared/utils/tools'

interface McpToolFields<N extends ToolName> {
  name: N
  description: string
  inputSchema: (typeof TOOLS)[N]['input']
  annotations: ToolAnnotations | undefined
}

/**
 * 从契约摊出 defineMcpTool 的描述性字段，工具文件里只需再补 handler。
 * 返回类型必须显式标注：否则 TS 在 N 未实例化时就把 inputSchema 求值成全部工具 shape 的并集，
 * handler 的入参随之退化为 any。延迟索引访问 `(typeof TOOLS)[N]['input']` 保留字面量 shape。
 *
 * 独立于 tools.ts：后者 import 虚拟模块 `#nuxt-mcp-toolkit/tools.mjs`，
 * 而该虚拟模块反过来 import 各工具文件，工具文件从此处取定义可避免成环。
 */
export function mcpToolFrom<N extends ToolName>(name: N): McpToolFields<N> {
  const contract = TOOLS[name]

  return {
    name,
    description: contract.description,
    inputSchema: contract.input,
    annotations: contract.annotations
  }
}
