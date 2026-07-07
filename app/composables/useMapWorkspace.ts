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

export interface MapWorkspaceState {
  markers: MapMarker[]
  geojsonLayers: MapGeoJSONLayer[]
  bufferCircles: MapBufferCircle[]
  basemap: MapBasemapState
}

// 全部工作区状态的初始/复位值；派发器每次重算基于此构造草稿
export function createMapWorkspaceState(): MapWorkspaceState {
  return {
    markers: [],
    geojsonLayers: [],
    bufferCircles: [],
    basemap: { layer: 'vec', annotation: true }
  }
}

// map 工作区共享状态：派发器以「消息归约」整体写入，map.vue 声明式渲染消费
export function useMapWorkspace() {
  const initial = createMapWorkspaceState()
  const markers = useState<MapMarker[]>('map-workspace-markers', () => initial.markers)
  const basemap = useState<MapBasemapState>('map-workspace-basemap', () => initial.basemap)
  const geojsonLayers = useState<MapGeoJSONLayer[]>('map-workspace-geojson', () => initial.geojsonLayers)
  const bufferCircles = useState<MapBufferCircle[]>('map-workspace-buffers', () => initial.bufferCircles)

  // 整体替换：派发器每次从消息归约出完整状态后一次性写入，天然幂等、无累积泄漏
  function setState(next: MapWorkspaceState) {
    markers.value = next.markers
    geojsonLayers.value = next.geojsonLayers
    bufferCircles.value = next.bufferCircles
    basemap.value = next.basemap
  }

  return { markers, basemap, geojsonLayers, bufferCircles, setState }
}
