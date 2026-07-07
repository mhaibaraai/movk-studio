import { z } from 'zod'

export default defineMcpTool({
  description: '在地图上添加一个标注点（marker）。用于「标注 / 标记 / 在某地做个记号」等请求。返回的 markerId 可用于后续精确移除。',
  inputSchema: {
    longitude: z.number().min(-180).max(180).describe('WGS84 经度'),
    latitude: z.number().min(-90).max(90).describe('WGS84 纬度'),
    label: z.string().max(50).optional().describe('标注文字说明，鼠标悬停显示'),
    color: z.string().optional().describe('标注颜色（CSS 颜色值，如 #f43f5e）')
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler(input) {
    return { ...input, markerId: crypto.randomUUID() }
  }
})
