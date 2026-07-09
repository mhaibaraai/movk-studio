<script setup lang="ts">
import type { FeatureCollection, Geometry } from 'geojson'

const state = useMapWorkspace()

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
        :title="marker.label ?? undefined"
      />
    </MapboxMarker>

    <MapboxMarker
      v-for="poi in state.pois"
      :key="poi.id"
      :lnglat="poi.location"
    >
      <div
        class="rounded-sm rotate-45 size-2.5 border-2 border-white shadow"
        :style="{ background: POI_COLOR }"
        :title="[poi.name, poi.address].filter(Boolean).join(' · ')"
      />
    </MapboxMarker>

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
