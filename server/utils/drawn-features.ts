import type { Feature, Position } from 'geojson'

/** 直接给出完整坐标的顶点数上界；超出只给顶点数与包围盒 */
const MAX_INLINE_VERTICES = 30

const COORD_PRECISION = 6

function round(value: number): number {
  return Number(value.toFixed(COORD_PRECISION))
}

function formatPoint(position: Position): string {
  return `[${round(position[0]!)}, ${round(position[1]!)}]`
}

/** 摊平任意深度的坐标嵌套，得到全部顶点 */
function flatten(coordinates: unknown): Position[] {
  if (!Array.isArray(coordinates)) return []
  if (typeof coordinates[0] === 'number') return [coordinates as Position]
  return coordinates.flatMap(flatten)
}

function formatBBox(positions: Position[]): string {
  const longitudes = positions.map(p => p[0]!)
  const latitudes = positions.map(p => p[1]!)
  const min = [Math.min(...longitudes), Math.min(...latitudes)] as Position
  const max = [Math.max(...longitudes), Math.max(...latitudes)] as Position
  return `包围盒 ${formatPoint(min)} 到 ${formatPoint(max)}`
}

function numberProp(properties: Feature['properties'], key: string): number | undefined {
  const value = properties?.[key]
  return typeof value === 'number' ? value : undefined
}

function pointProp(properties: Feature['properties'], key: string): Position | undefined {
  const value = properties?.[key]
  if (!Array.isArray(value) || value.length < 2) return undefined
  if (typeof value[0] !== 'number' || typeof value[1] !== 'number') return undefined
  return value as Position
}

/**
 * 圆 / 椭圆 / 扇形由 movkDrawModes 生成，环上有 65 个采样顶点，
 * 但 properties 记录了圆心与半径等原始参数——描述这些参数，绝不把环坐标交给 LLM。
 */
function describeParametric(feature: Feature): string | undefined {
  const { properties } = feature
  const center = pointProp(properties, 'center')
  if (!center) return undefined

  const radius = numberProp(properties, 'radiusInM')
  const bearing1 = numberProp(properties, 'bearing1')
  const bearing2 = numberProp(properties, 'bearing2')
  const xSemiAxis = numberProp(properties, 'xSemiAxisInM')
  const ySemiAxis = numberProp(properties, 'ySemiAxisInM')

  if (radius !== undefined && bearing1 !== undefined && bearing2 !== undefined) {
    return `扇形：圆心 ${formatPoint(center)}，半径 ${Math.round(radius)} 米，方位角 ${Math.round(bearing1)}° 至 ${Math.round(bearing2)}°`
  }
  if (radius !== undefined) {
    return `圆：圆心 ${formatPoint(center)}，半径 ${Math.round(radius)} 米`
  }
  if (xSemiAxis !== undefined && ySemiAxis !== undefined) {
    return `椭圆：中心 ${formatPoint(center)}，横半轴 ${Math.round(xSemiAxis)} 米，纵半轴 ${Math.round(ySemiAxis)} 米`
  }
  return undefined
}

const GEOMETRY_LABEL: Record<string, string> = {
  Point: '点',
  MultiPoint: '多点',
  LineString: '线',
  MultiLineString: '多段线',
  Polygon: '多边形',
  MultiPolygon: '多重多边形'
}

function describeGeometry(feature: Feature): string {
  const parametric = describeParametric(feature)
  if (parametric) return parametric

  const type = feature.geometry?.type
  const label = (type && GEOMETRY_LABEL[type]) ?? '未知几何'
  const positions = flatten((feature.geometry as { coordinates?: unknown })?.coordinates)
  if (!positions.length) return `${label}：几何为空`

  if (positions.length > MAX_INLINE_VERTICES) {
    return `${label}：${positions.length} 个顶点，${formatBBox(positions)}（顶点过多，坐标已省略）`
  }
  return `${label}：${positions.map(formatPoint).join(', ')}`
}

/**
 * 把用户手绘要素摘要成一段可注入 system prompt 的文本；无要素时返回 null。
 * 要素来自客户端，字段一律防御性读取。
 */
export function summarizeDrawnFeatures(features: Feature[]): string | null {
  if (!features.length) return null

  const lines = features.map((feature, index) => {
    const id = feature.id === undefined ? '' : `（id: ${feature.id}）`
    return `${index + 1}. ${describeGeometry(feature)}${id}`
  })

  return `用户当前在地图上手绘了 ${features.length} 个要素：
${lines.join('\n')}

需要基于手绘内容计算或绘制时，直接引用上面的坐标调用相应工具（如 measure-distance、add-geojson）。圆 / 椭圆 / 扇形的参数已给出，无需再索取其边界坐标。`
}
