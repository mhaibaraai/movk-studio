import type { Workspace } from '#shared/utils/workspace'
import { WORKSPACES } from '#shared/utils/workspace'
import { withQuery } from 'ufo'

interface UIChat {
  id: string
  label: string
  icon: string
  createdAt: string | Date
}

interface ChatRow {
  id: string
  title: string | null
  workspace: Workspace
  createdAt: string | Date
}

const DAY_MS = 86_400_000

// 按 createdAt 分到 今天 / 昨天 / 近 7 天 / 近 30 天 / 更早（按月份），空组不产出
function groupByDate(chats: Ref<UIChat[] | undefined>) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const today: UIChat[] = []
  const yesterday: UIChat[] = []
  const lastWeek: UIChat[] = []
  const lastMonth: UIChat[] = []
  const older: Record<string, UIChat[]> = {}

  for (const chat of chats.value ?? []) {
    const time = new Date(chat.createdAt).getTime()

    if (time >= startOfToday) {
      today.push(chat)
    } else if (time >= startOfToday - DAY_MS) {
      yesterday.push(chat)
    } else if (time >= startOfToday - 7 * DAY_MS) {
      lastWeek.push(chat)
    } else if (time >= startOfToday - 30 * DAY_MS) {
      lastMonth.push(chat)
    } else {
      const key = new Date(chat.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
      older[key] = [...(older[key] ?? []), chat]
    }
  }

  const groups = []
  if (today.length) groups.push({ id: 'today', label: '今天', items: today })
  if (yesterday.length) groups.push({ id: 'yesterday', label: '昨天', items: yesterday })
  if (lastWeek.length) groups.push({ id: 'last-week', label: '近 7 天', items: lastWeek })
  if (lastMonth.length) groups.push({ id: 'last-month', label: '近 30 天', items: lastMonth })

  for (const key of Object.keys(older)) {
    groups.push({ id: key, label: key, items: older[key]! })
  }

  return groups
}

/**
 * Copilot 会话的路由状态：按工作区隔离会话，chatId 走工作区路由的 query 参。
 * 草稿态（无 ?chat）回落到每工作区一个预生成 id，使「草稿 → 落库」只改 URL、不 remount。
 */
export function useCopilot() {
  const route = useRoute()
  const router = useRouter()

  const chatOpen = useState('copilot-chat-open', () => false)

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

  // 缓存数据须可序列化（进 SSR payload），不含函数
  const { data: chats, refresh: refreshChats } = useFetch(() => withQuery('/api/chats', {
    workspace: workspace.value === 'global' ? undefined : workspace.value
  }), {
    key: 'chats',
    transform: (data: ChatRow[]) => data.map(chat => ({
      id: chat.id,
      label: chat.title || '未命名对话',
      icon: 'i-lucide-message-circle',
      createdAt: chat.createdAt
    }))
  })

  // onSelect 在派生的 computed 上挂载（不进 payload），避免 devalue 无法序列化函数
  const groups = computed(() => groupByDate(chats).map(group => ({
    ...group,
    items: group.items.map(item => ({
      ...item,
      active: item.id === chatId.value,
      onSelect: () => openChat(item.id)
    }))
  })))

  return {
    chatOpen,
    workspace,
    chatId,
    isDraft,
    chats,
    newChat, openChat, refreshChats, persistToUrl,
    groups
  }
}
