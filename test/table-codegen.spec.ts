import { format } from 'prettier'
import { describe, expect, it } from 'vitest'
import type { TableSchema } from '../shared/utils/table-schema'
import { generateTableCode } from '../app/utils/table-codegen'

/**
 * 导出的代码是要粘回用户项目里跑的。这里用 prettier 解析它——语法一旦不合法，
 * 解析就会抛，画布上看着好好的表格导出成一个跑不起来的组件这种事因此不会发生。
 */
const schema: TableSchema = {
  options: {
    rowKey: 'id',
    pagination: { pageSize: 10, pageSizes: [10, 20] },
    sortable: true,
    stripe: true,
    density: 'compact',
    emptyCell: '-'
  },
  columns: [
    { key: 'selection', type: 'selection', disabledWhen: { field: 'status', op: 'eq', value: 'offboarded' } },
    { key: 'index', type: 'index' },
    { key: 'id', accessorKey: 'id', header: '工号', fixed: 'left' },
    { key: 'name', accessorKey: 'name', header: '姓名', cell: { type: 'avatar' } },
    { key: 'email', accessorKey: 'email', header: '邮箱', cell: { type: 'link', options: { hrefPrefix: 'mailto:' } } },
    {
      key: 'status',
      accessorKey: 'status',
      header: '状态',
      cell: {
        type: 'badge',
        options: { labelMap: { active: '在职', offboarded: '离职' }, colorMap: { active: 'success', offboarded: 'error' } }
      }
    },
    { key: 'skills', accessorKey: 'skills', header: '技能', cell: { type: 'tags' } },
    { key: 'progress', accessorKey: 'progress', header: '完成率', cell: { type: 'progress' } },
    { key: 'salary', accessorKey: 'salary', header: '薪资', align: 'right', cell: { type: 'currency' } },
    { key: 'joinedAt', accessorKey: 'joinedAt', header: '入职日期', cell: { type: 'date' } },
    { key: 'remote', accessorKey: 'remote', header: '远程', cell: { type: 'boolean' } },
    { key: 'bio', accessorKey: 'bio', header: '简介', size: 200, tooltip: 1 },
    {
      key: 'rowActions',
      type: 'actions',
      fixed: 'right',
      maxInline: 2,
      actions: [
        { key: 'edit', icon: 'i-lucide-pencil', disabledWhen: { field: 'status', op: 'ne', value: 'active' } },
        {
          key: 'delete',
          label: '删除',
          icon: 'i-lucide-trash-2',
          color: 'error',
          confirm: { title: '确认删除？', description: '删除后无法恢复' },
          visibleWhen: { field: 'status', op: 'truthy' }
        }
      ]
    }
  ],
  rows: [
    { id: 'P001', name: '张三', email: 'zhang@example.com', status: 'active', skills: ['Vue', 'TS'], progress: 80, salary: 24000, joinedAt: '2024-03-01', remote: true, bio: '一段很长的自我介绍' },
    { id: 'P002', name: '李四', email: 'li@example.com', status: 'offboarded', skills: [], progress: 0, salary: null, joinedAt: '2023-08-15', remote: false, bio: '' }
  ]
}

describe('generateTableCode：导出的组件是合法的 Vue SFC', () => {
  it('全能力表格导出的源码能被解析', async () => {
    const code = generateTableCode(schema)

    await expect(format(code, { parser: 'vue' })).resolves.toBeTruthy()
  })

  /** 声明式的 cell 配置是画布状态，不是 MDataTable 认的东西——它必须被折成渲染函数才能进导出代码 */
  it('cell 折成渲染函数，而不是把声明式配置原样打出去', () => {
    const code = generateTableCode(schema)

    expect(code).toContain('({ getValue }) => {')
    expect(code).toContain('h(UBadge,')
    expect(code).toContain('"¥" + text')
    expect(code).not.toContain('cell: {\n')
  })

  it('只 import 真正用到的组件', async () => {
    const code = generateTableCode(schema)

    expect(code).toContain('import { UAvatar, UBadge, ULink, UProgress } from \'#components\'')
    expect(generateTableCode({ ...schema, columns: [{ key: 'id', accessorKey: 'id', header: '工号' }] }))
      .not.toContain('#components')
  })

  it('行类型由示例数据推断，而不是一律 unknown', () => {
    const code = generateTableCode(schema)

    expect(code).toContain('salary: number')
    expect(code).toContain('remote: boolean')
    expect(code).toContain('skills: string[]')
  })

  it('树形表格导出 children-key 与嵌套行类型', async () => {
    const tree: TableSchema = {
      ...schema,
      options: { ...schema.options, childrenKey: 'children' },
      rows: [{ id: 'P001', name: '张三', children: [{ id: 'P002', name: '李四' }] }]
    }

    const code = generateTableCode(tree)

    expect(code).toContain('children-key="children"')
    expect(code).toContain('children?: Row[]')
    await expect(format(code, { parser: 'vue' })).resolves.toBeTruthy()
  })
})
