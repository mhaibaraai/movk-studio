import { LazyModalRename } from '#components'

interface CachedChat {
  id: string
  label: string
  icon: string
  createdAt: string | Date
}

export function useChatActions() {
  const toast = useToast()
  const overlay = useOverlay()
  const { confirm } = useMessageBox()
  const { csrf, headerName } = useCsrf()
  const { chatId, newChat, refreshChats } = useCopilot()

  const renameModal = overlay.create(LazyModalRename)

  async function renameChat(id: string, currentTitle: string): Promise<void> {
    const result = await renameModal.open({ title: currentTitle }).result
    if (!result || result === currentTitle) return

    const cache = useNuxtData<CachedChat[]>('chats')
    const snapshot = cache.data.value
    if (cache.data.value) {
      cache.data.value = cache.data.value.map(chat =>
        chat.id === id ? { ...chat, label: result } : chat
      )
    }

    try {
      await $fetch(`/api/chats/${id}`, {
        method: 'PATCH',
        headers: { [headerName]: csrf },
        body: { title: result }
      })
      toast.add({ description: '重命名成功', color: 'success', icon: 'i-lucide-circle-check' })
    } catch {
      cache.data.value = snapshot
      refreshChats()
      toast.add({ description: '重命名失败', color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  async function deleteChat(id: string): Promise<void> {
    const ok = await confirm({
      type: 'error',
      title: '删除对话',
      description: '此操作不可撤销，对话及其消息将被永久删除。',
      confirmButton: { label: '删除' },
      cancelButton: { label: '取消' }
    })
    if (!ok) return

    const cache = useNuxtData<CachedChat[]>('chats')
    const snapshot = cache.data.value
    if (cache.data.value) {
      cache.data.value = cache.data.value.filter(chat => chat.id !== id)
    }

    try {
      await $fetch(`/api/chats/${id}`, {
        method: 'DELETE',
        headers: { [headerName]: csrf }
      })
      toast.add({ description: '已删除', color: 'success', icon: 'i-lucide-circle-check' })
      // 删除的是当前打开会话时回到草稿态
      if (chatId.value === id) newChat()
    } catch {
      cache.data.value = snapshot
      refreshChats()
      toast.add({ description: '删除失败', color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }

  return { renameChat, deleteChat }
}
