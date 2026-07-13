import { z } from 'zod'
import type { ToolContract } from '../types'

// 纯服务端计算，结果只供 LLM 口述，不驱动地图，故不声明 output schema
export const COMPUTE_TOOLS = {
  'measure-distance': {
    workspaces: ['map'],
    description: '计算一条路径（多个 WGS84 经纬度点顺序连接）的直线总距离，纯服务端计算，不改动地图。用于「这几个点连起来多长」「两地直线距离多远」等请求；需要真实道路里程请改用 plan-route。',
    input: {
      coordinates: z.array(z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90)
      ]))
        .min(2)
        .describe('WGS84 坐标序列 [[经度, 纬度], ...]，按经过顺序排列，至少 2 个点')
    },
    icon: 'i-lucide-ruler',
    status: ['正在计算距离…', '距离计算完成'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'convert-coordinate': {
    workspaces: ['map'],
    description: '在 WGS84（GPS）、GCJ02（高德 / 腾讯 / 火星坐标）、BD09（百度）三种坐标系之间转换一个经纬度点，纯服务端计算。当用户明确坐标来自高德、腾讯或百度地图、需要转成标准 GPS（WGS84）再定位时调用。',
    input: {
      longitude: z.number().min(-180).max(180).describe('源坐标经度'),
      latitude: z.number().min(-90).max(90).describe('源坐标纬度'),
      from: z.enum(['WGS84', 'GCJ02', 'BD09']).describe('源坐标系'),
      to: z.enum(['WGS84', 'GCJ02', 'BD09']).describe('目标坐标系')
    },
    icon: 'i-lucide-crosshair',
    status: ['正在转换坐标…', '坐标转换完成'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
