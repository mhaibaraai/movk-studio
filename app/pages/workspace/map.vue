<script setup lang="ts">
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { SourceSpecification } from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import { drawThemeStyles } from '@movk/mapbox/utils/draw-theme'
import { heatmapPaint } from '@movk/mapbox/utils/heatmap'
import { movkDrawModes } from '#mapbox/draw-modes'

const state = useMapWorkspace()
const drawnFeatures = useDrawnFeatures()
const pendingDrawColor = usePendingDrawColor()
const draw = useMapboxDraw({ mapId: MAP_ID })

const DRAW_COLOR = '#3b82f6'

// 注册的模式集必须覆盖 map-tool-applicators 里 DRAW_MODE 的全部取值；
// styles 与 modes 一样是整体替换，drawThemeStyles 给的正是完整一套，
// 其取色为 coalesce(user_color, 主题色)，故须开 userProperties 才能让要素级颜色生效
const DRAW_OPTIONS = {
  modes: { ...MapboxDraw.modes, ...movkDrawModes },
  userProperties: true,
  styles: drawThemeStyles({ color: DRAW_COLOR })
}

// draw-shape 挂起的颜色写进这次画出的要素，随后清空：用户自己点按钮画的下一个要素回到主题色
function applyPendingColor(features: Feature[]) {
  const color = pendingDrawColor.value
  if (!color) return

  for (const feature of features) {
    if (feature.id === undefined) continue
    draw.setFeatureProperty(String(feature.id), 'color', color)
  }
  pendingDrawColor.value = undefined
}

const MARKER_COLOR = '#f43f5e'
const LAYER_COLOR = '#f43f5e'
const CIRCLE_COLOR = '#3b82f6'
const POI_COLOR = '#3b82f6'
const BOUNDARY_COLOR = '#3b82f6'
const ROUTE_COLOR = '#6366f1'

function toFeatureCollection(geometry: Geometry): FeatureCollection {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] }
}

function shapeGeometry(layer: MapGeoJSONLayer): Geometry {
  if (layer.type === 'point') return { type: 'Point', coordinates: layer.coordinates[0]! }
  if (layer.type === 'line') return { type: 'LineString', coordinates: layer.coordinates }

  const ring = [...layer.coordinates]
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
  return { type: 'Polygon', coordinates: [ring] }
}

function mapboxLayerType(shape: GeoJSONShape): 'circle' | 'line' | 'fill' {
  if (shape === 'point') return 'circle'
  if (shape === 'line') return 'line'
  return 'fill'
}

function layerPaint(layer: MapGeoJSONLayer): Record<string, unknown> {
  const color = layer.color ?? LAYER_COLOR
  if (layer.type === 'point') {
    return { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
  }
  if (layer.type === 'line') {
    return { 'line-color': color, 'line-width': 4 }
  }
  return { 'fill-color': color, 'fill-opacity': 0.25, 'fill-outline-color': color }
}

// empty-v9 底样式不含官方 composite 源，3D 建筑的矢量数据需单独挂载
const STREETS_SOURCE_ID = 'mapbox-streets'
const STREETS_SOURCE: SourceSpecification = { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' }

const HEATMAP_WEIGHT_PROPERTY = 'w'

const heatmapData = computed<FeatureCollection>(() => ({
  type: 'FeatureCollection',
  features: (state.value.heatmap?.points ?? []).map(([longitude, latitude, weight]) => ({
    type: 'Feature',
    properties: { [HEATMAP_WEIGHT_PROPERTY]: weight },
    geometry: { type: 'Point', coordinates: [longitude, latitude] }
  }))
}))

// heatmapPaint 的 weightProperty 缺省为 'temperature'，必须显式指向上面写入的属性名
const heatmapPaintSpec = computed(() => heatmapPaint({
  weightProperty: HEATMAP_WEIGHT_PROPERTY,
  weightRange: state.value.heatmap?.weightRange,
  radius: state.value.heatmap?.radius,
  opacity: state.value.heatmap?.opacity
}))

const clusterData = computed<FeatureCollection>(() => ({
  type: 'FeatureCollection',
  features: (state.value.cluster?.points ?? []).map(coordinates => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates }
  }))
}))
</script>

<template>
  <MapboxMap
    class="flex-1 min-h-0"
    :map-id="MAP_ID"
    :options="{
      projection: 'globe',
      center: [116.397, 39.908],
      zoom: 9,
      style: 'mapbox://styles/mapbox/empty-v9'
    }"
  >
    <MapboxTiandituLayer :layer="state.basemap.layer" :annotation="state.basemap.annotation" />

    <MapboxTerrain v-if="state.terrain" :exaggeration="state.terrain.exaggeration" />

    <MapboxSource
      v-if="state.buildings3d"
      :source-id="STREETS_SOURCE_ID"
      :source="STREETS_SOURCE"
    >
      <MapboxBuildingLayer
        :source="STREETS_SOURCE_ID"
        source-layer="building"
        :color="state.buildings3d.color"
        :opacity="state.buildings3d.opacity"
        :minzoom="state.buildings3d.minZoom"
      />
    </MapboxSource>

    <MapboxLayer
      v-if="state.heatmap"
      :key="state.heatmap.id"
      layer-id="heatmap"
      type="heatmap"
      :source="{ type: 'geojson', data: heatmapData }"
      :paint="heatmapPaintSpec"
    />

    <MapboxClusterLayer
      v-if="state.cluster"
      :key="state.cluster.id"
      :data="clusterData"
    />

    <MapboxLayer
      v-if="state.adminBoundary"
      :key="`admin-${state.adminBoundary.name}`"
      layer-id="admin-boundary"
      type="fill"
      :source="{ type: 'geojson', data: toFeatureCollection(state.adminBoundary.boundary) }"
      :paint="{ 'fill-color': BOUNDARY_COLOR, 'fill-opacity': 0.15, 'fill-outline-color': BOUNDARY_COLOR }"
    />

    <MapboxLayer
      v-if="state.route"
      layer-id="route-line"
      type="line"
      :source="{ type: 'geojson', data: toFeatureCollection(state.route) }"
      :layout="{ 'line-cap': 'round', 'line-join': 'round' }"
      :paint="{ 'line-color': ROUTE_COLOR, 'line-width': 5 }"
    />

    <MapboxBufferCircle
      v-for="circle in state.bufferCircles"
      :key="circle.id"
      :center="[circle.longitude, circle.latitude]"
      :radius="circle.radius"
      :color="circle.color ?? CIRCLE_COLOR"
    />

    <MapboxLayer
      v-for="layer in state.geojsonLayers"
      :key="layer.id"
      :layer-id="layer.id"
      :type="mapboxLayerType(layer.type)"
      :source="{ type: 'geojson', data: toFeatureCollection(shapeGeometry(layer)) }"
      :layout="layer.type === 'line' ? { 'line-cap': 'round', 'line-join': 'round' } : {}"
      :paint="layerPaint(layer)"
    />

    <MapboxMarker
      v-for="marker in state.markers"
      :key="marker.id"
      :lnglat="[marker.longitude, marker.latitude]"
    >
      <div
        class="rounded-full size-3 border-2 border-white shadow"
        :style="{ background: marker.color ?? MARKER_COLOR }"
      />

      <template #popup>
        {{ marker.label ?? undefined }}
      </template>
    </MapboxMarker>

    <MapboxMarker
      v-for="poi in state.pois"
      :key="poi.id"
      :lnglat="poi.location"
    >
      <div
        class="rounded-sm rotate-45 size-2.5 border-2 border-white shadow"
        :style="{ background: POI_COLOR }"
      />

      <template #popup>
        {{ [poi.name, poi.address].filter(Boolean).join(' · ') }}
      </template>
    </MapboxMarker>

    <!-- DrawControl 在 setup 阶段即写入进程级绘制注册表，SSR 期执行会逐请求累积且无从注销 -->
    <ClientOnly>
      <MapboxDrawControl
        v-model:features="drawnFeatures"
        :options="DRAW_OPTIONS"
        @create="applyPendingColor"
      />
    </ClientOnly>

    <MapboxScaleControl />
    <MapboxFullscreenControl />
    <MapboxNavigationControl />
    <MapboxGeolocateControl
      :options="{
        trackUserLocation: true,
        showUserHeading: true,
        positionOptions: { enableHighAccuracy: true }
      }"
    />
  </MapboxMap>
</template>
