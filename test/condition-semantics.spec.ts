import { describe, expect, it } from 'vitest'
import type { ConditionOp } from '../shared/utils/condition'
import { CONDITION_OP_NAMES } from '../shared/utils/condition'
import { CONDITION_OPS } from '../shared/utils/condition-semantics'

/**
 * 条件算子的三视图必须同义。code 产出的是表达式源码，这里把它真跑起来与 test 对拍——
 * 「画布预览」与「导出代码」的一致性由此成为可执行断言，而不是一句注释。
 *
 * new Function 执行的是本仓库 code() 自己生成的源码（比较值来自下面的固定样本，不是外部输入）。
 * 运行时求值走 test()，永不 eval——见 condition-semantics 的 evalCondition。
 */
describe('CONDITION_OPS：求值与生成的代码同义', () => {
  const actuals: unknown[] = [true, false, '', 'a', 'abc', 0, 1, 3, 5, null, undefined, ['a']]

  const valuesByOp: Record<ConditionOp, unknown[]> = {
    eq: ['abc', 3, true, ''],
    ne: ['abc', 3, true, ''],
    in: [['a', 'abc'], [1, 3], []],
    notIn: [['a', 'abc'], [1, 3], []],
    gt: [3, 0, '3'],
    lt: [3, 0, '3'],
    truthy: [undefined],
    falsy: [undefined]
  }

  it.each(CONDITION_OP_NAMES)('%s', (op) => {
    const spec = CONDITION_OPS[op]

    for (const value of valuesByOp[op]) {
      const source = spec.code('actual', value)
      const run = new Function('actual', `return ${source}`) as (actual: unknown) => boolean

      for (const actual of actuals) {
        expect(
          Boolean(run(actual)),
          `op=${op} actual=${JSON.stringify(actual)} value=${JSON.stringify(value)} code=${source}`
        ).toBe(spec.test(actual, value))
      }
    }
  })

  it('每个算子都声明了是否需要比较值', () => {
    expect(CONDITION_OPS.truthy.needsValue).toBe(false)
    expect(CONDITION_OPS.falsy.needsValue).toBe(false)
    expect(CONDITION_OPS.eq.needsValue).toBe(true)
  })

  it('in / notIn 拿到非数组比较值时不生成会抛异常的代码', () => {
    const source = CONDITION_OPS.in.code('actual', 'not-an-array')
    const run = new Function('actual', `return ${source}`) as (actual: unknown) => boolean

    expect(run('not-an-array')).toBe(false)
    expect(CONDITION_OPS.in.test('not-an-array', 'not-an-array')).toBe(false)
  })
})
