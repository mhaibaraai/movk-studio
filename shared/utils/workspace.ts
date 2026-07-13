export const WORKSPACES = ['global', 'map', 'form', 'data'] as const

export type Workspace = typeof WORKSPACES[number]

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  global: '通用',
  map: '地图',
  form: '表单',
  data: '数据'
}

export const WORKSPACE_ICONS: Record<Workspace, string> = {
  global: 'i-lucide-message-circle',
  map: 'i-lucide-map',
  form: 'i-lucide-shapes',
  data: 'i-lucide-package'
}

/** workspace → 路由 path；useCopilot 里「path → workspace」推导的逆函数 */
export function workspacePath(workspace: Workspace): string {
  return workspace === 'global' ? '/' : `/workspace/${workspace}`
}
