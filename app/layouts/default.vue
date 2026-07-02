<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui'

const { loggedIn, openInPopup, fetch: fetchSession } = useUserSession()
const toast = useToast()

const sidebarOpen = ref(true)
const searchOpen = ref(false)
const isLoggingIn = ref(false)

let loginTimeoutId: ReturnType<typeof setTimeout> | undefined

function onPopupStorageEvent(e: StorageEvent) {
  if (e.key !== 'temp-nuxt-auth-utils-popup')
    return

  finishLogin()
}

async function finishLogin() {
  window.removeEventListener('storage', onPopupStorageEvent)
  if (loginTimeoutId) {
    clearTimeout(loginTimeoutId)
    loginTimeoutId = undefined
  }

  await fetchSession()

  isLoggingIn.value = false

  if (loggedIn.value) {
    toast.add({ title: '登录成功', color: 'success', icon: 'i-lucide-circle-check' })
  } else {
    toast.add({ title: 'GitHub 登录未完成', description: '请重试', color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

function loginWithGithub() {
  isLoggingIn.value = true
  window.addEventListener('storage', onPopupStorageEvent)
  loginTimeoutId = setTimeout(finishLogin, 120_000)
  openInPopup('/auth/github')
}

onUnmounted(() => {
  window.removeEventListener('storage', onPopupStorageEvent)
  if (loginTimeoutId)
    clearTimeout(loginTimeoutId)
})

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
        <UserMenu v-if="loggedIn" :collapsed="collapsed" />
        <UButton
          v-else
          :label="collapsed ? '' : '使用 GitHub 登录'"
          icon="i-simple-icons-github"
          color="neutral"
          variant="ghost"
          class="w-full"
          :loading="isLoggingIn"
          @click="loginWithGithub"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch v-model:open="searchOpen" placeholder="搜索对话..." :groups="[]" />

    <slot />
  </UDashboardGroup>
</template>
