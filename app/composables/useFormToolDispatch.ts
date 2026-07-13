import type { Ref } from 'vue'
import type { UIMessage } from 'ai'
import type { Workspace } from '#shared/utils/workspace'
import { createFormSchema } from '#shared/utils/form-schema'

/** form 工作区的派发器：把表单结构注入通用派发器 */
export function useFormToolDispatch(
  messages: Ref<UIMessage[]>,
  workspace: Ref<Workspace>,
  chatId: Ref<string>
) {
  const state = useFormWorkspace()

  useToolDispatch({
    messages,
    workspace,
    chatId,
    target: 'form',
    state,
    createState: createFormSchema,
    applicators: FORM_TOOL_APPLICATORS,
    ctx: { schema: state }
  })
}
