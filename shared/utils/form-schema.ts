import { z } from 'zod'
import { conditionSchema } from './condition'

/**
 * form 工作区的画布状态：可序列化的表单结构，对应 map 的 MapWorkspaceState。
 *
 * zod schema 是唯一真源，类型一律由 z.infer 派生：工具契约（shared/utils/tools/form/）拿它做
 * input/output，服务端拿它校验上下文快照，客户端拿它编译成 <AutoForm> 要的活 ZodObject。
 * 字段说明写在 .describe() 里——AI 靠它选参数。
 */

export const FIELD_TYPES = [
  'text',
  'textarea',
  'password',
  'email',
  'url',
  'phone',
  'number',
  'slider',
  'rating',
  'switch',
  'checkbox',
  'select',
  'radio',
  'pills',
  'tags',
  'date',
  'time',
  'file',
  'color',
  'pin'
] as const

export type FieldType = typeof FIELD_TYPES[number]

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

export const fieldSchema = z.object({
  name: z.string().describe('字段唯一标识，同时是表单数据的键；后续所有针对该字段的工具都靠它定位，用英文小驼峰'),
  type: z.enum(FIELD_TYPES).describe(
    '字段类型：text 单行文本、textarea 多行文本、password 密码、email 邮箱、url 网址、phone 手机号、'
    + 'number 数字、slider 滑块、rating 星级评分、switch 开关、checkbox 勾选框、'
    + 'select 下拉选择、radio 单选组、pills 胶囊选择、tags 标签输入、date 日期、time 时间、'
    + 'file 文件上传、color 取色器、pin 验证码输入'
  ),
  label: z.string().describe('字段标签，展示给用户'),
  description: z.string().optional().describe('字段下方的补充说明'),
  placeholder: z.string().optional().describe('输入框占位文案；仅文本、数字与选择类控件生效'),
  group: z.string().optional().describe('所属分组的 id，须与 set-layout 定义过的某个分组 id 一致；不传则渲染在顶层'),
  defaultValue: z.unknown().optional().describe('默认值'),
  options: z.array(optionSchema).optional().describe('可选项；select / radio / pills 必须提供'),
  validation: validationSchema.optional(),
  condition: conditionSchema.optional(),
  controlProps: z.record(z.string(), z.unknown()).optional().describe('透传给底层控件的额外 props，一般不需要；on[A-Z] 开头的事件键会被编译器剔除')
})

export const groupSchema = z.object({
  id: z.string().describe('分组唯一标识，字段的 group 字段引用它，用英文小驼峰'),
  title: z.string().optional().describe('分组标题'),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe('组内字段的栅格列数，缺省 1'),
  collapsible: z.boolean().optional().describe('是否可折叠，缺省否')
})

/**
 * 表单只是结构：字段 + 校验 + 布局。
 * 标题、说明、提交按钮文案属于页面级展示文案，不在这里——导出的组件里那部分使用者必然自己重写。
 */
export const formSchema = z.object({
  groups: z.array(groupSchema).describe('空数组即不分组'),
  fields: z.array(fieldSchema).describe('扁平有序数组，name 唯一；分组只影响渲染，不嵌套数据')
})

export type FieldOption = z.infer<typeof optionSchema>
export type FieldValidation = z.infer<typeof validationSchema>
export type FieldCondition = z.infer<typeof conditionSchema>
export type FormField = z.infer<typeof fieldSchema>
export type FormGroup = z.infer<typeof groupSchema>
export type FormSchema = z.infer<typeof formSchema>

/** 表单结构的初始 / 复位值；派发器每次重算都基于它构造草稿 */
export function createFormSchema(): FormSchema {
  return {
    groups: [],
    fields: []
  }
}
