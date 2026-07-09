export default defineMcpTool({
  ...mcpToolFrom('add-geojson'),
  handler: (input) => {
    // 按几何类型强制最少点数，避免退化几何进入 mapbox
    const count = input.coordinates.length
    if (input.type === 'line' && count < 2) throw new Error('line 至少需要 2 个坐标点')
    if (input.type === 'polygon' && count < 3) throw new Error('polygon 至少需要 3 个坐标点')
    return { ...input, layerId: crypto.randomUUID() }
  }
})
