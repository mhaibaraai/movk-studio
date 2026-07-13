import type { Ref } from 'vue'
import type { UIMessage } from 'ai'
import { getToolName, isToolUIPart } from 'ai'
import type { Workspace } from '#shared/utils/workspace'
import { getTool } from '#shared/utils/tools'

interface DispatchItem {
  id: string
  name: string
  output: unknown
}

export interface ToolDispatchOptions<TState, TCtx> {
  messages: Ref<UIMessage[]>
  /** 当前所在工作区，由路由推导 */
  workspace: Ref<Workspace>
  chatId: Ref<string>
  /** 本派发器负责的工作区；与 workspace 不符时整体空转 */
  target: Workspace
  /** 归约结果的写入目标 */
  state: Ref<TState>
  /** 状态的初始 / 复位值，每次重算都基于它构造草稿 */
  createState: () => TState
  applicators: Record<string, ToolApplicator<TState, TCtx>>
  /** effect 的执行上下文；必须由调用方在 setup 同步栈内构造 */
  ctx: TCtx
}

/**
 * 按契约校验工具回显，非法输出返回 null 由调用方跳过。
 *
 * `'error' in output` 不是 safeParse 的冗余前置检查：execute 捕获异常后回显 { error }，
 * 而 remove-marker 这类输出字段全为 optional 的工具，`{ error: '...' }` 剥离未知键后是合法空对象、
 * 能通过 z.object 校验，进而误触发「移除最近一个标注」。
 */
function parseOutput(name: string, output: unknown): unknown | null {
  if (output && typeof output === 'object' && 'error' in output) return null

  const result = getTool(name)?.output?.safeParse(output)
  return result?.success ? result.data : null
}

/**
 * 工具输出 → 画布的通用派发器。各工作区注入自己的状态、上下文与 applicator 表。
 *
 * 派发驱动的是纯客户端实例（mapbox 地图、表单编译产物），SSR 期执行会污染共享 useState
 * 引发 hydration 不匹配，故整体包在 import.meta.client 内。
 */
export function useToolDispatch<TState, TCtx>(options: ToolDispatchOptions<TState, TCtx>) {
  const { messages, workspace, chatId, target, state, createState, applicators, ctx } = options

  const handled = new Set(Object.keys(applicators))

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
        if (!handled.has(name)) continue
        items.push({ id: part.toolCallId, name, output: part.output })
      }
    }
    return items
  }

  function fireEffect(item: DispatchItem, animate: boolean) {
    const applicator = applicators[item.name]
    if (!applicator?.effect) return
    const output = parseOutput(item.name, item.output)
    if (output === null) return
    applicator.effect(ctx, output as never, animate)
  }

  function recompute() {
    if (workspace.value !== target) return

    const items = collect()

    // 状态 = 当前全部消息的纯归约：切换会话 / 编辑 / 重生成 / 删除消息都自动收敛，无累积泄漏
    const draft = createState()
    for (const item of items) {
      const applicator = applicators[item.name]
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
      const last = items.findLast(item => applicators[item.name]?.replayOnLoad)
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

  if (import.meta.client) {
    watch(chatId, () => {
      seen = null
    })
    watchEffect(recompute)
  }
}
