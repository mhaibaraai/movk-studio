import { z } from 'zod'
import gcoord from 'gcoord'

const CRS_MAP = {
  WGS84: gcoord.WGS84,
  GCJ02: gcoord.GCJ02,
  BD09: gcoord.BD09
} as const

function round(n: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(n * factor) / factor
}

export default defineMcpTool({
  description: '在 WGS84（GPS）、GCJ02（高德 / 腾讯 / 火星坐标）、BD09（百度）三种坐标系之间转换一个经纬度点，纯服务端计算。当用户明确坐标来自高德、腾讯或百度地图、需要转成标准 GPS（WGS84）再定位时调用。',
  inputSchema: {
    longitude: z.number().min(-180).max(180).describe('源坐标经度'),
    latitude: z.number().min(-90).max(90).describe('源坐标纬度'),
    from: z.enum(['WGS84', 'GCJ02', 'BD09']).describe('源坐标系'),
    to: z.enum(['WGS84', 'GCJ02', 'BD09']).describe('目标坐标系')
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler(input) {
    const [lng, lat] = gcoord.transform(
      [input.longitude, input.latitude],
      CRS_MAP[input.from],
      CRS_MAP[input.to]
    )
    return { longitude: round(lng, 6), latitude: round(lat, 6), from: input.from, to: input.to }
  }
})
