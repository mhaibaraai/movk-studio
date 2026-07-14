import type { Ref } from 'vue'
import type { UIMessage } from 'ai'
import type { Workspace } from '#shared/utils/workspace'
import { createTableSchema } from '#shared/utils/table-schema'

export function useTableToolDispatch(
  messages: Ref<UIMessage[]>,
  workspace: Ref<Workspace>,
  chatId: Ref<string>
) {
  const state = useTableWorkspace()
  // useNuxtApp 只能在 setup 同步栈里调，故在此取出 $prettier 后注入 ctx
  const { $prettier } = useNuxtApp()

  useToolDispatch({
    messages,
    workspace,
    chatId,
    target: 'data',
    state,
    createState: createTableSchema,
    applicators: DATA_TOOL_APPLICATORS,
    ctx: {
      schema: state,
      // 格式化失败不该让下载整个失败，退回未格式化的源码
      format: (source: string) => $prettier.format(source).catch(() => source)
    }
  })
}
