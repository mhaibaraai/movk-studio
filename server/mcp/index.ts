// 覆盖默认 /mcp handler：要求已登录用户（session.id 为匿名会话自动下发，不足以鉴权），避免公网匿名可调用
export default defineMcpHandler({
  middleware: async (event) => {
    const session = await getUserSession(event)
    if (!session.user?.id) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }
})
