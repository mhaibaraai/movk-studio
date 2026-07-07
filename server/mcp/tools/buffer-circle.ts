import { z } from 'zod'

export default defineMcpTool({
  description: '以指定 WGS84 经纬度为圆心，绘制一个测地圆（半径单位为米）。用于「以某地为中心画 N 公里 / N 米范围圈」等服务范围、辐射区展示请求。',
  inputSchema: {
    longitude: z.number().min(-180).max(180).describe('圆心 WGS84 经度'),
    latitude: z.number().min(-90).max(90).describe('圆心 WGS84 纬度'),
    radius: z.number().positive().max(1000000).describe('半径，单位米（如 5 公里传 5000）'),
    color: z.string().optional().describe('填充与描边颜色（CSS 颜色值，如 #3b82f6）')
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler(input) {
    return { ...input, circleId: crypto.randomUUID() }
  }
})
