import type { LineString, MultiPolygon } from 'geojson'

export const MAP_ID = 'workspace-map'

export type BasemapLayer = 'vec' | 'img' | 'ter'
export type GeoJSONShape = 'point' | 'line' | 'polygon'

export interface MapMarker {
  id: string
  longitude: number
  latitude: number
  label?: string | null
  color?: string
}

export interface MapBasemapState {
  layer: BasemapLayer
  annotation: boolean
}

export interface MapGeoJSONLayer {
  id: string
  type: GeoJSONShape
  coordinates: [number, number][]
  label?: string | null
  color?: string
}

export interface MapBufferCircle {
  id: string
  longitude: number
  latitude: number
  radius: number
  color?: string
}

// 对齐 @movk/mapbox 的 Poi 形状，省去 handler 侧的字段搬运
export interface MapPoi {
  id: string
  name: string
  address?: string | null
  location: [number, number]
  distance?: string | null
}

export interface MapAdminBoundary {
  name: string
  boundary: MultiPolygon
}

export interface MapBuildings3D {
  color?: string
  opacity?: number
  minZoom?: number
}

export interface MapTerrainState {
  exaggeration: number
}

export interface MapHeatmap {
  id: string
  /** [经度, 纬度, 权重] */
  points: [number, number, number][]
  /** 权重取值范围，由 handler 按点集实际上界给出 */
  weightRange: [number, number]
  radius?: number
  opacity?: number
  label?: string | null
}

export interface MapClusterState {
  id: string
  points: [number, number][]
  label?: string | null
}

export interface MapWorkspaceState {
  markers: MapMarker[]
  geojsonLayers: MapGeoJSONLayer[]
  bufferCircles: MapBufferCircle[]
  basemap: MapBasemapState
  pois: MapPoi[]
  // 单值几何、每次调用替换（语义同 pois 的替换不累加）
  adminBoundary?: MapAdminBoundary
  route?: LineString
  // 渲染模式与可视化图层，同为单值替换；关闭 / 未调用时为 undefined
  buildings3d?: MapBuildings3D
  terrain?: MapTerrainState
  heatmap?: MapHeatmap
  cluster?: MapClusterState
}

// 全部状态的初始 / 复位值；派发器每次重算都基于它构造草稿
export function createMapWorkspaceState(): MapWorkspaceState {
  return {
    markers: [],
    geojsonLayers: [],
    bufferCircles: [],
    basemap: { layer: 'vec', annotation: true },
    pois: [],
    adminBoundary: undefined,
    route: undefined,
    buildings3d: undefined,
    terrain: undefined,
    heatmap: undefined,
    cluster: undefined
  }
}

/**
 * map 工作区共享状态：派发器把「当前全部消息的工具输出」归约成完整状态后整体写入，
 * map.vue 声明式渲染消费。单一 useState 承载整个状态对象——新增一个状态字段只需
 * 改 MapWorkspaceState 与 createMapWorkspaceState 两处。
 */
export function useMapWorkspace() {
  return useState<MapWorkspaceState>('map-workspace', createMapWorkspaceState)
}
