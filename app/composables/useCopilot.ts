import type { Workspace } from '#shared/utils/workspace'
import { WORKSPACES } from '#shared/utils/workspace'

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

  function openChat(id: string) {
    router.replace({ path: route.path, query: { chat: id } })
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
