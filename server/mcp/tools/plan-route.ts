import { z } from 'zod'
import { planRoute } from '@movk/mapbox/utils/tianditu-route'

export default defineMcpTool({
  description: '规划两点之间的真实道路路线并画到地图上，返回真实行驶距离与时长。用于「从 A 到 B 怎么走 / 多远 / 多久」「把两地连起来」等请求。比 add-geojson 两点直线近似准确得多，路线会自动画到地图上，你只需向用户口述距离和时长。',
  inputSchema: {
    originLongitude: z.number().min(-180).max(180).describe('起点 WGS84 经度'),
    originLatitude: z.number().min(-90).max(90).describe('起点 WGS84 纬度'),
    destLongitude: z.number().min(-180).max(180).describe('终点 WGS84 经度'),
    destLatitude: z.number().min(-90).max(90).describe('终点 WGS84 纬度'),
    mode: z.enum(['fastest', 'shortest', 'avoid-highway', 'walking']).optional().describe('路线类型：最快 / 最短 / 避开高速 / 步行')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(input) {
    const tk = useRuntimeConfig().tiandituSearchToken
    return await planRoute(
      [input.originLongitude, input.originLatitude],
      [input.destLongitude, input.destLatitude],
      { tk, mode: input.mode }
    )
  }
})
