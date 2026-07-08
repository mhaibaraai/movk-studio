import { z } from 'zod'
import { getAdministrativeDivision } from '@movk/mapbox/utils/tianditu-administrative'

export default defineMcpTool({
  description: '按行政区名称查询真实边界并画到地图上（省 / 市 / 区县）。用于「画出上海市的边界」「圈出某个行政区」等请求；返回真实边界多边形，比 buffer-circle 的圆形示意精确得多。',
  inputSchema: {
    name: z.string().min(1).max(50).describe('行政区名称，如"上海""浙江省""黄浦区"')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler(input) {
    const tk = useRuntimeConfig().tiandituSearchToken
    const divisions = await getAdministrativeDivision(input.name, { tk, includeBoundary: true, childLevel: 0 })
    // 只把渲染必需的字段回传（边界多边形 + 名称 + 中心点），children/code 对地图渲染无用，省 token
    return {
      divisions: divisions
        .filter(d => d.boundary)
        .map(d => ({ name: d.name, level: d.level, center: d.center, boundary: d.boundary! }))
    }
  }
})
