import { z } from 'zod'

export default defineMcpTool({
  description: '在地图上添加点、线或面（多边形）图层。用于「把这几个点连成一条线 / 路线」「圈出一个区域 / 多边形」「批量标注多个点」等请求。坐标一律 WGS84，顺序为经度在前、纬度在后。',
  inputSchema: {
    type: z.enum(['point', 'line', 'polygon']).describe('几何类型：point 点、line 线、polygon 多边形'),
    coordinates: z.array(z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90)
    ]))
      .min(1)
      .describe('WGS84 坐标序列 [[经度, 纬度], ...]；point 传 1 个点，line 传 2 个及以上，polygon 传 3 个及以上顶点（无需重复首点闭合）'),
    label: z.string().max(50).optional().describe('图层文字说明'),
    color: z.string().optional().describe('颜色（CSS 颜色值，如 #f43f5e）')
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler(input) {
    // 边界校验：按几何类型强制最少点数，避免退化几何进入 mapbox
    const count = input.coordinates.length
    if (input.type === 'line' && count < 2) throw new Error('line 至少需要 2 个坐标点')
    if (input.type === 'polygon' && count < 3) throw new Error('polygon 至少需要 3 个坐标点')
    return { ...input, layerId: crypto.randomUUID() }
  }
})
