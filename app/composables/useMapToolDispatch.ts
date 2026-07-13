import type { Ref } from 'vue'
import type { UIMessage } from 'ai'
import type { Workspace } from '#shared/utils/workspace'

/**
 * map 工作区的派发器：把地图状态、相机 / 导出 / 绘制实例注入通用派发器。
 *
 * ctx 在 setup 阶段一次性构造——这些组合式内部 inject()，在 watch 回调里构造会脱离同步栈触发 Vue 警告。
 */
export function useMapToolDispatch(
  messages: Ref<UIMessage[]>,
  workspace: Ref<Workspace>,
  chatId: Ref<string>
) {
  const ctx: MapEffectContext = {
    camera: useMapboxCamera({ mapId: MAP_ID }),
    mapExport: useMapExport({ mapId: MAP_ID }),
    draw: useMapboxDraw({ mapId: MAP_ID }),
    drawColor: usePendingDrawColor()
  }

  useToolDispatch({
    messages,
    workspace,
    chatId,
    target: 'map',
    state: useMapWorkspace(),
    createState: createMapWorkspaceState,
    applicators: MAP_TOOL_APPLICATORS,
    ctx
  })
}
