interface UIChat {
  id: string
  label: string
  icon: string
  createdAt: string | Date
}

const DAY_MS = 86_400_000

// 按 createdAt 分到 今天 / 昨天 / 近 7 天 / 近 30 天 / 更早（按月份），空组不产出
export function groupByDate(chats: Ref<UIChat[] | undefined>) {
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
