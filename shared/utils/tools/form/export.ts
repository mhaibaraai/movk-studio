import { z } from 'zod'
import type { ToolContract } from '../types'

export const FORM_EXPORT_TOOLS = {
  'export-form-code': {
    workspaces: ['form'],
    description: '把当前表单导出为一个 TypeScript 文件并下载，内容是可直接粘回项目使用的 afz 写法代码。用户说「导出代码 / 下载下来 / 给我代码文件」时使用。用户只是想看看代码时不必调用——画布上的「代码」页签已经实时展示了同一份代码。',
    input: {
      fileName: z.string().max(80).optional().describe('下载文件名，不含扩展名，缺省为 form-schema')
    },
    output: z.object({ fileName: z.string() }),
    icon: 'i-lucide-download',
    status: ['正在导出代码…', '已导出代码'],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
