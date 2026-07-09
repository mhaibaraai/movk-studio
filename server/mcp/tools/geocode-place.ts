import type { SearchResult } from '@movk/mapbox/runtime/types/index.js'

// locate() 的判别联合归一为扁平结果：AI 只关心「解析到了没有、在哪、要不要追问」
function normalize(result: SearchResult) {
  if (result.kind === 'poi') {
    const [best, ...rest] = result.pois
    if (!best) return { found: false as const }
    return {
      found: true as const,
      name: best.name,
      address: best.address,
      longitude: best.location[0],
      latitude: best.location[1],
      // 同名候选供 AI 在真正有歧义时向用户确认
      alternatives: rest.slice(0, 3).map(poi => ({ name: poi.name, address: poi.address }))
    }
  }

  if (result.kind === 'area') {
    return {
      found: true as const,
      name: result.area.name,
      longitude: result.area.location[0],
      latitude: result.area.location[1]
    }
  }

  // 天地图识别出关键词跨多个行政区，交给 AI 反问用户而不是替它猜
  if (result.kind === 'suggestion') {
    return {
      found: false as const,
      candidates: result.suggestion.admins.map(admin => admin.adminName)
    }
  }

  return { found: false as const }
}

export default defineMcpTool({
  ...mcpToolFrom('geocode-place'),
  handler: async (input) => {
    const tianditu = useTianditu()

    // 先试正地理编码（门址级精度，低置信度返回 undefined），未命中再走地名精确定位
    const point = await tianditu.geocode(input.keyword)
    if (point) {
      return {
        found: true as const,
        name: input.keyword,
        longitude: point.location[0],
        latitude: point.location[1],
        level: point.level
      }
    }

    return normalize(await tianditu.locate(input.keyword))
  }
})
