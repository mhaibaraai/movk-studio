import { z } from 'zod'

export default defineMcpTool({
  description: '将当前地图视图导出为 PNG 图片并触发浏览器下载。用于「导出地图 / 截图 / 保存当前地图为图片」等请求。',
  inputSchema: {
    fileName: z.string().max(80).optional().describe('下载文件名，缺省为 map.png')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler(input) {
    return { fileName: input.fileName ?? 'map.png' }
  }
})
