import { z } from 'zod'
import { omitUndefined } from '@movk/core'

// 派发上下文：相机与导出的组合式实例（在 setup 阶段构造后注入）
export interface MapEffectContext {
  camera: ReturnType<typeof useMapboxCamera>
  mapExport: ReturnType<typeof useMapExport>
}

// 工具回显输出的运行时 schema：客户端据此校验并推导类型，非法/错误输出（{ error }）会被解析拒绝
const flyToOutput = z.object({
  longitude: z.number(),
  latitude: z.number(),
  zoom: z.number().optional(),
  pitch: z.number().optional(),
  bearing: z.number().optional(),
  duration: z.number().optional()
})
const fitBoundsOutput = z.object({
  minLongitude: z.number(),
  minLatitude: z.number(),
  maxLongitude: z.number(),
  maxLatitude: z.number(),
  padding: z.number().optional()
})
const setBasemapOutput = z.object({
  layer: z.enum(['vec', 'img', 'ter']),
  annotation: z.boolean().optional()
})
const addMarkerOutput = z.object({
  longitude: z.number(),
  latitude: z.number(),
  label: z.string().nullish(),
  color: z.string().optional(),
  markerId: z.string()
})
const removeMarkerOutput = z.object({
  markerId: z.string().optional(),
  all: z.boolean().optional()
})
const bufferCircleOutput = z.object({
  longitude: z.number(),
  latitude: z.number(),
  radius: z.number(),
  color: z.string().optional(),
  circleId: z.string()
})
const addGeojsonOutput = z.object({
  type: z.enum(['point', 'line', 'polygon']),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  label: z.string().nullish(),
  color: z.string().optional(),
  layerId: z.string()
})
const exportImageOutput = z.object({ fileName: z.string() })

// 状态类：把输出归约进草稿（整段状态由消息重放重建，幂等无泄漏）
interface StateApplicator {
  kind: 'state'
  output: z.ZodTypeAny
  reduce: (draft: MapWorkspaceState, output: unknown) => void
}
// 相机/动作类：一次性副作用（相机可带动画，动作如导出下载）
export interface EffectApplicator {
  kind: 'camera' | 'action'
  output: z.ZodTypeAny
  effect: (ctx: MapEffectContext, output: unknown, animate: boolean) => void
}
export type MapToolApplicator = StateApplicator | EffectApplicator

function stateTool<S extends z.ZodTypeAny>(
  output: S,
  reduce: (draft: MapWorkspaceState, output: z.infer<S>) => void
): StateApplicator {
  return { kind: 'state', output, reduce: reduce as StateApplicator['reduce'] }
}
function cameraTool<S extends z.ZodTypeAny>(
  output: S,
  effect: (ctx: MapEffectContext, output: z.infer<S>, animate: boolean) => void
): EffectApplicator {
  return { kind: 'camera', output, effect: effect as EffectApplicator['effect'] }
}
function actionTool<S extends z.ZodTypeAny>(
  output: S,
  effect: (ctx: MapEffectContext, output: z.infer<S>) => void
): EffectApplicator {
  return { kind: 'action', output, effect: effect as EffectApplicator['effect'] }
}

// 工具名 → 客户端应用逻辑的唯一真源：HANDLED 集合与分类均由此派发表派生
export const MAP_TOOL_APPLICATORS: Record<string, MapToolApplicator> = {
  'fly-to': cameraTool(flyToOutput, (ctx, o, animate) => {
    // omitUndefined 剔除未提供的相机键，避免 mapbox 以 `key in options` + `+undefined` 得 NaN 污染矩阵；
    // animate 时省略 duration → 走 mapbox 默认飞行动画，非 animate → duration 0 即瞬移落位
    ctx.camera.flyTo(omitUndefined({
      center: [o.longitude, o.latitude],
      zoom: o.zoom,
      pitch: o.pitch,
      bearing: o.bearing,
      duration: animate ? o.duration : 0
    }) as Parameters<typeof ctx.camera.flyTo>[0])
  }),
  'fit-bounds': cameraTool(fitBoundsOutput, (ctx, o, animate) => {
    ctx.camera.fitBounds(
      [[o.minLongitude, o.minLatitude], [o.maxLongitude, o.maxLatitude]] as [[number, number], [number, number]],
      omitUndefined({ padding: o.padding, duration: animate ? undefined : 0 }) as Parameters<typeof ctx.camera.fitBounds>[1]
    )
  }),
  'set-basemap': stateTool(setBasemapOutput, (draft, o) => {
    draft.basemap = {
      ...draft.basemap,
      layer: o.layer,
      ...(o.annotation !== undefined ? { annotation: o.annotation } : {})
    }
  }),
  'add-marker': stateTool(addMarkerOutput, (draft, o) => {
    draft.markers = [...draft.markers, {
      id: o.markerId,
      longitude: o.longitude,
      latitude: o.latitude,
      label: o.label,
      color: o.color
    }]
  }),
  'remove-marker': stateTool(removeMarkerOutput, (draft, o) => {
    if (o.all) draft.markers = []
    else if (o.markerId) draft.markers = draft.markers.filter(m => m.id !== o.markerId)
    else draft.markers = draft.markers.slice(0, -1)
  }),
  'buffer-circle': stateTool(bufferCircleOutput, (draft, o) => {
    draft.bufferCircles = [...draft.bufferCircles, {
      id: o.circleId,
      longitude: o.longitude,
      latitude: o.latitude,
      radius: o.radius,
      color: o.color
    }]
  }),
  'add-geojson': stateTool(addGeojsonOutput, (draft, o) => {
    draft.geojsonLayers = [...draft.geojsonLayers, {
      id: o.layerId,
      type: o.type,
      coordinates: o.coordinates,
      label: o.label,
      color: o.color
    }]
  }),
  'export-image': actionTool(exportImageOutput, (ctx, o) => {
    ctx.mapExport.download({ fileName: o.fileName })
  })
}
