import type { FormSchema } from '#shared/utils/form-schema'
import { createFormSchema } from '#shared/utils/form-schema'

/** 表单结构：消息的纯归约，只有 AI 工具能改 */
export function useFormWorkspace() {
  return useState<FormSchema>('form-workspace', createFormSchema)
}

/**
 * 用户在预览表单里填写的值。刻意不进消息归约状态——它是交互产物、不是任何工具输出的函数，
 * 塞进归约状态会在下一条消息到达时被重算清空（与 map 的 useDrawnFeatures 同一模式）。
 *
 * 两条有意为之的后果：不落库（刷新即丢），不随 chatId 重置（切换会话时用户填的内容保留）。
 */
export function useFormValues() {
  return useState<Record<string, unknown>>('form-values', () => ({}))
}
