import { z } from 'zod'
import type { ToolContract } from '../types'

const drawShape = {
  shape: z.enum(['point', 'line', 'polygon', 'rectangle', 'circle'])
    .describe('要绘制的形状：point 点、line 线、polygon 任意多边形、rectangle 矩形、circle 圆'),
  color: z.string().optional()
    .describe('本次绘制的颜色（CSS 颜色值，如 #f43f5e）；缺省用默认主题色。只作用于用户接下来画出的这一个要素')
}

export const DRAW_TOOLS = {
  'draw-shape': {
    workspaces: ['map'],
    description: '让地图进入交互式绘制模式，由用户亲手在地图上画出一个形状。仅用于「让我自己画 / 我来手动画一个区域 / 我要框选一个范围」这类交互式请求。若用户已经给出坐标或地名，请改用 add-geojson 直接绘制，不要让用户手动画；已知圆心与半径请用 buffer-circle。画完一个要素后地图自动退回选择模式。',
    input: drawShape,
    output: z.object(drawShape),
    icon: 'i-lucide-pencil-line',
    status: ['正在进入绘制模式…', '已进入绘制模式'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  'clear-drawing': {
    workspaces: ['map'],
    description: '清除用户在地图上手绘的全部要素。只影响手绘内容，不影响由 add-marker / add-geojson / buffer-circle 等工具添加的标注与图层——清除那些请用 remove-marker。',
    input: {},
    output: z.object({}),
    icon: 'i-lucide-eraser',
    status: ['正在清除手绘…', '已清除全部手绘'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
