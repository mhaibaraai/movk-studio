import { z } from 'zod'

export default defineMcpTool({
  description: '切换天地图底图图层：矢量（vec）、影像/卫星（img）或地形（ter），并可选择是否叠加中文注记。用于「切换到卫星图 / 影像图 / 地形图 / 显示地名注记」等请求。',
  inputSchema: {
    layer: z.enum(['vec', 'img', 'ter']).describe('底图类型：vec 矢量、img 影像卫星、ter 地形'),
    annotation: z.boolean().optional().describe('是否叠加中文注记（地名标注）')
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler(input) {
    return input
  }
})
