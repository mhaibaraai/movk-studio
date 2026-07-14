import { z } from 'zod'
import type { ToolContract } from '../types'

const flyTo = {
  longitude: z.number().min(-180).max(180).describe('WGS84 经度'),
  latitude: z.number().min(-90).max(90).describe('WGS84 纬度'),
  zoom: z.number().min(0).max(22).optional().describe('缩放级别，城市级约 10，街道级约 16'),
  pitch: z.number().min(0).max(85).optional().describe('俯仰角，0 为俯视，60-85 为 3D 倾斜视角'),
  bearing: z.number().optional().describe('方位角（度），指北为 0'),
  duration: z.number().int().positive().max(20000).optional().describe('动画时长（毫秒）')
}

const fitBounds = {
  minLongitude: z.number().min(-180).max(180).describe('西南角 WGS84 经度'),
  minLatitude: z.number().min(-90).max(90).describe('西南角 WGS84 纬度'),
  maxLongitude: z.number().min(-180).max(180).describe('东北角 WGS84 经度'),
  maxLatitude: z.number().min(-90).max(90).describe('东北角 WGS84 纬度'),
  padding: z.number().int().min(0).max(400).optional().describe('范围到视口边缘的留白像素')
}

export const CAMERA_TOOLS = {
  'fly-to': {
    description: '将地图相机飞行定位到指定 WGS84 经纬度，可选设置缩放级别、俯仰角（3D 倾斜视角）、方位角与动画时长。用于「飞到 / 定位到 / 看看某地」等请求。',
    input: flyTo,
    output: z.object(flyTo),
    icon: 'i-lucide-navigation-2',
    status: ['正在定位…', '已定位到目标位置'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'fit-bounds': {
    description: '将地图缩放到一个矩形地理范围，用于同时展示多个地点或一个区域。传入范围的西南角与东北角 WGS84 经纬度。',
    input: fitBounds,
    output: z.object(fitBounds),
    icon: 'i-lucide-scan',
    status: ['正在缩放…', '已缩放到目标范围'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
