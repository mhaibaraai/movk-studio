import type { ToolContract } from '../types'
import { FORM_SCHEMA_TOOLS } from './schema'
import { FORM_FIELD_TOOLS } from './fields'
import { FORM_LAYOUT_TOOLS } from './layout'

/** form 工作区的全部工具契约，按域分文件后在此汇总 */
export const FORM_TOOLS = {
  ...FORM_SCHEMA_TOOLS,
  ...FORM_FIELD_TOOLS,
  ...FORM_LAYOUT_TOOLS
} satisfies Record<string, ToolContract>
