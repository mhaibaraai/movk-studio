import type { GeoJSON } from 'geojson'
import { omitUndefined } from '@movk/core'
import type { MapToolName, MapToolOutput } from '#shared/utils/map-tools'
import { getMapTool } from '#shared/utils/map-tools'

// 派发上下文：相机与导出的组合式实例（在 setup 阶段构造后注入）
export interface MapEffectContext {
  camera: ReturnType<typeof useMapboxCamera>
  mapExport: ReturnType<typeof useMapExport>
}

/**
 * 一个工具「对地图做什么」。reduce 与 effect 可并存：落图的同时把相机移到结果范围。
 * 输出 schema 不在这里——它属于契约（shared/utils/map-tools），此处只写行为。
 */
export interface MapToolApplicator {
  /** 状态：归约进草稿。整段状态由消息重放重建，故必须幂等 */
  reduce?: (draft: MapWorkspaceState, output: never) => void
  /** 副作用：仅对新出现的 toolCallId 触发一次 */
  effect?: (ctx: MapEffectContext, output: never, animate: boolean) => void
  /** 会话首屏批量落位时是否重放：相机应落位，导出这类一次性动作不应重放 */
  replayOnLoad?: boolean
}

interface ApplicatorSpec<N extends MapToolName> {
  reduce?: (draft: MapWorkspaceState, output: MapToolOutput<N>) => void
  effect?: (ctx: MapEffectContext, output: MapToolOutput<N>, animate: boolean) => void
  replayOnLoad?: boolean
}

// 从契约推导 output 类型，消除 as 强转；顺带守住「有 applicator 就必须有 output schema」的不变量
function define<N extends MapToolName>(name: N, spec: ApplicatorSpec<N>): MapToolApplicator {
  if (!getMapTool(name)?.output) {
    throw new Error(`工具 ${name} 有客户端 applicator，但契约未声明 output schema`)
  }
  return spec as MapToolApplicator
}

// 自动落位的统一留白；限制最大缩放，避免单点结果的退化包围盒把相机贴地放大
const FIT_OPTIONS = { padding: 60, maxZoom: 15 }

function fitTo(ctx: MapEffectContext, target: GeoJSON, animate: boolean) {
  ctx.camera.fitBounds(target, animate ? FIT_OPTIONS : { ...FIT_OPTIONS, duration: 0 })
}

// search-poi 与 search-poi-in-area 输出同构，共用同一份落图 + 自动框选行为
const poiApplicator: ApplicatorSpec<'search-poi'> = {
  // 赋值替换而非累加：每次搜索是「当前展示」，不跨轮次累积历史结果
  reduce: (draft, o) => {
    draft.pois = o.results
  },
  effect: (ctx, o, animate) => {
    if (!o.results.length) return
    fitTo(ctx, { type: 'MultiPoint', coordinates: o.results.map(poi => poi.location) }, animate)
  },
  replayOnLoad: true
}

// 工具名 → 客户端应用逻辑；分发器的 HANDLED 集合由此表派生
export const MAP_TOOL_APPLICATORS: Record<string, MapToolApplicator> = {
  'fly-to': define('fly-to', {
    // omitUndefined 剔除未提供的相机键：mapbox 以 `key in options` 判定字段是否指定，
    // 值为 undefined 时仍参与插值会得 NaN，污染 transform 矩阵（failed to invert matrix）。
    // animate 时省略 duration → 走 mapbox 默认飞行动画；非 animate → duration 0 即瞬移落位
    effect: (ctx, o, animate) => {
      ctx.camera.flyTo(omitUndefined({
        center: [o.longitude, o.latitude],
        zoom: o.zoom,
        pitch: o.pitch,
        bearing: o.bearing,
        duration: animate ? o.duration : 0
      }) as Parameters<typeof ctx.camera.flyTo>[0])
    },
    replayOnLoad: true
  }),

  'fit-bounds': define('fit-bounds', {
    effect: (ctx, o, animate) => {
      ctx.camera.fitBounds(
        [[o.minLongitude, o.minLatitude], [o.maxLongitude, o.maxLatitude]],
        omitUndefined({ padding: o.padding, duration: animate ? undefined : 0 })
      )
    },
    replayOnLoad: true
  }),

  'set-basemap': define('set-basemap', {
    reduce: (draft, o) => {
      draft.basemap = {
        ...draft.basemap,
        layer: o.layer,
        ...(o.annotation !== undefined ? { annotation: o.annotation } : {})
      }
    }
  }),

  'add-marker': define('add-marker', {
    reduce: (draft, o) => {
      draft.markers = [...draft.markers, {
        id: o.markerId,
        longitude: o.longitude,
        latitude: o.latitude,
        label: o.label,
        color: o.color
      }]
    }
  }),

  'remove-marker': define('remove-marker', {
    reduce: (draft, o) => {
      if (o.all) draft.markers = []
      else if (o.markerId) draft.markers = draft.markers.filter(marker => marker.id !== o.markerId)
      else draft.markers = draft.markers.slice(0, -1)
    }
  }),

  'buffer-circle': define('buffer-circle', {
    reduce: (draft, o) => {
      draft.bufferCircles = [...draft.bufferCircles, {
        id: o.circleId,
        longitude: o.longitude,
        latitude: o.latitude,
        radius: o.radius,
        color: o.color
      }]
    }
  }),

  'add-geojson': define('add-geojson', {
    reduce: (draft, o) => {
      draft.geojsonLayers = [...draft.geojsonLayers, {
        id: o.layerId,
        type: o.type,
        coordinates: o.coordinates,
        label: o.label,
        color: o.color
      }]
    }
  }),

  // 以下四个只写 reduce：立体视角属于相机，交给 fly-to 的 pitch，不在这里抢镜头。
  // 若给它们加相机 effect，刷新页面时会顶掉派发器重放的最后一个 fly-to，位置随之丢失。
  'toggle-3d-buildings': define('toggle-3d-buildings', {
    reduce: (draft, o) => {
      draft.buildings3d = o.enabled ? { color: o.color, opacity: o.opacity, minZoom: o.minZoom } : undefined
    }
  }),

  'set-terrain': define('set-terrain', {
    reduce: (draft, o) => {
      draft.terrain = o.enabled ? { exaggeration: o.exaggeration } : undefined
    }
  }),

  'add-heatmap': define('add-heatmap', {
    reduce: (draft, o) => {
      draft.heatmap = {
        id: o.heatmapId,
        points: o.points,
        weightRange: o.weightRange,
        radius: o.radius,
        opacity: o.opacity,
        label: o.label
      }
    }
  }),

  'add-cluster': define('add-cluster', {
    reduce: (draft, o) => {
      draft.cluster = { id: o.clusterId, points: o.points, label: o.label }
    }
  }),

  'export-image': define('export-image', {
    effect: (ctx, o) => ctx.mapExport.download({ fileName: o.fileName }),
    replayOnLoad: false
  }),

  'search-poi': define('search-poi', poiApplicator),
  'search-poi-in-area': define('search-poi-in-area', poiApplicator),

  'get-administrative-boundary': define('get-administrative-boundary', {
    reduce: (draft, o) => {
      const [first] = o.divisions
      draft.adminBoundary = first ? { name: first.name, boundary: first.boundary } : undefined
    },
    effect: (ctx, o, animate) => {
      const [first] = o.divisions
      if (first) fitTo(ctx, first.boundary, animate)
    },
    replayOnLoad: true
  }),

  'plan-route': define('plan-route', {
    // 路线几何直接落图，不经 LLM 转录；标量距离 / 时长留在工具输出供 LLM 口述
    reduce: (draft, o) => {
      draft.route = o.path
    },
    effect: (ctx, o, animate) => fitTo(ctx, o.path, animate),
    replayOnLoad: true
  })
}
