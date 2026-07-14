# 数据工作区（MDataTable）落地参考

数据工作区把 AI 的工具调用变成右侧画布上一张活的 `MDataTable`：能排序、能勾选、能翻页、能点操作按钮，并实时给出一份可直接粘回项目的 Vue 单文件组件。

它与表单工作区同构，架构不变量也一样：**语义只在一处定义，同时给出三视图（怎么求值渲染 / 怎么生成代码 / 怎么说成人话），三者同义由对拍测试保证**。

## 文件地图

| 层 | 文件 | 职责 |
|---|---|---|
| 契约 | `shared/utils/table-schema.ts` | 画布状态的 zod 单一真源，类型全由 `z.infer` 派生 |
| 语义 | `shared/utils/table-semantics.ts` | `CELL_SPEC` 三视图、`normalizeTable`、`walkColumns`、`dataColumnsOf` |
| 条件 | `shared/utils/condition.ts` / `condition-semantics.ts` | 声明式条件算子，与表单工作区共用 |
| 工具 | `shared/utils/tools/data/` | 7 个工具契约 |
| MCP | `server/mcp/tools/data/` | 回显式 handler，**目录名即工作区归属** |
| 编译 | `app/utils/table-compiler.ts` | 声明式结构 → `MDataTable` 的 columns / data / props |
| 导出 | `app/utils/table-codegen.ts` | 声明式结构 → Vue SFC 源码 |
| 摘要 | `server/utils/table-context.ts` | 声明式结构 → 注入 prompt 的中文摘要 |
| 画布 | `app/pages/workspace/data.vue` | 预览 / 代码双页签 |
| 派发 | `app/utils/table-tool-applicators.ts`、`app/composables/useTable*.ts` | 工具输出 → 画布状态 |
| 测试 | `test/table-semantics.spec.ts`、`test/table-codegen.spec.ts` | 三视图对拍、导出代码可解析 |

## 类型分界线：哪些东西不能进画布状态

画布状态必须可序列化（要随每条消息回灌给模型、要能被消息重放重建），而 `MDataTable` 的表达力大量依赖函数式配置。两者的边界是这个工作区最主要的设计约束：

| MDataTable 的函数式配置 | 画布状态里的声明式替身 | 折回函数的位置 |
|---|---|---|
| `column.cell: (ctx) => VNode` | `cell: { type, options }`，`type` 取自 `CELL_TYPES` | compiler 用 `h()`；codegen 生成等价源码 |
| `action.onClick: (ctx) => void` | 无——行为不可序列化 | 画布上是 toast 演示；导出代码里是 `notify()` 占位 |
| `action.disabled / visibility: (ctx) => boolean` | `disabledWhen` / `visibleWhen`：声明式条件 | 两处都走 `CONDITION_OPS` |
| `action.confirmProps: (ctx) => {...}` | `confirm: { title, description, type, confirmText }` | 静态对象，两处直通 |
| `selection.checkboxProps: (ctx) => {...}` | `disabledWhen` | compiler 折成 `checkboxProps`，按 `scope` 区分表头/单元格 |
| `sortable / truncate / tooltip` 的函数形态 | 只支持布尔与数字形态 | 直通 |

**绝不 eval AI 产出的字符串**。条件一律是「某字段 + 比较方式 + 比较值」的结构，求值走 `CONDITION_OPS[op].test`，导出走 `CONDITION_OPS[op].code`。

## CELL_SPEC 的三视图

每种单元格类型给出四件事：

```ts
interface CellTypeSpec {
  label: string                                          // prompt 摘要里的说法
  render: 'text' | 'badge' | 'link' | 'avatar' | 'progress' | 'tags'
  format: (value, options) => string                     // 运行时的文本内容
  formatCode: (options) => string                        // 与 format 同义的表达式源码，自由变量为 value
  props?: (value, options) => Record<string, unknown>    // 渲染组件的额外 props
  propsCode?: (options) => string                        // 与 props 同义的表达式源码
}
```

`test/table-semantics.spec.ts` 用 `new Function` 真跑 `formatCode` / `propsCode` 生成的源码，与 `format` / `props` 逐样本对拍——「画布上看到的」与「导出代码渲染出的」因此是可执行断言，而不是一句注释。

生成的 cell 函数是**自包含表达式**（日期格式化是内联 IIFE，不调用任何 helper）：导出的组件粘回项目即可用，不需要一并带走本仓库的工具函数。

### 踩过的坑

- **空值不能落成 0**：`Number(null)` 与 `Number('')` 都是 `0`，早期版本把空的金额单元格渲染成 `¥0` 而不是交给 `emptyCell`。修在 `formatNumber` / `numberCode` 一处，三视图同时生效。对拍测试只保证三视图彼此同义，不保证语义正确——空值这类断言要单独写。
- **`boolean` 的 `false` 要显示成「否」**：只有 `null` / `undefined` / `''` 才算没有值。
- **数据列曾走进兜底分支**：`printColumns` 里 `isDataColumn` 的判断漏在最后，声明式的 `cell` 配置被原样打进导出代码（语法合法，但 `MDataTable` 不认）。prettier 的解析测试抓不到这类错，`test/table-codegen.spec.ts` 里专门断言了 `cell` 必须是 `({ getValue }) => {` 开头的渲染函数。

## normalizeTable：非法组合的唯一收敛处

AI 会产出不自洽的结构。这些一律在 `normalizeTable` 里剔除一次，不让 compiler / codegen / context 各自漏判：

- 非树形表格（没有 `childrenKey`）丢弃 `expand` 列与 `selection.strategy`
- 重复 `key` 的列只保留第一个
- `fixed` 列缺 `size` 与 `minSize` 时补 `size: 'md'`——固定列要参与 sticky 偏移计算，必须有确定宽度
- 分组列里的非数据列被剔除，空分组整列丢弃

## MDataTable 的列宽规则（来自组件文档）

- 表格是 `table-layout: auto` 并撑满容器，自适应列的内容宽度可能超过 `maxSize`。对自适应列，`maxSize` **只约束拖拽上限**；要严格固定列宽必须用 `size`。
- 固定列默认按 `size` 定宽。仅当某一侧只有一个固定列时，它才支持按内容自适应（设 `minSize` / `maxSize`）——典型如右侧唯一的操作列。
- 列级 prop 的优先级始终高于全局 prop。

## 列的定位：key

每一列都有唯一的 `key`，数据列的 `key` 与 `accessorKey` 一致，特殊列的 `key` 由 AI 自取（如 `selection`、`rowActions`）。`upsert-column` / `remove-column` / `reorder-columns` 全靠它定位——与表单工作区靠字段 `name` 定位同构。

当前表格的完整列清单由 `summarizeTable` 注入 system prompt，模型据此做增量修改，不必把归约算法在脑子里重跑一遍。

## 上下文注入的取舍

`useWorkspaceContext` 的 `data` 分支**不回灌行数据**，只给列结构、行数与当前勾选的行：示例数据可能很长，而模型做增量修改时需要的是结构。要改数据本身，让它重新 `generate-table`。

## 新增一个工具要动哪几处

1. `shared/utils/tools/data/` 里加契约
2. `server/mcp/tools/data/<name>.ts` 加回显 handler
3. `app/utils/table-tool-applicators.ts` 里加 reduce 或 effect
4. `server/utils/chat-prompts.ts` 的 `WORKSPACE_BRIEF.data` 补进工具清单
5. **重启 dev server**——工具是构建期扫目录的虚拟模块
