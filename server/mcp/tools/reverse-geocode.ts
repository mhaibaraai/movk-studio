import { z } from 'zod'
import { reverseGeocode } from '@movk/mapbox/utils/tianditu-search'

export default defineMcpTool({
  description: '把一个 WGS84 坐标点反查为结构化地址（"这个点是哪里"）。用于用户给出或点击一个坐标、想知道该位置对应什么地方的场景。',
  inputSchema: {
    longitude: z.number().min(-180).max(180).describe('WGS84 经度'),
    latitude: z.number().min(-90).max(90).describe('WGS84 纬度')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler(input) {
    const tk = useRuntimeConfig().tiandituSearchToken
    return await reverseGeocode([input.longitude, input.latitude], { tk }) ?? { message: '未找到该坐标对应的地址' }
  }
})
