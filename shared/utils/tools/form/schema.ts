import { z } from 'zod'
import type { ToolContract } from '../types'
import { fieldSchema, groupSchema } from '../../form-schema'

const generateForm = {
  groups: z.array(groupSchema).optional().describe('分组定义；字段超过 6 个时建议分组，不分组则省略'),
  fields: z.array(fieldSchema).min(1).describe('全部字段，按展示顺序排列')
}

export const FORM_SCHEMA_TOOLS = {
  'generate-form': {
    description: '一次性生成一份完整表单，整体替换画布上现有的表单。用户描述一个新表单需求（如「做一个员工入职登记表」「我要一份客户满意度问卷」）时使用。已有表单需要局部修改时不要用它——那会丢掉现有内容，请改用 upsert-field 等增量工具。',
    input: generateForm,
    icon: 'i-lucide-wand-sparkles',
    status: ['正在生成表单…', '已生成表单'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'clear-form': {
    description: '清空画布上的整个表单，包括全部字段与分组。用户明确要求「清空 / 重来 / 全部删掉」时使用。',
    input: {},
    icon: 'i-lucide-trash-2',
    status: ['正在清空表单…', '已清空表单'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  'export-form-code': {
    description: '把当前表单导出为一个 Vue 单文件组件并下载，内容是可直接粘回项目使用的 afz 写法代码。用户说「导出代码 / 下载下来 / 给我代码文件」时使用。用户只是想看看代码时不必调用——画布上的「代码」页签已经实时展示了同一份代码。',
    input: {
      fileName: z.string().max(80).optional().describe('下载文件名，不含扩展名（会自动加 .vue），缺省为 form-schema')
    },
    output: z.object({ fileName: z.string() }),
    icon: 'i-lucide-download',
    status: ['正在导出代码…', '已导出代码'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
} satisfies Record<string, ToolContract>
