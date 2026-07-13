import type { Workspace } from '#shared/utils/workspace'
import { WORKSPACES, workspacePath } from '#shared/utils/workspace'

export function useCopilot() {
  const route = useRoute()
  const router = useRouter()

  const chatOpen = useState('copilot-chat-open', () => !!route.query.chat)

  const workspace = computed<Workspace>(() => {
    const seg = route.path.split('/')[2] ?? ''
    return (WORKSPACES as readonly string[]).includes(seg) ? seg as Workspace : 'global'
  })

  const isDraft = computed(() => !route.query.chat)

  const draftIds = useState<Record<Workspace, string>>('copilot-draft-ids', () => ({
    global: crypto.randomUUID(),
    map: crypto.randomUUID(),
    form: crypto.randomUUID(),
    data: crypto.randomUUID()
  }))

  const chatId = computed(() => (route.query.chat as string) || draftIds.value[workspace.value])

  function newChat() {
    draftIds.value = { ...draftIds.value, [workspace.value]: crypto.randomUUID() }
    router.replace({ path: route.path, query: {} })
    chatOpen.value = true
  }

  // 传入会话所属 workspace 时跳到对应工作区路由（home 列出的是全部工作区的会话）
  function openChat(id: string, target?: Workspace) {
    const path = target ? workspacePath(target) : route.path
    const to = { path, query: { chat: id } }

    // 同工作区内切会话不该堆历史栈；跨工作区是一次真实导航，push 让浏览器回退可用
    if (path === route.path) router.replace(to)
    else router.push(to)

    chatOpen.value = true
  }

  // 草稿首发后把当前草稿 id 固化进 URL（chatId 不变 → 不触发会话切换）
  function persistToUrl() {
    router.replace({ path: route.path, query: { chat: chatId.value } })
  }

  const refreshChats = () => refreshNuxtData('chats')

  return {
    chatOpen,
    workspace,
    chatId,
    isDraft,
    newChat, openChat, refreshChats, persistToUrl
  }
}
