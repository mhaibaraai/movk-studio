<script lang="ts" setup>
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import type { Workspace } from '#shared/utils/workspace'

interface ChatRow {
  id: string
  title: string | null
  workspace: Workspace
  createdAt: string | Date
}

const { loggedIn, fetch: fetchSession } = useUserSession()
const toast = useToast()

const sidebarOpen = ref(false)
const searchOpen = ref(false)
const isLoggingIn = ref(false)

function loginWithGithub() {
  if (isLoggingIn.value)
    return

  isLoggingIn.value = true

  const popup = window.open('/auth/github', 'github-login', 'width=960,height=600')

  const timer = window.setInterval(async () => {
    if (popup && !popup.closed)
      return

    window.clearInterval(timer)
    await fetchSession()
    isLoggingIn.value = false

    toast.add(loggedIn.value
      ? { title: '登录成功', color: 'success', icon: 'i-lucide-circle-check' }
      : { title: 'GitHub 登录未完成', description: '请重试', color: 'error', icon: 'i-lucide-circle-alert' })
  }, 500)
}

const { chatOpen, newChat, refreshChats, workspace, chatId, openChat } = useCopilot()
const { renameChat, deleteChat } = useChatActions()

const { data: chats } = useFetch('/api/chats', {
  key: 'chats',
  query: { workspace },
  transform: (data: ChatRow[]) => data.map(chat => ({
    id: chat.id,
    label: chat.title || '未命名对话',
    icon: 'i-lucide-message-circle',
    createdAt: chat.createdAt
  }))
})

const groups = computed(() => groupByDate(chats).map(group => ({
  ...group,
  items: group.items.map(item => ({
    ...item,
    active: item.id === chatId.value,
    onSelect: () => openChat(item.id)
  }))
})))

const route = useRoute()
watch(() => route.query.chat, () => {
  searchOpen.value = false
})

const navs: NavigationMenuItem[] = [
  { label: '新建对话', icon: 'i-lucide-circle-plus', kbds: ['meta', 'o'], onSelect: () => newChat() },
  { label: '搜索', icon: 'i-lucide-search', kbds: ['meta', 'k'], onSelect: () => searchOpen.value = true }
]

const workspaceNavs: NavigationMenuItem[] = [
  { label: '工作区', type: 'label' },
  { label: '地图', icon: 'i-lucide-map', to: '/workspace/map' },
  { label: '表单', icon: 'i-lucide-shapes', to: '/workspace/form' },
  { label: '数据', icon: 'i-lucide-package', to: '/workspace/data' }
]

const historyChats = computed(() => groups.value?.flatMap((group) => {
  return [{
    label: group.label,
    type: 'label' as const
  }, ...group.items.map(item => ({
    ...item,
    slot: 'chat' as const,
    icon: undefined,
    class: item.label === '未命名对话' ? 'text-muted' : ''
  }))]
}))

function getChatActions(item: { id: string, label: string }): DropdownMenuItem[][] {
  return [[
    {
      label: '重命名',
      icon: 'i-lucide-pencil',
      onSelect: () => renameChat(item.id, item.label === '未命名对话' ? '' : item.label)
    }
  ], [
    {
      label: '删除',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => deleteChat(item.id)
    }
  ]]
}

onNuxtReady(async () => {
  const first10 = (chats.value || []).slice(0, 10)
  for (const chat of first10) {
    // prefetch the chat and let the browser cache it
    await $fetch(`/api/chats/${chat.id}`)
  }
})

watch(loggedIn, () => {
  refreshChats()

  sidebarOpen.value = false
})

defineShortcuts({
  meta_o: () => newChat()
})
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
        <NuxtLink v-if="!collapsed" to="/">
          <AppLogo class="h-6 w-auto shrink-0" />
        </NuxtLink>

        <UTooltip :text="collapsed ? '打开 Sidebar' : '折叠 Sidebar'">
          <UDashboardSidebarCollapse class="ms-auto" />
        </UTooltip>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          tooltip
          :items="navs"
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

        <UNavigationMenu
          v-if="!collapsed"
          :items="historyChats"
          orientation="vertical"
          :ui="{
            link: 'overflow-hidden pr-7.5',
            linkTrailing: 'translate-x-full group-hover:translate-x-0 group-has-data-[state=open]:translate-x-0 transition-transform ms-0 absolute inset-e-px'
          }"
        >
          <template #chat-trailing="{ item }">
            <UDropdownMenu :items="getChatActions(item as { id: string, label: string })" :content="{ align: 'end' }">
              <UButton
                as="div"
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="link"
                size="sm"
                class="rounded-[5px] hover:bg-accented/50 focus-visible:bg-accented/50 data-[state=open]:bg-accented/50"
                aria-label="Chat actions"
                tabindex="-1"
                @click.stop.prevent
              />
            </UDropdownMenu>
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

    <UDashboardSearch
      v-model:open="searchOpen"
      placeholder="搜索对话..."
      :groups="[{
        id: 'links',
        items: [{
          label: '新建对话',
          to: '/',
          icon: 'i-lucide-circle-plus',
          kbds: ['meta', 'o']
        }]
      }, ...groups]"
    />

    <div class="flex-1 flex">
      <div class="flex-1 flex flex-col">
        <div class="h-(--ui-header-height) shrink-0 flex items-center gap-2 px-4 border-b border-default">
          <UNavigationMenu :items="workspaceNavs" variant="link" class="flex-1 min-w-0 justify-center" />

          <UTooltip :text="chatOpen ? '关闭 Copilot' : '打开 Copilot'">
            <UButton
              :icon="chatOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
              color="neutral"
              variant="ghost"
              :aria-label="chatOpen ? '关闭 Copilot' : '打开 Copilot'"
              @click="() => { chatOpen = !chatOpen }"
            />
          </UTooltip>
        </div>

        <slot />
      </div>

      <CopilotPanel />
    </div>
  </UDashboardGroup>
</template>
