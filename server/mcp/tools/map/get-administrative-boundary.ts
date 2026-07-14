export default defineMcpTool({
  ...mcpToolFrom('get-administrative-boundary'),
  handler: async (input) => {
    const divisions = await useTianditu().administrative(input.name, { boundary: true, childLevel: 0 })
    // 只回传渲染必需的字段：相机由客户端按边界自动落位，center/code/children 对 AI 无用，省 token
    return {
      divisions: divisions
        .filter(division => division.boundary)
        .map(division => ({ name: division.name, boundary: division.boundary! }))
    }
  }
})
