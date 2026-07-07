import { z } from 'zod'

export default defineMcpTool({
  description: '将地图缩放到一个矩形地理范围，用于同时展示多个地点或一个区域。传入范围的西南角与东北角 WGS84 经纬度。',
  inputSchema: {
    minLongitude: z.number().min(-180).max(180).describe('西南角 WGS84 经度'),
    minLatitude: z.number().min(-90).max(90).describe('西南角 WGS84 纬度'),
    maxLongitude: z.number().min(-180).max(180).describe('东北角 WGS84 经度'),
    maxLatitude: z.number().min(-90).max(90).describe('东北角 WGS84 纬度'),
    padding: z.number().int().min(0).max(400).optional().describe('范围到视口边缘的留白像素')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler(input) {
    return input
  }
})
