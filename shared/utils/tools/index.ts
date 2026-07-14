import type { ZodObject, ZodType, z } from 'zod'
import { z as zod } from 'zod'
import type { ToolContract } from './types'
import { MAP_TOOLS } from './map'
import { FORM_TOOLS } from './form'
import { DATA_TOOLS } from './data'

export type { ToolContract } from './types'

/**
 * 新增工具：在对应工作区的域文件里加一条契约 → 补 server/mcp/tools/<workspace>/<name>.ts 的 handler
 * →（若要驱动画布）在该工作区的 applicators 表里加一条 → 重启 dev server（工具是构建期扫目录的虚拟模块）。
 */
export const TOOLS = {
  ...MAP_TOOLS,
  ...FORM_TOOLS,
  ...DATA_TOOLS
}

export type ToolName = keyof typeof TOOLS

/** 工具回显的输出类型：契约声明了 output 就用它，否则回落到输入的形状 */
export type ToolOutput<N extends ToolName>
  = typeof TOOLS[N] extends { output: infer O extends ZodType }
    ? z.infer<O>
    : z.infer<ZodObject<typeof TOOLS[N]['input']>>

export function getTool(name: string): ToolContract | undefined {
  return Object.hasOwn(TOOLS, name) ? TOOLS[name as ToolName] : undefined
}

// z.object(input) 每次现建都要重走一遍 shape，而校验在流式期每 token 都对全部历史工具调用跑一次
const outputSchemas = new Map<string, ZodType>()

/** 校验工具回显用的 schema：契约声明了就用它，否则按输入形状校验 */
export function getToolOutputSchema(name: string): ZodType | undefined {
  const contract = getTool(name)
  if (!contract) return undefined

  const cached = outputSchemas.get(name)
  if (cached) return cached

  const schema = contract.output ?? zod.object(contract.input)
  outputSchemas.set(name, schema)

  return schema
}
