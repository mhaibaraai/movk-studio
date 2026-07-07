import { z } from 'zod'

export default defineMcpTool({
  description: '将地图相机飞行定位到指定 WGS84 经纬度，可选设置缩放级别、俯仰角（3D 倾斜视角）、方位角与动画时长。用于「飞到 / 定位到 / 看看某地」等请求。',
  inputSchema: {
    longitude: z.number().min(-180).max(180).describe('WGS84 经度'),
    latitude: z.number().min(-90).max(90).describe('WGS84 纬度'),
    zoom: z.number().min(0).max(22).optional().describe('缩放级别，城市级约 10，街道级约 16'),
    pitch: z.number().min(0).max(85).optional().describe('俯仰角，0 为俯视，60-85 为 3D 倾斜视角'),
    bearing: z.number().optional().describe('方位角（度），指北为 0'),
    duration: z.number().int().positive().max(20000).optional().describe('动画时长（毫秒）')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler(input) {
    return input
  }
})
