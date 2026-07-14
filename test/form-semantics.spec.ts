import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { FieldType, FieldValidation, FormField, FormGroup, FormSchema } from '../shared/utils/form-schema'
import { createFormSchema } from '../shared/utils/form-schema'
import { activeRules, walkForm } from '../shared/utils/form-semantics'

function fieldOf(name: string, patch: Partial<FormField> = {}): FormField {
  return { name, type: 'text', label: name, ...patch }
}

function schemaOf(fields: FormField[], groups: FormGroup[] = []): FormSchema {
  return { ...createFormSchema(), groups, fields }
}

/**
 * 校验规则的三视图：apply 套到 zod 上、code 落进导出的源码、label 进 prompt 摘要。
 * 前两者的报错文案必须是同一句，否则用户在画布上看到的提示与导出代码里的对不上。
 */
describe('activeRules：运行时校验与生成的代码同义', () => {
  const cases: Array<{ type: FieldType, validation: FieldValidation, bad: unknown, base: z.ZodType }> = [
    { type: 'text', validation: { min: 3 }, bad: 'ab', base: z.string() },
    { type: 'text', validation: { max: 2 }, bad: 'abcd', base: z.string() },
    { type: 'text', validation: { pattern: '^a+$' }, bad: 'b', base: z.string() },
    { type: 'text', validation: { pattern: '^a+$', patternMessage: '只能填 a' }, bad: 'b', base: z.string() },
    { type: 'number', validation: { min: 3 }, bad: 2, base: z.number() },
    { type: 'number', validation: { max: 2 }, bad: 5, base: z.number() },
    { type: 'number', validation: { integer: true }, bad: 1.5, base: z.number() }
  ]

  it.each(cases)('$type $validation', ({ type, validation, bad, base }) => {
    const rules = activeRules(type, validation)
    expect(rules).toHaveLength(1)

    const schema = rules.reduce<z.ZodType>((acc, rule) => rule.apply(acc), base)
    const result = schema.safeParse(bad)
    expect(result.success).toBe(false)

    const message = result.error!.issues[0]!.message
    expect(rules[0]!.code).toContain(JSON.stringify(message))
    expect(rules[0]!.label).toBeTruthy()
  })

  it('自定义正则文案同时进入运行时与导出代码', () => {
    const [rule] = activeRules('text', { pattern: '^a+$', patternMessage: '只能填 a' })
    const result = rule!.apply(z.string()).safeParse('b')

    expect(result.success).toBe(false)
    expect(result.error!.issues[0]!.message).toBe('只能填 a')
    expect(rule!.code).toContain('只能填 a')
  })

  it('非法或过长的正则整条跳过，预览与导出都不带它', () => {
    expect(activeRules('text', { pattern: '(' })).toHaveLength(0)
    expect(activeRules('text', { pattern: 'a'.repeat(201) })).toHaveLength(0)
  })

  it('规则按字段类型的族筛选：文本字段不吃 integer，数值字段不吃 pattern', () => {
    expect(activeRules('text', { integer: true })).toHaveLength(0)
    expect(activeRules('number', { pattern: '^1$' })).toHaveLength(0)
  })

  it('文本类的 min 是长度，数值类的 min 是大小', () => {
    expect(activeRules('text', { min: 2 })[0]!.label).toContain('字符')
    expect(activeRules('number', { min: 2 })[0]!.label).not.toContain('字符')
  })

  it('required 不是链式规则，不出现在 activeRules 里', () => {
    expect(activeRules('text', { required: false })).toHaveLength(0)
  })

  it('无校验规则时为空', () => {
    expect(activeRules('text', undefined)).toHaveLength(0)
  })
})

/** 编译、导出、prompt 摘要三处的分组展开顺序由这一个遍历决定 */
describe('walkForm：分组就地展开', () => {
  const groups: FormGroup[] = [
    { id: 'basic', title: '基本信息' },
    { id: 'contact', title: '联系方式' }
  ]

  it('无分组时逐个字段落在顶层', () => {
    const nodes = walkForm(schemaOf([fieldOf('a'), fieldOf('b')]))

    expect(nodes).toEqual([
      { kind: 'field', field: fieldOf('a') },
      { kind: 'field', field: fieldOf('b') }
    ])
  })

  it('分组字段交错时，整组在首次出现处就地展开，组内保持扁平顺序', () => {
    const nodes = walkForm(schemaOf(
      [fieldOf('a', { group: 'basic' }), fieldOf('b'), fieldOf('c', { group: 'basic' })],
      groups
    ))

    expect(nodes).toEqual([
      {
        kind: 'group',
        group: groups[0],
        fields: [fieldOf('a', { group: 'basic' }), fieldOf('c', { group: 'basic' })]
      },
      { kind: 'field', field: fieldOf('b') }
    ])
  })

  it('指向不存在分组的字段落回顶层', () => {
    const nodes = walkForm(schemaOf([fieldOf('a', { group: 'ghost' })], groups))

    expect(nodes).toEqual([{ kind: 'field', field: fieldOf('a', { group: 'ghost' }) }])
  })

  it('没有任何字段的分组不产出节点', () => {
    const nodes = walkForm(schemaOf([fieldOf('a', { group: 'basic' })], groups))

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ kind: 'group', group: groups[0] })
  })

  it('多个分组按各自首次出现的顺序排列', () => {
    const nodes = walkForm(schemaOf(
      [fieldOf('a', { group: 'contact' }), fieldOf('b', { group: 'basic' })],
      groups
    ))

    expect(nodes.map(node => (node.kind === 'group' ? node.group.id : node.field.name)))
      .toEqual(['contact', 'basic'])
  })
})
