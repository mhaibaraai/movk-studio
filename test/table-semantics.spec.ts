import { describe, expect, it } from 'vitest'
import type { CellOptions, CellType, TableColumn, TableSchema } from '../shared/utils/table-schema'
import { CELL_TYPES, createTableSchema } from '../shared/utils/table-schema'
import { CELL_SPEC, dataColumnsOf, normalizeTable, renderCell, walkColumns } from '../shared/utils/table-semantics'

function schemaOf(columns: TableColumn[], options: Partial<TableSchema['options']> = {}): TableSchema {
  const base = createTableSchema()
  return { ...base, options: { ...base.options, ...options }, columns }
}

/**
 * 单元格的三视图必须同义。formatCode / propsCode 产出的是表达式源码，这里把它真跑起来与
 * format / props 对拍——「画布上看到的」与「导出代码渲染出的」一致性由此成为可执行断言。
 *
 * new Function 执行的是本仓库自己生成的源码，值来自下面的固定样本，不是外部输入。
 */
describe('CELL_SPEC：渲染与生成的代码同义', () => {
  // 覆盖空值、零值、假值、非法值——这些正是运行时与导出代码最容易各自漏判的地方
  const values: unknown[] = [
    null,
    undefined,
    '',
    0,
    1,
    false,
    true,
    'active',
    'offboarded',
    -12.345,
    1234567.891,
    '2026-07-14T08:30:00.000Z',
    'not-a-date',
    ['vue', 'ts'],
    []
  ]

  const optionsByType: Record<CellType, CellOptions[]> = {
    text: [{}, { labelMap: { active: '在职' } }],
    number: [{}, { decimals: 2 }],
    currency: [{}, { currency: '$', decimals: 2 }],
    percent: [{}, { decimals: 1 }],
    date: [{}, { dateFormat: 'datetime' }, { dateFormat: 'time' }],
    badge: [{}, { labelMap: { active: '在职' }, colorMap: { active: 'success', offboarded: 'error' } }],
    link: [{}, { hrefPrefix: 'mailto:' }],
    avatar: [{}],
    boolean: [{}, { trueLabel: '已通过', falseLabel: '未通过' }],
    progress: [{}, { max: 5 }],
    tags: [{}, { labelMap: { vue: 'Vue' }, colorMap: { vue: 'success' } }]
  }

  it.each(CELL_TYPES)('%s：文本', (type) => {
    const spec = CELL_SPEC[type]

    for (const options of optionsByType[type]) {
      const source = spec.formatCode(options)
      const run = new Function('value', `return ${source}`) as (value: unknown) => string

      for (const value of values) {
        expect(
          run(value),
          `type=${type} value=${JSON.stringify(value)} options=${JSON.stringify(options)} code=${source}`
        ).toBe(spec.format(value, options))
      }
    }
  })

  it.each(CELL_TYPES.filter(type => CELL_SPEC[type].propsCode))('%s：props', (type) => {
    const spec = CELL_SPEC[type]

    for (const options of optionsByType[type]) {
      const source = spec.propsCode!(options)
      const run = new Function('value', `return ${source}`) as (value: unknown) => Record<string, unknown>

      for (const value of values) {
        expect(
          run(value),
          `type=${type} value=${JSON.stringify(value)} code=${source}`
        ).toEqual(spec.props!(value, options))
      }
    }
  })

  it('boolean 的 false 显示成「否」，只有空值才是空', () => {
    expect(CELL_SPEC.boolean.format(false, {})).toBe('否')
    expect(CELL_SPEC.boolean.format(null, {})).toBe('')
  })

  it('非法日期与非数字不渲染成 NaN / Invalid Date', () => {
    expect(CELL_SPEC.date.format('not-a-date', {})).toBe('')
    expect(CELL_SPEC.number.format('not-a-number', {})).toBe('')
    expect(CELL_SPEC.currency.format(null, {})).toBe('')
  })

  it('renderCell 把 tags 拆成逐个标签的文案与颜色', () => {
    const render = renderCell(
      { type: 'tags', options: { labelMap: { vue: 'Vue' }, colorMap: { vue: 'success' } } },
      ['vue', 'go']
    )

    expect(render.kind).toBe('tags')
    expect(render.text).toBe('Vue、go')
    expect(render.tags).toEqual([
      { text: 'Vue', color: 'success' },
      { text: 'go', color: 'neutral' }
    ])
  })

  it('colorMap 未命中的值落回 neutral', () => {
    expect(renderCell({ type: 'badge', options: { colorMap: { active: 'success' } } }, 'unknown').props.color)
      .toBe('neutral')
  })
})

/** 非法组合只在这里剔除一次，编译、导出、摘要三处不会各自漏判 */
describe('normalizeTable：非法组合一处收敛', () => {
  const expand: TableColumn = { key: 'expand', type: 'expand' }
  const selection: TableColumn = { key: 'selection', type: 'selection', strategy: 'cascade' }

  it('非树形表格丢弃 expand 列与树形选择策略', () => {
    const { columns } = normalizeTable(schemaOf([selection, expand, { key: 'name', accessorKey: 'name' }]))

    expect(columns.map(column => column.key)).toEqual(['selection', 'name'])
    expect(columns[0]).not.toHaveProperty('strategy')
  })

  it('树形表格保留 expand 列与策略', () => {
    const { columns } = normalizeTable(schemaOf([selection, expand], { childrenKey: 'children' }))

    expect(columns.map(column => column.key)).toEqual(['selection', 'expand'])
    expect(columns[0]).toHaveProperty('strategy', 'cascade')
  })

  it('固定列缺宽度时补上预设——固定列要参与 sticky 偏移计算', () => {
    const { columns } = normalizeTable(schemaOf([
      { key: 'a', accessorKey: 'a', fixed: 'left' },
      { key: 'b', accessorKey: 'b', fixed: 'right', size: 200 },
      { key: 'c', accessorKey: 'c', fixed: 'right', minSize: 80 },
      { key: 'd', accessorKey: 'd' }
    ]))

    expect(columns.map(column => column.size)).toEqual(['md', 200, undefined, undefined])
  })

  it('重复 key 的列只保留第一个', () => {
    const { columns } = normalizeTable(schemaOf([
      { key: 'a', accessorKey: 'a', header: '先' },
      { key: 'a', accessorKey: 'a', header: '后' }
    ]))

    expect(columns).toHaveLength(1)
    expect(columns[0]).toHaveProperty('header', '先')
  })

  it('分组列里的非数据列被剔除，空分组整列丢弃', () => {
    const { columns } = normalizeTable(schemaOf([
      { key: 'g', header: '组', children: [{ key: 'x', accessorKey: 'x' }] },
      { key: 'empty', header: '空组', children: [{ key: 'y', type: 'index' } as never] }
    ]))

    expect(columns.map(column => column.key)).toEqual(['g'])
  })
})

describe('walkColumns / dataColumnsOf：分组表头就地展开', () => {
  const schema = schemaOf([
    { key: 'selection', type: 'selection' },
    { key: 'info', header: '员工信息', children: [{ key: 'name', accessorKey: 'name' }, { key: 'dept', accessorKey: 'dept' }] },
    { key: 'salary', accessorKey: 'salary' }
  ])

  it('分组列产出一个 group 节点，其余是 column 节点', () => {
    expect(walkColumns(schema).map(node => [node.kind, node.column.key]))
      .toEqual([['column', 'selection'], ['group', 'info'], ['column', 'salary']])
  })

  it('数据列清单展平到分组表头之下', () => {
    expect(dataColumnsOf(schema).map(column => column.accessorKey)).toEqual(['name', 'dept', 'salary'])
  })
})
