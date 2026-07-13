import type { ToolContract } from '../types'
import { CAMERA_TOOLS } from './camera'
import { ANNOTATION_TOOLS } from './annotation'
import { VISUALIZATION_TOOLS } from './visualization'
import { COMPUTE_TOOLS } from './compute'
import { TIANDITU_TOOLS } from './tianditu'
import { DRAW_TOOLS } from './draw'

/** map 工作区的全部工具契约，按域分文件后在此汇总 */
export const MAP_TOOLS = {
  ...CAMERA_TOOLS,
  ...ANNOTATION_TOOLS,
  ...VISUALIZATION_TOOLS,
  ...COMPUTE_TOOLS,
  ...TIANDITU_TOOLS,
  ...DRAW_TOOLS
} satisfies Record<string, ToolContract>
