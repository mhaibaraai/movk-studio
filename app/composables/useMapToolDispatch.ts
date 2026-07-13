import type { Ref } from 'vue'
import type { UIMessage } from 'ai'
import { getToolName, isToolUIPart } from 'ai'
import type { Workspace } from '#shared/utils/workspace'
import { getMapTool } from '#shared/utils/map-tools'

const HANDLED = new Set(Object.keys(MAP_TOOL_APPLICATORS))

interface DispatchItem {
  id: string
  name: string
  output: unknown
}

/**
 * 按契约校验工具回显，非法输出返回 null 由调用方跳过。
 *
 * `'error' in output` 不是 safeParse 的冗余前置检查：execute 捕获异常后回显 { error }，
 * 而 remove-marker 的输出字段全为 optional，`{ error: '...' }` 剥离未知键后是合法空对象、
 * 能通过 z.object 校验，进而误触发「移除最近一个标注」。
 */
function parseOutput(name: string, output: unknown): unknown | null {
  if (output && typeof output === 'object' && 'error' in output) return null

  const result = getMapTool(name)?.output?.safeParse(output)
  return result?.success ? result.data : null
}

export function useMapToolDispatch(
  messages: Ref<UIMessage[]>,
  workspace: Ref<Workspace>,
  chatId: Ref<string>
) {
  const state = useMapWorkspace()
  // setup 阶段一次性构造：组合式内部 inject()，在 watch 回调里构造会脱离同步栈触发 Vue 警告
  const ctx: MapEffectContext = {
    camera: useMapboxCamera({ mapId: MAP_ID }),
    mapExport: useMapExport({ mapId: MAP_ID }),
    draw: useMapboxDraw({ mapId: MAP_ID }),
    drawColor: usePendingDrawColor()
  }

  // 已触发过副作用的 toolCallId；null 表示当前会话尚未水合，下一次归约按「首屏批量落位」处理
  let seen: Set<string> | null = null
  // 状态签名：流式期每 token 都会触发 recompute，仅在归约结果真正变化时才整体写入
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

  function fireEffect(item: DispatchItem, animate: boolean) {
    const applicator = MAP_TOOL_APPLICATORS[item.name]
    if (!applicator?.effect) return
    const output = parseOutput(item.name, item.output)
    if (output === null) return
    applicator.effect(ctx, output as never, animate)
  }

  function recompute() {
    if (workspace.value !== 'map') return

    const items = collect()

    // 状态 = 当前全部消息的纯归约：切换会话 / 编辑 / 重生成 / 删除消息都自动收敛，无累积泄漏
    const draft = createMapWorkspaceState()
    for (const item of items) {
      const applicator = MAP_TOOL_APPLICATORS[item.name]
      if (!applicator?.reduce) continue
      const output = parseOutput(item.name, item.output)
      if (output === null) continue
      applicator.reduce(draft, output as never)
    }
    const stateKey = JSON.stringify(draft)
    if (stateKey !== lastStateKey) {
      lastStateKey = stateKey
      state.value = draft
    }

    // 会话首屏批量落位：相机只取最后一个且不带动画；导出这类动作只标记不重放，避免重复下载
    if (seen === null) {
      seen = new Set(items.map(item => item.id))
      const last = items.findLast(item => MAP_TOOL_APPLICATORS[item.name]?.replayOnLoad)
      if (last) fireEffect(last, false)
      return
    }

    // 流式实时：新出现的工具输出即时应用，相机带动画
    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      fireEffect(item, true)
    }
  }

  // 派发驱动纯客户端 mapbox 实例，SSR 期执行会污染共享 useState 引发 hydration 不匹配
  if (import.meta.client) {
    watch(chatId, () => {
      seen = null
    })
    watchEffect(recompute)
  }
}
