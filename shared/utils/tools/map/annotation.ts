import { z } from 'zod'
import type { ToolContract } from '../types'

const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)

const setBasemap = {
  layer: z.enum(['vec', 'img', 'ter']).describe('底图类型：vec 矢量、img 影像卫星、ter 地形'),
  annotation: z.boolean().optional().describe('是否叠加中文注记（地名标注）')
}

const addMarker = {
  longitude: longitude.describe('WGS84 经度'),
  latitude: latitude.describe('WGS84 纬度'),
  label: z.string().max(50).optional().describe('标注文字说明，鼠标悬停显示'),
  color: z.string().optional().describe('标注颜色（CSS 颜色值，如 #f43f5e）')
}

const removeMarker = {
  markerId: z.string().optional().describe('要移除的标注 id；移除全部或最近一个时留空'),
  all: z.boolean().optional().describe('为 true 时移除全部标注')
}

const bufferCircle = {
  longitude: longitude.describe('圆心 WGS84 经度'),
  latitude: latitude.describe('圆心 WGS84 纬度'),
  radius: z.number().positive().max(1000000).describe('半径，单位米（如 5 公里传 5000）'),
  color: z.string().optional().describe('填充与描边颜色（CSS 颜色值，如 #3b82f6）')
}

const addGeojson = {
  type: z.enum(['point', 'line', 'polygon']).describe('几何类型：point 点、line 线、polygon 多边形'),
  coordinates: z.array(z.tuple([longitude, latitude]))
    .min(1)
    .describe('WGS84 坐标序列 [[经度, 纬度], ...]；point 传 1 个点，line 传 2 个及以上，polygon 传 3 个及以上顶点（无需重复首点闭合）'),
  label: z.string().max(50).optional().describe('图层文字说明'),
  color: z.string().optional().describe('颜色（CSS 颜色值，如 #f43f5e）')
}

const exportImage = {
  fileName: z.string().max(80).optional().describe('下载文件名，缺省为 map.png')
}

// 消息经 jsonb 落库再取回，可选文本字段可能以 null 回流，输出侧一律放宽为 nullish
const label = z.string().nullish()

export const ANNOTATION_TOOLS = {
  'set-basemap': {
    workspaces: ['map'],
    description: '切换天地图底图图层：矢量（vec）、影像/卫星（img）或地形（ter），并可选择是否叠加中文注记。用于「切换到卫星图 / 影像图 / 地形图 / 显示地名注记」等请求。',
    input: setBasemap,
    output: z.object(setBasemap),
    icon: 'i-lucide-layers',
    status: ['正在切换底图…', '已切换底图'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'add-marker': {
    workspaces: ['map'],
    description: '在地图上添加一个标注点（marker）。用于「标注 / 标记 / 在某地做个记号」等请求。返回的 markerId 可用于后续精确移除。',
    input: addMarker,
    output: z.object({ ...addMarker, label, markerId: z.string() }),
    icon: 'i-lucide-map-pin-plus',
    status: ['正在添加标注…', '已添加标注'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  'remove-marker': {
    workspaces: ['map'],
    description: '移除地图标注点。可按 markerId 精确移除单个，或移除全部，或移除最近添加的一个。用于「删除标注 / 清除所有标注 / 撤销上一个标记」等请求。',
    input: removeMarker,
    output: z.object(removeMarker),
    icon: 'i-lucide-map-pin-x',
    status: ['正在移除标注…', '已移除标注'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'buffer-circle': {
    workspaces: ['map'],
    description: '以指定 WGS84 经纬度为圆心，绘制一个测地圆（半径单位为米）。用于「以某地为中心画 N 公里 / N 米范围圈」等服务范围、辐射区展示请求。',
    input: bufferCircle,
    output: z.object({ ...bufferCircle, circleId: z.string() }),
    icon: 'i-lucide-circle-dashed',
    status: ['正在绘制范围圈…', '已绘制范围圈'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  'add-geojson': {
    workspaces: ['map'],
    description: '在地图上添加点、线或面（多边形）图层。用于「圈出一个区域 / 多边形」「批量标注多个点」等请求。两地之间的真实路径请改用 plan-route，不要用直线近似。坐标一律 WGS84，顺序为经度在前、纬度在后。',
    input: addGeojson,
    output: z.object({ ...addGeojson, label, layerId: z.string() }),
    icon: 'i-lucide-shapes',
    status: ['正在绘制图层…', '已绘制图层'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  'export-image': {
    workspaces: ['map'],
    description: '将当前地图视图导出为 PNG 图片并触发浏览器下载。用于「导出地图 / 截图 / 保存当前地图为图片」等请求。',
    input: exportImage,
    output: z.object({ fileName: z.string() }),
    icon: 'i-lucide-image-down',
    status: ['正在导出图片…', '已导出地图图片'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
