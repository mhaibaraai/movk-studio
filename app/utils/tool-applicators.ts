import type { ToolName, ToolOutput } from '#shared/utils/tools'
import { getTool } from '#shared/utils/tools'

/**
 * 一个工具「对画布做什么」。reduce 与 effect 可并存：落图的同时把相机移到结果范围。
 * 输出 schema 不在这里——它属于契约（shared/utils/tools），此处只写行为。
 *
 * TState / TCtx 由各工作区自行绑定（map 是地图状态 + 相机等命令式实例，
 * form 是表单结构 + 代码导出所需的状态引用）。
 */
export interface ToolApplicator<TState, TCtx> {
  /** 状态：归约进草稿。整段状态由消息重放重建，故必须幂等 */
  reduce?: (draft: TState, output: never) => void
  /** 副作用：仅对新出现的 toolCallId 触发一次 */
  effect?: (ctx: TCtx, output: never, animate: boolean) => void
  /** 会话首屏批量落位时是否重放：相机应落位，导出这类一次性动作不应重放 */
  replayOnLoad?: boolean
}

/** define 的入参形状；输出类型由契约推导。同构工具共用一份 spec 时需要显式标注它 */
export interface ApplicatorSpec<N extends ToolName, TState, TCtx> {
  reduce?: (draft: TState, output: ToolOutput<N>) => void
  effect?: (ctx: TCtx, output: ToolOutput<N>, animate: boolean) => void
  replayOnLoad?: boolean
}

/**
 * 绑定一个工作区的状态与上下文类型，产出该工作区专属的 define。
 *
 * define 从契约推导 output 类型，消除 as 强转；顺带守住「有 applicator 就必须有 output schema」
 * 的不变量——忘写契约 output 会在模块初始化时直接抛错，而不是运行时静默跳过。
 */
export function createDefine<TState, TCtx>() {
  return function define<N extends ToolName>(
    name: N,
    spec: ApplicatorSpec<N, TState, TCtx>
  ): ToolApplicator<TState, TCtx> {
    if (!getTool(name)?.output) {
      throw new Error(`工具 ${name} 有客户端 applicator，但契约未声明 output schema`)
    }
    return spec as ToolApplicator<TState, TCtx>
  }
}
