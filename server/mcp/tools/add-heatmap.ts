export default defineMcpTool({
  ...mcpToolFrom('add-heatmap'),
  handler: (input) => {
    // 权重上界喂给 heatmapPaint 的线性插值；全零权重会让 [0, 0] 退化成除零，兜到 1
    const max = Math.max(...input.points.map(([, , weight]) => weight))
    return {
      ...input,
      heatmapId: crypto.randomUUID(),
      weightRange: [0, max > 0 ? max : 1] as [number, number]
    }
  }
})
