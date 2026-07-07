<script setup lang="ts">
import type { FeatureCollection, Geometry } from 'geojson'

const { markers, basemap, geojsonLayers, bufferCircles } = useMapWorkspace()

const MARKER_COLOR = '#f43f5e'
const LAYER_COLOR = '#f43f5e'
const CIRCLE_COLOR = '#3b82f6'

function toFeatureCollection(layer: MapGeoJSONLayer): FeatureCollection {
  let geometry: Geometry
  if (layer.type === 'point') {
    geometry = { type: 'Point', coordinates: layer.coordinates[0]! }
  } else if (layer.type === 'line') {
    geometry = { type: 'LineString', coordinates: layer.coordinates }
  } else {
    const ring = [...layer.coordinates]
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
    geometry = { type: 'Polygon', coordinates: [ring] }
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] }
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
    <MapboxTiandituLayer :layer="basemap.layer" :annotation="basemap.annotation" />

    <MapboxBufferCircle
      v-for="circle in bufferCircles"
      :key="circle.id"
      :center="[circle.longitude, circle.latitude]"
      :radius="circle.radius"
      :color="circle.color ?? CIRCLE_COLOR"
    />

    <MapboxLayer
      v-for="layer in geojsonLayers"
      :key="layer.id"
      :layer-id="layer.id"
      :type="mapboxLayerType(layer.type)"
      :source="{ type: 'geojson', data: toFeatureCollection(layer) }"
      :layout="layer.type === 'line' ? { 'line-cap': 'round', 'line-join': 'round' } : {}"
      :paint="layerPaint(layer)"
    />

    <MapboxMarker
      v-for="marker in markers"
      :key="marker.id"
      :lnglat="[marker.longitude, marker.latitude]"
    >
      <div
        class="rounded-full size-3 border-2 border-white shadow"
        :style="{ background: marker.color ?? MARKER_COLOR }"
        :title="marker.label ?? undefined"
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
