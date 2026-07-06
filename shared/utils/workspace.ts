export const WORKSPACES = ['global', 'map', 'form', 'data'] as const

export type Workspace = typeof WORKSPACES[number]

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  global: '通用',
  map: '地图',
  form: '表单',
  data: '数据'
}
