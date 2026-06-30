<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui'

const sidebarOpen = ref(true)
const searchOpen = ref(false)

const items: NavigationMenuItem[] = [
  [
    { label: '新建对话', icon: 'i-lucide-circle-plus', kbds: ['meta', 'o'] },
    { label: '搜索', icon: 'i-lucide-search', kbds: ['meta', 'k'], onSelect: () => searchOpen.value = true },
    { label: '工作区', type: 'label' },
    { label: '地图', icon: 'i-lucide-map' },
    { label: '表单', icon: 'i-lucide-shapes' },
    { label: '数据', icon: 'i-lucide-package' }
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
          :items="items"
          :collapsed="collapsed"
          orientation="vertical"
        >
          <template #item-trailing="{ item }">
            <div
              v-if="item.kbds?.length"
              class="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <UKbd
                v-for="kbd in item.kbds"
                :key="kbd"
                :value="kbd"
                size="sm"
                variant="soft"
                class="bg-accented/50"
              />
            </div>
          </template>
        </UNavigationMenu>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />

        <UButton
          :label="collapsed ? '' : '使用 GitHub 登录'"
          icon="i-simple-icons-github"
          color="neutral"
          variant="ghost"
          class="w-full"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch v-model:open="searchOpen" placeholder="搜索对话..." :groups="[]" />

    <slot />
  </UDashboardGroup>
</template>
