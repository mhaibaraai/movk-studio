<script setup lang="ts">
</script>

<template>
  <MapboxMap
    :options="{
      projection: 'globe',
      center: [116.397, 39.908],
      zoom: 9,
      style: 'mapbox://styles/mapbox/empty-v9'
    }"
  >
    <MapboxTiandituLayer layer="vec" annotation />

    <MapboxFullscreenControl />

    <MapboxNavigationControl />

    <MapboxGeolocateControl
      :options="{
        trackUserLocation: true,
        showUserHeading: true,
        positionOptions: { enableHighAccuracy: true }
      }"
    />

    <MapboxScaleControl />
  </MapboxMap>
</template>
