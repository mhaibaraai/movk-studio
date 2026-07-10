import type { ZodType, z } from 'zod'
import type { MapToolContract } from './types'
import { CAMERA_TOOLS } from './camera'
import { ANNOTATION_TOOLS } from './annotation'
import { VISUALIZATION_TOOLS } from './visualization'
import { COMPUTE_TOOLS } from './compute'
import { TIANDITU_TOOLS } from './tianditu'

export type { MapToolContract, MapToolAnnotations } from './types'

/**
 * 全部工具契约。服务端据此注册 MCP 工具并按工作区过滤，客户端据此校验工具回显与渲染状态文案。
 * 新增工具只需在对应领域文件里加一条，再补 server/mcp/tools/<name>.ts 的 handler
 * （若要驱动地图，另加 app/utils/map-tool-applicators.ts 的一条）。
 */
export const MAP_TOOLS = {
  ...CAMERA_TOOLS,
  ...ANNOTATION_TOOLS,
  ...VISUALIZATION_TOOLS,
  ...COMPUTE_TOOLS,
  ...TIANDITU_TOOLS
}

export type MapToolName = keyof typeof MAP_TOOLS

/** 从契约推导工具回显的输出类型；未声明 output 的纯信息类工具为 never */
export type MapToolOutput<N extends MapToolName>
  = typeof MAP_TOOLS[N] extends { output: infer O }
    ? O extends ZodType ? z.infer<O> : never
    : never

export function getMapTool(name: string): MapToolContract | undefined {
  return Object.hasOwn(MAP_TOOLS, name) ? MAP_TOOLS[name as MapToolName] : undefined
}
