export const WORKSPACES = ['map', 'form', 'data'] as const

export type Workspace = typeof WORKSPACES[number]

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  map: '地图',
  form: '表单',
  data: '数据'
}
