import { z } from 'zod'
import type { ToolContract } from '../types'

const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)

// 消息经 jsonb 落库再取回，可选文本字段可能以 null 回流，输出侧一律放宽为 nullish
const label = z.string().nullish()

const toggle3dBuildings = {
  enabled: z.boolean().describe('true 开启 3D 建筑，false 关闭'),
  color: z.string().optional().describe('建筑颜色（CSS 颜色值，如 #aaaaaa）'),
  opacity: z.number().min(0).max(1).optional().describe('建筑不透明度 0-1'),
  minZoom: z.number().min(0).max(22).optional().describe('显示建筑的最小缩放级别，缺省为 15')
}

const setTerrain = {
  enabled: z.boolean().describe('true 开启地形，false 关闭'),
  exaggeration: z.number().min(0).max(5).optional().describe('地形夸张系数，1 为真实高程，缺省为 1.5')
}

const addHeatmap = {
  points: z.array(z.tuple([longitude, latitude, z.number().nonnegative()]))
    .min(3)
    .max(500)
    .describe('加权点集 [[经度, 纬度, 权重], ...]，WGS84 坐标；权重为该点的度量值（人口、销量等），不加权时一律传 1'),
  radius: z.number().min(1).max(100).optional().describe('热力半径（像素），缺省为 30'),
  opacity: z.number().min(0).max(1).optional().describe('整体不透明度 0-1'),
  label: z.string().max(50).optional().describe('热力图说明，如「长三角人口分布」')
}

const addCluster = {
  points: z.array(z.tuple([longitude, latitude]))
    .min(2)
    .max(2000)
    .describe('点集 [[经度, 纬度], ...]，WGS84 坐标'),
  label: z.string().max(50).optional().describe('聚合图层说明')
}

export const VISUALIZATION_TOOLS = {
  'toggle-3d-buildings': {
    description: '开启或关闭 3D 建筑（建筑轮廓按真实层高立体拉伸）。用于「显示 3D 建筑 / 看看这里的楼 / 关闭立体建筑」等请求。仅在缩放级别不低于 minZoom（缺省 15）时可见。',
    input: toggle3dBuildings,
    output: z.object(toggle3dBuildings),
    icon: 'i-lucide-building-2',
    status: ['正在切换 3D 建筑…', '已切换 3D 建筑'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'set-terrain': {
    description: '开启或关闭三维地形（按真实高程起伏渲染地表），可调节夸张系数放大高差。用于「显示地形 / 看看山势起伏 / 关闭地形」等请求。',
    input: setTerrain,
    output: z.object({ enabled: z.boolean(), exaggeration: z.number() }),
    icon: 'i-lucide-mountain',
    status: ['正在切换地形…', '已切换地形'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'add-heatmap': {
    description: '把一组加权点渲染成热力图，用于展示数量、密度或强度的空间分布（人口、销量、事件频次等）。点集由你直接给出，每个点必须带权重值。再次调用会替换上一张热力图，而不是叠加。',
    input: addHeatmap,
    output: z.object({
      ...addHeatmap,
      label,
      heatmapId: z.string(),
      weightRange: z.tuple([z.number(), z.number()])
    }),
    icon: 'i-lucide-flame',
    status: ['正在绘制热力图…', '已绘制热力图'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  'add-cluster': {
    description: '把一组点渲染成聚合图层：邻近的点自动合并为带数量的聚合圆，放大后展开为散点。用于点位较多、直接标注会互相遮挡的场景。再次调用会替换上一个聚合图层，而不是叠加。',
    input: addCluster,
    output: z.object({ ...addCluster, label, clusterId: z.string() }),
    icon: 'i-lucide-boxes',
    status: ['正在绘制聚合图层…', '已绘制聚合图层'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
