import { z } from 'zod'
import { searchNearby } from '@movk/mapbox/utils/tianditu-search'

export default defineMcpTool({
  description: '搜索指定中心点附近的 POI（兴趣点，如餐厅/银行/地铁站/超市）。用于"附近有什么 xxx"类请求；中心点坐标如果来自一个地名，先用 geocode-place 解析。',
  inputSchema: {
    keyword: z.string().min(1).max(50).describe('搜索关键词，如"银行""地铁站""超市"'),
    longitude: z.number().min(-180).max(180).describe('搜索中心点 WGS84 经度'),
    latitude: z.number().min(-90).max(90).describe('搜索中心点 WGS84 纬度'),
    radius: z.number().min(100).max(50000).optional().describe('搜索半径（米）'),
    count: z.number().int().min(1).max(50).optional().describe('返回结果数量上限')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(input) {
    const tk = useRuntimeConfig().tiandituSearchToken
    const { results } = await searchNearby(input.keyword, [input.longitude, input.latitude], {
      radius: input.radius,
      count: input.count,
      tk
    })
    return {
      results: results.map(r => ({ ...r, id: crypto.randomUUID() })),
      count: results.length
    }
  }
})
