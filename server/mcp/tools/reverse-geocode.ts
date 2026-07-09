export default defineMcpTool({
  ...mcpToolFrom('reverse-geocode'),
  handler: async (input) => {
    const address = await useTianditu().reverseGeocode([input.longitude, input.latitude])
    if (!address) return { message: '未找到该坐标对应的地址' }
    // 摊成对象字面量：interface 无隐式索引签名，不满足 handler 的 Record<string, unknown> 返回约束
    return { ...address }
  }
})
