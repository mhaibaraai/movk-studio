import { z } from 'zod'
import type { ToolContract } from '../types'

const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)
const lngLat = z.tuple([longitude, latitude])

// GeoJSON position 放宽为 number[]，兼容含高程的坐标；校验强度足以拒绝畸形输出
const position = z.array(z.number())
const lineString = z.object({ type: z.literal('LineString'), coordinates: z.array(position) })
const multiPolygon = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(position))) })

// search-poi 与 search-poi-in-area 产出同一种 POI 列表，共用输出契约与客户端归约
const poiList = z.object({
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    address: z.string().nullish(),
    location: lngLat,
    distance: z.string().nullish()
  })),
  count: z.number()
})

export const TIANDITU_TOOLS = {
  'geocode-place': {
    description: '把地名、地址或地标（如「上海南浦大桥」「北京市海淀区莲花池西路 28 号」「外滩」）解析为精确的 WGS84 坐标。调用 fly-to / add-marker / add-geojson / buffer-circle / plan-route 前，只要目标是一个具体地名而非用户已直接给出的坐标，就先调用它，不要凭自身地理知识猜测坐标。',
    input: {
      keyword: z.string().min(1).max(50).describe('地名、地址或地标关键词')
    },
    icon: 'i-lucide-map-pin-search',
    status: ['正在解析地名…', '已解析地名坐标'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  'search-poi': {
    description: '搜索指定中心点附近的 POI（兴趣点，如餐厅/银行/地铁站/超市），结果会自动标注到地图并缩放到全部结果范围。用于「附近有什么 xxx」类请求；中心点坐标若来自一个地名，先用 geocode-place 解析。',
    input: {
      keyword: z.string().min(1).max(50).describe('搜索关键词，如「银行」「地铁站」「超市」'),
      longitude: longitude.describe('搜索中心点 WGS84 经度'),
      latitude: latitude.describe('搜索中心点 WGS84 纬度'),
      radius: z.number().min(100).max(50000).optional().describe('搜索半径（米）'),
      count: z.number().int().min(1).max(50).optional().describe('返回结果数量上限')
    },
    output: poiList,
    icon: 'i-lucide-search',
    status: ['正在搜索周边…', '已找到周边地点'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  'search-poi-in-area': {
    description: '在一个行政区（省 / 市 / 区县）范围内搜索 POI，结果会自动标注到地图并缩放到全部结果范围。用于「黄浦区有哪些三甲医院」「杭州市的地铁站」这类以行政区而非中心点半径限定范围的请求。',
    input: {
      areaName: z.string().min(1).max(30).describe('行政区名称，如「黄浦区」「杭州市」「浙江省」'),
      keyword: z.string().min(1).max(50).describe('搜索关键词，如「三甲医院」「地铁站」'),
      count: z.number().int().min(1).max(50).optional().describe('返回结果数量上限')
    },
    output: poiList,
    icon: 'i-lucide-scan-search',
    status: ['正在检索行政区内地点…', '已找到行政区内地点'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  'reverse-geocode': {
    description: '把一个 WGS84 坐标点反查为结构化地址（「这个点是哪里」）。用于用户给出或点击一个坐标、想知道该位置对应什么地方的场景。',
    input: {
      longitude: longitude.describe('WGS84 经度'),
      latitude: latitude.describe('WGS84 纬度')
    },
    icon: 'i-lucide-locate',
    status: ['正在反查地址…', '已反查出地址'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  'get-administrative-boundary': {
    description: '按行政区名称查询真实边界并画到地图上（省 / 市 / 区县），地图会自动缩放到该行政区范围。用于「画出上海市的边界」「圈出某个行政区」等请求；返回真实边界多边形，比 buffer-circle 的圆形示意精确得多。',
    input: {
      name: z.string().min(1).max(50).describe('行政区名称，如「上海」「浙江省」「黄浦区」')
    },
    output: z.object({
      divisions: z.array(z.object({ name: z.string(), boundary: multiPolygon }))
    }),
    icon: 'i-lucide-map',
    status: ['正在查询行政区边界…', '已绘制行政区边界'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  'plan-route': {
    description: '规划两点之间的真实道路路线并画到地图上，返回真实行驶距离与时长，地图会自动缩放到整条路线。用于「从 A 到 B 怎么走 / 多远 / 多久」「把两地连起来」等请求。比 add-geojson 两点直线近似准确得多；你只需向用户口述距离和时长，路线已自动落图。',
    input: {
      originLongitude: longitude.describe('起点 WGS84 经度'),
      originLatitude: latitude.describe('起点 WGS84 纬度'),
      destLongitude: longitude.describe('终点 WGS84 经度'),
      destLatitude: latitude.describe('终点 WGS84 纬度'),
      waypoints: z.array(lngLat).max(10).optional().describe('途经点 [[经度, 纬度], ...]，按经过顺序排列'),
      mode: z.enum(['fastest', 'shortest', 'avoid-highway', 'walking']).optional().describe('路线类型：最快 / 最短 / 避开高速 / 步行')
    },
    output: z.object({
      distanceKm: z.number(),
      durationMinutes: z.number(),
      path: lineString,
      summary: z.string().nullish()
    }),
    icon: 'i-lucide-route',
    status: ['正在规划路线…', '已规划路线'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }
} satisfies Record<string, ToolContract>
