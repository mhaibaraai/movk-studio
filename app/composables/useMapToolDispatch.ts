import type { Ref } from 'vue'
import type { UIMessage } from 'ai'
import { getToolName, isToolUIPart } from 'ai'
import type { Workspace } from '#shared/utils/workspace'

const HANDLED = new Set(Object.keys(MAP_TOOL_APPLICATORS))

interface DispatchItem {
  id: string
  name: string
  output: unknown
}

// 跳过错误回显（execute 捕获异常返回 { error }）与解析失败的畸形输出，避免把 undefined/NaN 注入地图
function parseOutput(app: MapToolApplicator, output: unknown): unknown | null {
  if (output && typeof output === 'object' && 'error' in output) return null
  const result = app.output.safeParse(output)
  return result.success ? result.data : null
}

export function useMapToolDispatch(
  messages: Ref<UIMessage[]>,
  workspace: Ref<Workspace>,
  chatId: Ref<string>
) {
  const store = useMapWorkspace()
  // setup 阶段一次性构造：组合式内部 inject()，在 watch 回调里构造会脱离同步栈触发 Vue 警告
  const ctx: MapEffectContext = {
    camera: useMapboxCamera({ mapId: MAP_ID }),
    mapExport: useMapExport({ mapId: MAP_ID })
  }
  // 相机/动作为一次性副作用，按 toolCallId 去重；bulkApplied 区分「会话首屏批量落位」与「流式实时」
  const firedEffects = new Set<string>()
  let bulkApplied = false
  // 状态签名：流式期每 token 都会触发 recompute，仅在归约结果真正变化时才整体写入，避免无谓渲染
  let lastStateKey = ''

  function collect(): DispatchItem[] {
    const items: DispatchItem[] = []
    for (const message of messages.value) {
      if (message.role !== 'assistant') continue
      for (const part of message.parts ?? []) {
        if (!isToolUIPart(part) || part.state !== 'output-available') continue
        const name = getToolName(part)
        if (!HANDLED.has(name)) continue
        items.push({ id: part.toolCallId, name, output: part.output })
      }
    }
    return items
  }

  function recompute() {
    if (workspace.value !== 'map') return

    const items = collect()

    // 状态类：从当前全部消息整体归约后一次性写入 → 切换会话/编辑/重生成/删除均无累积泄漏
    const draft = createMapWorkspaceState()
    for (const item of items) {
      const app = MAP_TOOL_APPLICATORS[item.name]
      if (!app || app.kind !== 'state') continue
      const output = parseOutput(app, item.output)
      if (output === null) continue
      app.reduce(draft, output)
    }
    const stateKey = JSON.stringify(draft)
    if (stateKey !== lastStateKey) {
      lastStateKey = stateKey
      store.setState(draft)
    }

    // 相机/动作类：仅对新出现的 toolCallId 触发一次
    if (!bulkApplied) {
      bulkApplied = true
      // 会话首屏批量落位：相机仅取最后一个且不带动画，动作只标记不重放（避免重复下载）
      let lastCamera: { app: EffectApplicator, output: unknown } | null = null
      for (const item of items) {
        const app = MAP_TOOL_APPLICATORS[item.name]
        if (!app || app.kind === 'state') continue
        firedEffects.add(item.id)
        if (app.kind !== 'camera') continue
        const output = parseOutput(app, item.output)
        if (output !== null) lastCamera = { app, output }
      }
      if (lastCamera) lastCamera.app.effect(ctx, lastCamera.output, false)
      return
    }

    // 流式实时：新工具输出即时应用（相机带动画）
    for (const item of items) {
      const app = MAP_TOOL_APPLICATORS[item.name]
      if (!app || app.kind === 'state' || firedEffects.has(item.id)) continue
      firedEffects.add(item.id)
      const output = parseOutput(app, item.output)
      if (output === null) continue
      app.effect(ctx, output, true)
    }
  }

  // 派发驱动纯客户端 mapbox 地图，SSR 期执行会污染共享 useState 引发 hydration 不匹配，故仅客户端注册
  if (import.meta.client) {
    // 切换会话：重置一次性副作用追踪，下一次消息归约按「首屏批量落位」重放目标会话
    watch(chatId, () => {
      firedEffects.clear()
      bulkApplied = false
    })
    watchEffect(recompute)
  }
}
