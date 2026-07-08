import { z } from 'zod'
import { geocodePlace } from '@movk/mapbox/utils/tianditu-search'

export default defineMcpTool({
  description: '把地名、地址或地标（如"上海""人民广场""外滩"）解析为精确的 WGS84 坐标。在调用 fly-to / add-marker / add-geojson / buffer-circle 前，只要目标是一个具体地名而非用户已直接给出的坐标，就应先调用这个工具获取精确坐标，不要凭自身地理知识猜测坐标。',
  inputSchema: {
    keyword: z.string().min(1).max(50).describe('地名、地址或地标关键词')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(input) {
    const tk = useRuntimeConfig().tiandituSearchToken
    return await geocodePlace(input.keyword, { tk })
  }
})
