export default defineMcpTool({
  ...mcpToolFrom('search-poi'),
  handler: async (input) => {
    const pois = await useTianditu().searchNearby(
      input.keyword,
      [input.longitude, input.latitude],
      { radius: input.radius, count: input.count }
    )
    return toPoiResults(pois)
  }
})
