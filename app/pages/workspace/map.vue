<script setup lang="ts">
const center = ref<[number, number]>([116.397, 39.908])
const zoom = ref(9)
</script>

<template>
  <MapboxMap v-model:center="center" v-model:zoom="zoom" :options="{ style: 'mapbox://styles/mapbox/empty-v9' }">
    <MapboxTiandituLayer layer="vec" annotation />

    <MapboxNavigationControl position="top-right" />
  </MapboxMap>
</template>
