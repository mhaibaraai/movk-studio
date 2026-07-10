export default defineMcpTool({
  ...mcpToolFrom('plan-route'),
  handler: async (input) => {
    const { distanceKm, durationMinutes, path, summary } = await useTianditu().route(
      [input.originLongitude, input.originLatitude],
      [input.destLongitude, input.destLatitude],
      { mode: input.mode, waypoints: input.waypoints }
    )
    // 路线几何随输出直接落图，不让 AI 转录几百个坐标；标量供 AI 口述
    return { distanceKm, durationMinutes, path, summary }
  }
})
