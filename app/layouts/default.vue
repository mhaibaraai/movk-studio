<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui'

const sidebarOpen = ref(true)

const items: NavigationMenuItem[] = [
  [
    { label: '工作区', type: 'label' },
    {
      label: '地图',
      icon: 'i-lucide-map'
    }, {
      label: '表单',
      icon: 'i-lucide-shapes'
    }, {
      label: '数据',
      icon: 'i-lucide-package'
    }
  ]
]
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="sidebarOpen"
      :min-size="14"
      collapsible
      resizable
      :ui="{
        footer: 'lg:border-t lg:border-default'
      }"
    >
      <template #header="{ collapsed }">
        <AppLogo v-if="!collapsed" class="h-6 w-auto shrink-0" />
        <UDashboardSidebarCollapse class="ms-auto" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          tooltip
          :collapsed="collapsed"
          :items="items"
          orientation="vertical"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="[]" />

    <slot />
  </UDashboardGroup>
</template>
