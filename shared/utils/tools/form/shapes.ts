import { z } from 'zod'
import { CONDITION_OPS, FIELD_TYPES } from '../../form-schema'

/** form 各工具契约共用的 zod 形状，逐一对应 shared/utils/form-schema.ts 的类型 */

export const fieldTypeSchema = z.enum(FIELD_TYPES).describe(
  '字段类型：text 单行文本、textarea 多行文本、password 密码、email 邮箱、url 网址、phone 手机号、'
  + 'number 数字、slider 滑块、rating 星级评分、switch 开关、checkbox 勾选框、'
  + 'select 下拉选择、radio 单选组、pills 胶囊选择、tags 标签输入、date 日期、time 时间、'
  + 'file 文件上传、color 取色器、pin 验证码输入'
)

export const optionSchema = z.object({
  label: z.string().describe('展示给用户的文案'),
  value: z.string().describe('存入表单数据的值')
})

export const validationSchema = z.object({
  required: z.boolean().optional().describe('是否必填；缺省为必填，选填字段须显式传 false'),
  min: z.number().optional().describe('文本类为最小长度，数值类为最小值'),
  max: z.number().optional().describe('文本类为最大长度，数值类为最大值'),
  pattern: z.string().max(200).optional().describe('正则源串，不带两侧斜杠，如 ^1[3-9]\\d{9}$'),
  patternMessage: z.string().optional().describe('正则不匹配时展示的提示文案'),
  integer: z.boolean().optional().describe('数值必须为整数')
})

export const conditionSchema = z.object({
  field: z.string().describe('被依赖字段的 name'),
  op: z.enum(CONDITION_OPS).describe('比较方式：eq 等于、ne 不等于、in 在集合内、notIn 不在集合内、gt 大于、lt 小于、truthy 有值、falsy 无值'),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()]))
  ]).optional().describe('比较值；op 为 truthy / falsy 时不需要，in / notIn 时传数组')
})

export const fieldSchema = z.object({
  name: z.string().describe('字段唯一标识，同时是表单数据的键；后续所有针对该字段的工具都靠它定位，用英文小驼峰'),
  type: fieldTypeSchema,
  label: z.string().describe('字段标签，展示给用户'),
  description: z.string().optional().describe('字段下方的补充说明'),
  placeholder: z.string().optional().describe('输入框占位文案；仅文本、数字与选择类控件生效'),
  group: z.string().optional().describe('所属分组的 id，须与 set-layout 定义过的某个分组 id 一致；不传则渲染在顶层'),
  defaultValue: z.unknown().optional().describe('默认值'),
  options: z.array(optionSchema).optional().describe('可选项；select / radio / pills 必须提供'),
  validation: validationSchema.optional(),
  condition: conditionSchema.optional(),
  controlProps: z.record(z.string(), z.unknown()).optional().describe('透传给底层控件的额外 props，一般不需要')
})

export const groupSchema = z.object({
  id: z.string().describe('分组唯一标识，字段的 group 字段引用它，用英文小驼峰'),
  title: z.string().optional().describe('分组标题'),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe('组内字段的栅格列数，缺省 1'),
  collapsible: z.boolean().optional().describe('是否可折叠，缺省否')
})

export const formMetaShape = {
  title: z.string().describe('表单标题'),
  description: z.string().optional().describe('表单说明，展示在标题下方'),
  submitText: z.string().optional().describe('提交按钮文案，缺省「提交」')
}
