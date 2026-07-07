import { z } from 'zod'

export default defineMcpTool({
  description: '移除地图标注点。可按 markerId 精确移除单个，或移除全部，或移除最近添加的一个。用于「删除标注 / 清除所有标注 / 撤销上一个标记」等请求。',
  inputSchema: {
    markerId: z.string().optional().describe('要移除的标注 id；移除全部或最近一个时留空'),
    all: z.boolean().optional().describe('为 true 时移除全部标注')
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler(input) {
    return input
  }
})
