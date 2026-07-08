import type { Workspace } from './workspace'

// 工具名 → 可用工作区：server 端按工作区过滤下发，唯一真源。
// 新增 form/data 工具时在此增量登记即可。
export const TOOL_WORKSPACES: Record<string, Workspace[]> = {
  'fly-to': ['map'],
  'fit-bounds': ['map'],
  'set-basemap': ['map'],
  'add-marker': ['map'],
  'remove-marker': ['map'],
  'buffer-circle': ['map'],
  'add-geojson': ['map'],
  'export-image': ['map'],
  'measure-distance': ['map'],
  'convert-coordinate': ['map'],
  'geocode-place': ['map'],
  'search-poi': ['map'],
  'reverse-geocode': ['map'],
  'get-administrative-boundary': ['map'],
  'plan-route': ['map']
}
