/**
 * 代码导出的公共打印器，被表单（form-codegen）与表格（table-codegen）共用。
 *
 * 数据一律字面量化；需要原样输出的片段（条件表达式、渲染函数）包成 RawCode 绕过引号。
 */

interface RawCode {
  __raw: string
}

export function rawCode(code: string): RawCode {
  return { __raw: code }
}

function isRaw(value: unknown): value is RawCode {
  return typeof value === 'object' && value !== null && '__raw' in value
}

export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export function printCodeKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key)
}

export function printCodeValue(value: unknown, indent: string): string {
  if (isRaw(value)) return value.__raw
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const inner = `${indent}  `
    const items = value.map(item => `${inner}${printCodeValue(item, inner)}`)
    return `[\n${items.join(',\n')}\n${indent}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
    if (!entries.length) return '{}'
    const inner = `${indent}  `
    const props = entries.map(([key, item]) => `${inner}${printCodeKey(key)}: ${printCodeValue(item, inner)}`)
    return `{\n${props.join(',\n')}\n${indent}}`
  }

  return 'undefined'
}

/** 访问一条记录上某个字段的表达式源码 */
export function printAccess(root: string, field: string): string {
  return IDENTIFIER.test(field) ? `${root}.${field}` : `${root}[${JSON.stringify(field)}]`
}
