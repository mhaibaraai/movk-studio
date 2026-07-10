export default defineMcpTool({
  ...mcpToolFrom('search-poi-in-area'),
  handler: async (input) => {
    const tianditu = useTianditu()

    // 天地图行政区检索按国标码限定范围，AI 只知道行政区名，先解析出码
    const [division] = await tianditu.administrative(input.areaName, { boundary: false })
    if (!division) return toPoiResults([])

    const result = await tianditu.search({
      type: 'district',
      specify: division.code,
      keyword: input.keyword,
      count: input.count
    })

    // 命中过多时天地图改回 statistics 等形态，此处只消费 POI 列表
    return toPoiResults(result.kind === 'poi' ? result.pois : [])
  }
})
