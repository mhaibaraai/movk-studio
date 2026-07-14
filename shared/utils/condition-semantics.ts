import type { Condition, ConditionOp } from './condition'

export interface ConditionOpSpec {
  /** prompt 摘要里的说法 */
  label: string
  /** truthy / falsy 不吃比较值 */
  needsValue: boolean
  /** 运行时求值：画布预览里字段是否显示、行内动作是否可用 */
  test: (actual: unknown, value: unknown) => boolean
  /** 生成等价的 TS 表达式源码：path 是被依赖字段的访问表达式，value 会在这里字面量化 */
  code: (path: string, value: unknown) => string
}

/**
 * 声明式条件的八个算子。绝不 eval AI 产出的字符串——求值一律走 test。
 *
 * gt / lt 统一按 JS 的数值强制转换比较（Number(x) > 3）：运行时与导出代码因此对任意输入都同义。
 */
export const CONDITION_OPS: Record<ConditionOp, ConditionOpSpec> = {
  eq: {
    label: '等于',
    needsValue: true,
    test: (actual, value) => actual === value,
    code: (path, value) => `${path} === ${JSON.stringify(value)}`
  },
  ne: {
    label: '不等于',
    needsValue: true,
    test: (actual, value) => actual !== value,
    code: (path, value) => `${path} !== ${JSON.stringify(value)}`
  },
  in: {
    label: '属于',
    needsValue: true,
    test: (actual, value) => Array.isArray(value) && value.some(item => item === actual),
    // 比较值该是数组却不是时，生成 false 而不是一段会在用户项目里抛异常的 .some 调用
    code: (path, value) => (Array.isArray(value)
      ? `${JSON.stringify(value)}.some(item => item === ${path})`
      : 'false')
  },
  notIn: {
    label: '不属于',
    needsValue: true,
    test: (actual, value) => Array.isArray(value) && !value.some(item => item === actual),
    code: (path, value) => (Array.isArray(value)
      ? `!${JSON.stringify(value)}.some(item => item === ${path})`
      : 'false')
  },
  gt: {
    label: '大于',
    needsValue: true,
    test: (actual, value) => Number(actual) > Number(value),
    code: (path, value) => `Number(${path}) > ${JSON.stringify(value)}`
  },
  lt: {
    label: '小于',
    needsValue: true,
    test: (actual, value) => Number(actual) < Number(value),
    code: (path, value) => `Number(${path}) < ${JSON.stringify(value)}`
  },
  truthy: {
    label: '有值',
    needsValue: false,
    test: actual => Boolean(actual),
    code: path => `Boolean(${path})`
  },
  falsy: {
    label: '无值',
    needsValue: false,
    test: actual => !actual,
    code: path => `!${path}`
  }
}

/** 对一条数据记录（表单已填值 / 表格行）求值 */
export function evalCondition(condition: Condition, state: Record<string, unknown>): boolean {
  return CONDITION_OPS[condition.op].test(state[condition.field], condition.value)
}
