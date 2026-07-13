/**
 * form 工作区的画布状态：可序列化的表单结构，对应 map 的 MapWorkspaceState。
 *
 * AI 工具只能产出 JSON，而 <AutoForm> 吃的是带 meta 的活 z.ZodObject，
 * 故以本结构为唯一真源，由 app/utils/form-compiler.ts 编译成 ZodObject。
 * 服务端也读它——把当前表单摘要注入 system prompt（server/utils/form-context.ts）。
 */

/** 字段类型：每项绑定一组「afz 工厂方法 + 默认控件」，见 form-compiler 的 FIELD_CONTROL */
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

/** 需要 options 的字段类型 */
export const OPTION_FIELD_TYPES: FieldType[] = ['select', 'radio', 'pills']

export const CONDITION_OPS = ['eq', 'ne', 'in', 'notIn', 'gt', 'lt', 'truthy', 'falsy'] as const

export type ConditionOp = typeof CONDITION_OPS[number]

export interface FieldOption {
  /** 展示文案 */
  label: string
  /** 存入表单数据的值 */
  value: string
}

export interface FieldValidation {
  /**
   * 是否必填；false 时字段 schema 追加 .optional()
   * @defaultValue true
   */
  required?: boolean
  /** 文本类为最小长度，数值类为最小值 */
  min?: number
  /** 文本类为最大长度，数值类为最大值 */
  max?: number
  /** 正则源串（不含两侧斜杠）；非法或过长时该条校验被跳过 */
  pattern?: string
  /** 正则不匹配时的提示文案 */
  patternMessage?: string
  /** 数值必须为整数 */
  integer?: boolean
}

/**
 * 字段显示条件，声明式求值——绝不接受表达式字符串、绝不 eval。
 * truthy / falsy 不需要 value。
 */
export interface FieldCondition {
  /** 依赖字段的 name */
  field: string
  op: ConditionOp
  value?: string | number | boolean | (string | number)[]
}

export interface FormField {
  /** 唯一标识，同时是表单数据的键；所有字段类工具据此定位 */
  name: string
  type: FieldType
  label: string
  description?: string
  placeholder?: string
  /** 所属分组的 FormGroup.id；缺省或指向不存在的分组时渲染在顶层 */
  group?: string
  defaultValue?: unknown
  /** select / radio / pills 的选项 */
  options?: FieldOption[]
  validation?: FieldValidation
  condition?: FieldCondition
  /** 透传给控件的额外 props；on[A-Z] 开头的事件键会被编译器剔除 */
  controlProps?: Record<string, unknown>
}

export interface FormGroup {
  id: string
  title?: string
  /**
   * 组内字段的栅格列数
   * @defaultValue 1
   */
  columns?: 1 | 2 | 3
  /**
   * 是否可折叠
   * @defaultValue false
   */
  collapsible?: boolean
}

export interface FormSchema {
  title: string
  description?: string
  /**
   * 提交按钮文案
   * @defaultValue '提交'
   */
  submitText?: string
  /** 空数组即不分组 */
  groups: FormGroup[]
  /** 扁平有序数组，name 唯一；分组只影响渲染，不嵌套数据 */
  fields: FormField[]
}

/** 表单结构的初始 / 复位值；派发器每次重算都基于它构造草稿 */
export function createFormSchema(): FormSchema {
  return {
    title: '',
    description: undefined,
    submitText: undefined,
    groups: [],
    fields: []
  }
}
