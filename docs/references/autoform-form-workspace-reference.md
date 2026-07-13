# AI 表单构建器参考资料：@movk/nuxt AutoForm 落地 form 工作区

> 面向 movk-studio「form 工作区」的实现参考。整理 form 与 map 的同构关系、`@movk/nuxt` AutoForm 真实可调用接口清单、`FormSchema` 契约与编译器设计，以及 12 个 form 工具的落地结果。当前形态：契约（`shared/utils/tools/form/`）+ handler（`server/mcp/tools/`）+ applicator（`app/utils/form-tool-applicators.ts`）三层，与 map 共用同一套泛化后的工具层与派发器（`shared/utils/tools/` + `useToolDispatch`）。
>
> **状态**：12 个工具已全部落地并端到端验证。第 9 节记录实现中踩到的真实坑。

## 1. 背景

form 工作区此前是 `<Placeholder />` 空壳。`Workspace` 类型（[shared/utils/workspace.ts](../../shared/utils/workspace.ts)）、DB 的 `chats.workspace` enum、layout 的工作区导航、`WORKSPACE_BRIEF` 与 `QUICK_CHATS` 的分发都已为 `form` 留好位置，但里面要么是空壳，要么是一句话占位。

本资料回答四个问题：

1. form 工作区到底做什么？——**AI 表单构建器**，见 2.1。
2. `@movk/nuxt` 的 AutoForm 真实支持哪些能被 AI 驱动的操作？——见 3。
3. AI 只能吐 JSON，而 AutoForm 吃的是**活的 Zod 对象**，这中间怎么接？——见 4.1、4.2。
4. map 的工具层是 map 命名的，form 该复用还是另起？——**先泛化再建**，见 2.4。

与 map 的关系是**同构**而非并列：map 建立在 `@movk/mapbox` 之上，form 建立在 `@movk/nuxt` 的 AutoForm 之上；map 的画布状态是 `MapWorkspaceState`，form 的是 `FormSchema`；map 有 `drawnFeatures` 这个「用户交互产物」独立层，form 有「用户填写值」。凡是 [mcp-toolkit-map-tools-reference.md](./mcp-toolkit-map-tools-reference.md) 已论证过的结论（工具调用本质是 RPC 描述符、副作用必须由客户端派发器触发、状态必须是消息的纯归约），本文不再重复论证，只标注 form 侧的差异。

## 2. 四个已确认决策

### 2.1 核心定位：AI 表单构建器

Copilot 调用工具增删改字段、配置控件与校验规则、分组布局、设置条件联动；右侧画布用 `<AutoForm>` 实时渲染成一个**可真实填写、可提交校验**的活表单；用户可导出 `afz` 写法的 TypeScript 代码带走。

被否掉的两个方向：

- **表单构建 + 数据收集**（发布表单、公开填写页、提交落库、结果查看）：范围显著更大，需新增 `forms` / `form_submissions` 表、公开路由与权限模型。首版不做，但本设计不阻断它——`FormSchema` 本身就是可序列化的，将来落库即可。
- **表单模板检索库**：Copilot 只从预置模板里检索推荐、不做字段级操作。实现最轻，但 AI 可操作性弱，与 map 的「AI 操作画布」范式不同构，放弃。

### 2.2 画布交互模型：结构 AI 独占 + 表单可真实填写

这是本次最难改的决策，因为它决定状态架构。

| 层 | 内容 | 归属 | 类比 map |
| --- | --- | --- | --- |
| `FormSchema` | 表单**结构**（字段、校验、布局、条件） | 只有 AI 工具能改 | `MapWorkspaceState` |
| `formValues` | 用户**填写的值** | 只有用户能改 | `drawnFeatures` |

`FormSchema` 严格保持「消息的纯归约」——切换会话 / 编辑 / 重生成 / 删除消息全部自动收敛，这是 map 架构的精髓（见 map 文档 7.4：命令式累加改纯归约的那次重构）。用户填写的值是**交互产物、不是任何工具输出的函数**，塞进归约状态会在下一条消息到达时被重算清空，故与 `drawnFeatures` 一样单列一个 `useState`。

被否掉的方向：

- **AI + 手工双向编辑结构**（画布上拖拽排序、点选删除、侧边属性面板）：体验更像传统低代码设计器，但必须打破纯归约模型，额外设计一个 overrides 覆盖层与冲突收敛规则，且要回答一串没有好答案的问题——用户手工删了字段、AI 重生成消息后它会复活吗？切换会话时 overrides 归属谁？AI 改了一个用户手工改过的字段，谁赢？复杂度与 bug 面显著上升，收益是「少说一句话」。放弃。用户想改结构就说话，这本来就是 Copilot 产品的前提。
- **纯只读预览**：用户无法验证填写体验与校验规则是否合理，AI 也拿不到「填写态」上下文，工作区价值偏弱。放弃。

**附带收益**：表单结构随会话消息天然持久化（消息本来就落库），**不需要新建任何 DB 表**。

### 2.3 首版能力范围

核心（定义性的，不讨论）：整表生成、字段增删改、校验规则、控件与选项切换。

外加三项：

- **布局分组**——没它的话长表单就是一长条，实际不可用。
- **条件联动**——「真实业务表单」与「玩具 demo」的分水岭，也是 AI 能力的亮点。
- **代码导出**——工作区的「带走产物」，对应 map 的 `export-image`。

后置：`fill-sample-data`（AI 主动写入示例值）。注意填写值**注入 prompt** 这件事本身由 2.2 的画布模型决定，已在首版内；后置的只是「主动写值」这个工具。

### 2.4 重构策略：先泛化再建 form

现有工具层是 map 命名的（`MAP_TOOLS` / `getMapTool` / `MapToolContract` / `MapToolApplicator` / `useMapToolDispatch`），但 `MapToolContract` 的 7 个字段与派发算法**无一处与地图耦合**——`workspaces: Workspace[]` 本来就是数组，语义上早已支持多工作区。

被否掉的两个方向：

- **平行造一套 `form-tools`**：`getToolsForWorkspace` 与 `MessageContent.vue` 要同时查两个注册表；更要命的是派发算法（纯归约 + fire-once + 签名节流 + error 守卫）要复制一份——而这恰好是 map 文档第 7 节里踩坑最多、最容易静默出错的那部分。复制它等于复制 bug。data 工作区时还要再复制第三份。
- **只泛化契约层**：省了泛型设计的推敲成本，但仍然把最难的那部分复制了一遍。

故：契约层泛化为 `shared/utils/tools/`（`ToolContract` / `TOOLS` / `getTool`），派发器泛型化为 `useToolDispatch<TState, TCtx>`，map 与 form 各留一个薄封装。之后 data 工作区零成本接入。

## 3. `@movk/nuxt` AutoForm 真实可调用接口清单

这一节决定了 form 工具能不能真正落地。以下全部核对自本地已安装的 `@movk/nuxt`（`node_modules/@movk/nuxt/dist/runtime/`）的类型声明与编译产物，不是文档推断。

### 3.1 入口：`useAutoForm()` 与 `<AutoForm>`

```ts
useAutoForm() // → { afz, defineControl, DEFAULT_CONTROLS, controls, getAutoFormMetadata }
useAutoForm(customControls) // 传入自定义 controls 扩展/覆盖默认控件映射，afz 的类型随之收窄
```

```ts
interface AutoFormProps<S extends z.ZodObject> {
  schema: S                    // 必填：Zod 对象 schema，定义表单字段
  state?: FormProps['state']   // 表单状态对象（填写的值）
  controls?: AutoFormControls  // 自定义控件映射
  globalMeta?: ZodAutoFormFieldMeta
  submit?: boolean             // 是否显示默认提交按钮，缺省 true
  submitButtonProps?: ButtonProps
  addButtonProps?: ButtonProps // 数组字段的添加按钮
  validateOn?: FormProps['validateOn'] // 缺省 []
  loadingAuto?: boolean        // 缺省 true
}
```

**关键约束**：`schema` 收的是**活的 `z.ZodObject`**，不是 JSON。这是整个 form 工作区架构的起点——AI 只能产出 JSON，故必须有一层「可序列化 schema → ZodObject」的编译器（见 4.2）。这与 map 的处境同构：map 是「没有命令式 `addLayer`，必须写共享状态 + 声明式渲染」，form 是「没有 JSON schema 入口，必须编译成 Zod」。**两者都不是设计偏好，是唯一可行路径。**

### 3.2 `afz` 工厂方法（`TypedZodFactory`）

```text
string  number  boolean  file  email  url  uuid  enum
calendarDate  inputDate  inputTime  isoDatetime  isoDate  isoTime
array  tuple  layout
object  looseObject  strictObject
```

每个方法的最后一个参数是 **meta**（`{ type?, component?, controlProps?, controlSlots?, ...ZodAutoFormFieldMeta }`），返回的仍是对应的 Zod 类型，可继续链式调用 `.min()` / `.regex()` / `.optional()` 等。

```ts
const schema = afz.object({
  name: afz.string({ label: '姓名' }).min(2),
  bio: afz.string({ type: 'textarea', label: '简介' }).optional(),
  gender: afz.enum(['男', '女'], { type: 'radioGroup', label: '性别' })
})
```

### 3.3 内置控件（`DEFAULT_CONTROLS`，28 个）

```text
string  number  boolean  enum  file  calendarDate  inputDate  inputTime
withClear  withPasswordToggle  withCopy  withCharacterLimit  withFloatingLabel
asPhoneNumberInput  textarea  switch  slider  selectMenu  inputMenu
checkboxGroup  radioGroup  inputTags  pinInput  listbox
starRating  colorChooser  slideVerify  pillGroup
```

meta 里的 `type` 取值就是这张表的 key。`component` 是另一条路（直接给 Vue 组件），与 `type` 互斥。

**有意不把这 28 个控件 × 19 个工厂方法直接暴露给 AI**：LLM 靠 description 选参数，把两个正交维度的完整笛卡尔积抛给它会显著降低准确率——这与 map 文档 8 节里「包的 `search()` 有 5 种未暴露的 queryType，有意不暴露」是同一条经验。故策展出一个约 20 项的 `FieldType` 枚举，每项绑定一组 (工厂方法, 默认控件)，见 4.1。`controlProps` 作为逃生舱保留。

### 3.4 字段 meta（`ZodAutoFormFieldMeta`）

```ts
interface ZodAutoFormFieldMeta {
  label?  description?  help?  hint?  error?  size?  orientation?
  required?      // 缺省 true
  if?            // 显示条件
  hidden?
  collapsible?   // 对象字段折叠配置
  class?  ui?  as?  name?  errorPattern?
  eagerValidation?  validateOnInputDelay?  fieldSlots?
}
```

每个值的类型都是 `ReactiveValue<T, AutoFormFieldContext>`——**既可以是字面量，也可以是一个接收字段上下文的函数**。这正是条件联动的落点：

```ts
interface AutoFormFieldContext {
  readonly state: S       // 整个表单的当前值
  readonly path: string
  readonly value: unknown
  setValue: (...)
  readonly errors: unknown[]
  readonly loading: boolean
}
```

所以 `if: ctx => ctx.state.hasCar === true` 可行。**但绝不能让 AI 直接产出这个函数体字符串再 eval**，见 6.2。

> **`required` 是自动推导的，不要手写 meta**。`domains/auto-form/schema.js:48` 是 `required: !decorators.isOptional`——它从 zod 的 `.optional()` 装饰链反推。编译器只需决定是否链 `.optional()`，必填星号自动出现。

### 3.4.1 meta 的类型分界线（写代码生成器时必须遵守）

运行时 `afz.string(meta)` 就是 `z.string().meta(meta)`，什么键都收。但**类型上不是**：

| 键 | 归属 | 怎么传 |
| --- | --- | --- |
| `type` / `component` / `controlProps` / `controlSlots` / `error` | `AutoFormControlsMeta` | afz 工厂的入参 |
| `label` / `description` / `if` / `hidden` / `hint` / `size` … | `ZodAutoFormFieldMeta`（注册为 zod 的 `GlobalMeta`） | 链式 `.meta()` |

`afz.string({ label: '姓名' })` 运行时能跑，**typecheck 报 TS2769**（`label` 不在 `AutoFormControlsMeta` 里，对象字面量的多余属性检查直接拒绝）。

这对画布无影响（编译器在类型边界处收口成 `never`，见 4.2），但对**导出的代码**是硬约束——那份代码是要粘回项目、跟着项目一起 typecheck 的。故 codegen 必须拆两处写：

```ts
phone: afz.string({ type: 'asPhoneNumberInput', controlProps: { placeholder: '请输入手机号' } })
  .regex(/^1[3-9]\d{9}$/, '请输入正确的手机号')
  .meta({ label: '手机号' })
```

校验链放在 `.meta()` 之前不影响合并：`getAutoFormMetadata` 沿 `_zod.parent` 回溯并 `Object.assign` 合并全链路的 meta（已用真实 zod 实例验证，两段 meta 最终并成一份）。

### 3.5 布局（`afz.layout` 与 `AutoFormLayoutConfig`）

```ts
interface AutoFormLayoutConfig<C> {
  component?: C                        // 分组容器组件
  props?: ReactiveValue<ComponentProps<C>, AutoFormFieldContext>
  class?: ReactiveValue<ClassNameValue, AutoFormFieldContext>
  slots?: ...
  fields: Record<string, z.ZodType>    // 组内字段
  fieldSlot?  fieldSlots?
}
```

**关键性质**：`afz.layout()` 返回的是 `LayoutFieldMarker`，类型层的 `ExtractLayoutShape` 会把它**展平回顶层 shape**。也就是说——

> **布局分组只影响渲染，不嵌套数据。** 表单的 `state` 始终是扁平的 `{ name, phone, ... }`，不会因为分组变成 `{ basic: { name }, contact: { phone } }`。

这直接决定了 `FormSchema` 该设计成扁平字段数组而非嵌套树，见 4.1。

### 3.6 其它常量

```ts
AUTOFORM_META     = { KEY: '__autoform_meta__', LAYOUT_KEY: '__autoform_layout__' }
AUTOFORM_LIMITS   = { MAX_RECURSION_DEPTH: 20, MAX_ARRAY_LENGTH: 500, MAX_OBJECT_PROPERTIES: 200 }
AUTOFORM_PATTERNS = { EVENT_PROP: /^on[A-Z]/ }
```

`MAX_OBJECT_PROPERTIES: 200` 是字段数的天然上界；`EVENT_PROP` 说明包侧自己也在防事件属性注入，我们在编译器里同样要防（见 6.3）。

## 4. 关键设计

### 4.1 `FormSchema`：可序列化、扁平字段 + 分组引用

form 的画布状态，对应 map 的 `MapWorkspaceState`。放在 `shared/utils/form-schema.ts`——服务端拼 system prompt 也要用（见 4.4）。

```ts
export interface FormSchema {
  title: string
  description?: string
  submitText?: string
  groups: FormGroup[]        // 空数组 = 不分组
  fields: FormField[]        // 扁平有序数组，name 唯一
}

export interface FormGroup {
  id: string
  title?: string
  columns?: 1 | 2 | 3
  collapsible?: boolean
}

export interface FormField {
  name: string               // 唯一标识 + 表单数据键；所有工具据此定位
  type: FieldType
  label: string
  description?: string
  placeholder?: string
  group?: string             // FormGroup.id
  defaultValue?: unknown
  options?: FieldOption[]    // enum 类字段
  validation?: FieldValidation
  condition?: FieldCondition
  controlProps?: Record<string, unknown>  // 逃生舱
}
```

**为什么扁平而非嵌套**：3.5 已证明分组不嵌套数据。扁平数组让 `add-field` / `update-field` / `remove-field` / `reorder-fields` 全部按 `name` 一把定位，工具语义最简单，LLM 也最容易命中。嵌套树会逼工具接受路径参数（`groups[0].fields[2]`），既脆弱又难让 LLM 写对。分组由编译器在组装 afz shape 时还原。

**`FieldType`**（策展枚举，每项绑定一组「工厂方法 + 默认控件」）：

| FieldType | afz 工厂 | 控件 |
| --- | --- | --- |
| `text` | `string` | 默认 |
| `textarea` | `string` | `textarea` |
| `password` | `string` | `withPasswordToggle` |
| `email` / `url` | `email` / `url` | 默认 |
| `phone` | `string` | `asPhoneNumberInput` |
| `number` | `number` | 默认 |
| `slider` | `number` | `slider` |
| `rating` | `number` | `starRating` |
| `switch` | `boolean` | `switch` |
| `checkbox` | `boolean` | 默认 |
| `select` / `radio` / `pills` | `enum` | `selectMenu` / `radioGroup` / `pillGroup` |
| `tags` | `array(string)` | `inputTags` |
| `date` / `time` | `calendarDate` / `inputTime` | 默认 |
| `file` | `file` | 默认 |
| `color` | `string` | `colorChooser` |
| `pin` | `string` | `pinInput` |

**`FieldValidation`**（可序列化）：`required` / `min` / `max` / `pattern`（正则源串）/ `patternMessage` / `integer`。

**`FieldCondition`**（声明式，绝不 eval）：

```ts
interface FieldCondition {
  field: string   // 依赖字段的 name
  op: 'eq' | 'ne' | 'in' | 'notIn' | 'gt' | 'lt' | 'truthy' | 'falsy'
  value?: unknown
}
```

编译器把它变成 `meta.if = ctx => evalCondition(cond, ctx.state)`，`evalCondition` 是本地纯函数。

### 4.2 编译器与代码生成（两个纯函数）

- [app/utils/form-compiler.ts](../../app/utils/form-compiler.ts) —— `compileFormSchema(schema, afz): z.ZodObject`。按 `groups` 把字段装进 `afz.layout({ component: FormGroup, props: { title, collapsible, columns }, fields })`，无分组字段直接进顶层 shape。

  控件 key 与 `controlProps` 全部来自运行时 JSON，与 afz 按控件 key 静态收窄的重载对不上号，故整个编译器**只在 `fieldMeta()` 一处收口成 `never`**，其余保持类型安全。

- [app/utils/form-codegen.ts](../../app/utils/form-codegen.ts) —— `generateFormCode(schema): string`，产出**完整的 Vue 单文件组件**：`<script setup>` 里是 afz schema、`z.output` 推导的表单类型与 `onSubmit`，`<template>` 里是标题与 `<MAutoForm>`。经 `$prettier` 格式化（`parser: 'vue'`）后展示在代码页签，`export-form-code` 下载同一份产物。

**两者共用 `FIELD_SPEC` / `fieldControlProps` / `RULE_MESSAGE` / `compileRegExp`**（都从 form-compiler 导出）。各写一套的话，导出的代码会与画布上的预览悄悄漂移——正是 map 文档 4.1 记的「一个工具摊在四张表里，漏改一处不报错只静默失效」的同类反模式。

导出代码的一处已知损耗：分组只保留栅格 `class`，丢掉标题与折叠（那需要一个容器组件，导出到别的项目里没有）。codegen 会在分组上方留注释说明。

### 4.3 状态：两层，同构于 map

```ts
// app/composables/useFormWorkspace.ts
useState<FormSchema>('form-workspace', createFormSchema)      // 结构：消息纯归约，AI 独占
useState<Record<string, unknown>>('form-values', () => ({}))  // 填写值：用户交互产物
```

### 4.4 上下文注入通道泛化

[CopilotPanel.vue](../../app/components/CopilotPanel.vue) 原有一处硬编码 `workspace.value === 'map' && drawnFeatures.value.length`。form 也要注入（当前表单结构 + 已填值），再堆一个 `if` 是错的做法。

已收敛为通用通道：`useWorkspaceContext(workspace)` → 请求体 `workspaceContext` → 服务端 `summarizeWorkspaceContext(workspace, raw)` 按工作区做 zod 边界校验后分发给 `summarizeDrawnFeatures`（已有）或 `summarizeForm`（新增）。空表单不注入——AI 该做的是 `generate-form`，给它一份空结构只是浪费 token。

**为什么必须注入而不是让 AI 自己从工具历史里重建**：`generate-form` 之后跟 5 次 `update-field`，要算出当前结构就是把归约算法在脑子里跑一遍——LLM 做这个既贵又不可靠，一旦消息被编辑/截断更是必错。注入一份当前快照是几百 token 的事，换来的是每次增量编辑都命中正确字段。

`summarizeForm` 产出紧凑文本而非裸 JSON，且**必须带 `name` 列**——AI 靠它定位字段：

```text
当前表单「员工入职登记表」
分组：basic「基本信息」2 列；contact「联系方式」1 列，可折叠
字段（按顺序）：
1. name    text   「姓名」    必填  组 basic  校验：最少 2 字符
2. hasCar  switch 「是否有车」 选填  组 basic
3. plate   text   「车牌号」  选填  组 basic  显示条件：hasCar 为 true
用户已填：name=张三
修改表单时用上面的字段名定位，调用 update-field / set-field-validation 等工具。
```

与 map 的手绘注入一样：system prompt 不落库，LLM 每轮看到的都是**当前**快照，历史轮次不残留旧快照。

## 5. 落地结果

### 5.1 泛化重构 ✅

`shared/utils/map-tools/` → `shared/utils/tools/`，`MapToolContract` / `MAP_TOOLS` / `getMapTool` → `ToolContract` / `TOOLS` / `getTool`，map 的 6 个域文件搬进 `map/` 子目录。契约的 7 个字段无一处与地图耦合，是无损重命名。

派发器泛型化为 `useToolDispatch<TState, TCtx>`（[app/composables/useToolDispatch.ts](../../app/composables/useToolDispatch.ts)），四个不变量原样保留：消息纯归约、副作用 fire-once、`JSON.stringify` 状态签名节流、`'error' in output` 前置守卫。`useMapToolDispatch` / `useFormToolDispatch` 退化为注入各自状态与上下文的薄封装（ctx 必须在 setup 同步栈里构造）。applicator 的 `define()` 断言泛化为 `createDefine<TState, TCtx>()`。

**22 个 map handler 零改动**——`mcpToolFrom` 与 `defineMcpTool` 都是自动导入，handler 文件根本不 import 契约层。实际改动面只有 6 个文件。

map 工作区行为零变化（已实测：地名解析 → 飞行定位 → 落标注 → 刷新后相机 `replayOnLoad` 与标注纯归约重建，控制台零告警）。

### 5.2 画布与编译器 ✅

[shared/utils/form-schema.ts](../../shared/utils/form-schema.ts) + [useFormWorkspace.ts](../../app/composables/useFormWorkspace.ts) + [FormGroup.vue](../../app/components/form/FormGroup.vue) + [form-compiler.ts](../../app/utils/form-compiler.ts) + [form.vue](../../app/pages/workspace/form.vue)。

### 5.3 工具（12 个）✅

契约全部在 [shared/utils/tools/form/](../../shared/utils/tools/form/)，`workspaces: ['form']`。handler 一律是 echo 薄壳——form 工具是纯客户端状态操作，服务端无活可干（与 map 的 `fly-to` / `set-basemap` 同类）。

| 契约文件 | 工具 | handler | applicator |
| --- | --- | --- | --- |
| `schema.ts` | `generate-form` | echo | `reduce`（整体替换） |
| | `clear-form` | echo | `reduce`（复位） |
| | `set-form-meta` | echo | `reduce`（只覆盖传了的键） |
| `fields.ts` | `add-field` | echo | `reduce`（先剔同名再插入） |
| | `update-field` | echo | `reduce`（按 name 局部更新） |
| | `remove-field` | echo | `reduce` |
| | `reorder-fields` | echo | `reduce`（未列出的字段接在后面） |
| `validation.ts` | `set-field-validation` | echo | `reduce`（整体替换校验规则） |
| | `set-field-options` | echo | `reduce`（整体替换选项） |
| `layout.ts` | `set-layout` | echo | `reduce`（整体替换 groups + 字段归属） |
| `condition.ts` | `set-field-condition` | echo | `reduce`（传 null 清除） |
| `export.ts` | `export-form-code` | 缺省文件名 | `effect`，**不** `replayOnLoad` |

> 校验与选项同住 `validation.ts`（都是「字段取值规则」），没有单独的 `options.ts`。

全部 `reduce` 幂等且不可变更新（不原地 mutate `draft.fields`）——状态每次都由全部消息重放重建。`add-field` 先按 name 剔重再插入，重放时不会累积出重复字段；`set-layout` 让指向已删除分组的字段回到顶层，否则编译器会把它们当无分组处理却仍留着脏 `group` 值。

`export-form-code` 不 `replayOnLoad` 的理由与 `export-image` 完全相同：刷新页面不该重复触发一次下载。form 的 effect ctx 是 `{ schema: Ref<FormSchema>, format }`——codegen 要读当前完整状态，下载前还要过一遍 `$prettier`。

### 5.4 上下文与 prompt ✅

[useWorkspaceContext.ts](../../app/composables/useWorkspaceContext.ts) → 请求体 `workspaceContext`（[[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts)）→ [workspace-context.ts](../../server/utils/workspace-context.ts) 按工作区 zod 校验后分发给 [form-context.ts](../../server/utils/form-context.ts) 的 `summarizeForm`。

`WORKSPACE_BRIEF.form` 写了 12 个工具清单 + 四条选型规则：新表单用 `generate-form` 一次建好、局部调整一律走增量工具、`set-field-*` / `set-layout` 是整体替换而非合并、字段类型优先选语义最贴切的（手机号用 `phone` 而不是 `text`）。

`QUICK_CHATS.form` 22 条带动机的真实场景，覆盖全部 12 个工具与关键参数路径——与 map 一样，事实上当 eval 集用。

### 5.5 代码导出 ✅

[form-codegen.ts](../../app/utils/form-codegen.ts) 产出 Vue SFC → `$prettier` 格式化 → 代码页签（shiki `vue` 高亮）+ `export-form-code` 下载 `.vue` 文件。

> 「我想看代码」由代码页签直接满足，零 LLM 成本；工具只负责下载文件。**不**让 codegen 产物穿过 LLM——那是 map 文档 4.3「几何绝不回流 LLM」的同类反模式。

**已验证**：导出的 SFC 原样放进本项目，`pnpm typecheck` 通过，且作为独立组件渲染出的表单与画布预览一致（栅格、控件、默认值、条件隐藏、必填星号、按钮文案全部还原）。

## 6. 安全边界

1. **正则**：`pattern` 是 AI 生成的正则源串，编译器里 `new RegExp()` 必须 try/catch（非法正则跳过该条校验而非整表崩），契约 input 加长度上限（200），缓解 ReDoS 卡死用户自己 tab。
2. **条件联动绝不 eval**：只接受声明式 `{ field, op, value }`，由本地 `evalCondition` 求值。**不接受任何形式的表达式字符串、函数体字符串**，不用 `eval` / `new Function`。
3. **`controlProps` 直通**：编译器必须剔除 `/^on[A-Z]/` 开头的键（事件处理器注入）。包侧自己也有这个检测正则（`AUTOFORM_PATTERNS.EVENT_PROP`，见 3.6）。
4. **codegen 转义**：TS 源码里的字符串字面量走 `JSON.stringify()`。但**落在 Vue 模板双引号属性里的字符串不能这么写**——`:submit-button-props="{ label: "立即报名" }"` 的内层双引号会提前闭合属性。那一处必须用单引号字面量（`singleQuoted()`）。模板里的文本节点另走 HTML 转义。
5. **上下文注入边界校验**：`workspaceContext` 来自客户端，服务端用 zod 校验并加尺寸上限（分组 ≤ 20、字段 ≤ 100），单个已填值截断到 60 字符。

## 7. 已知限制

1. **画布是 `<ClientOnly>` 的**。表单结构是「当前消息的纯归约」，而派发器客户端独占，SSR 期状态恒为空——见 9.3。代价是首屏有一次骨架屏，收益是不必让 hydration 去对齐两个必然不同的树。
2. **切走工作区会卸载画布**（与 map 同源）：`app/layouts/default.vue` 的 `<slot/>` 外没有 `<KeepAlive>`。若工具输出在用户已切走后才 resolve，`effect` 会静默无效。form 的 effect 只有 `export-form-code` 一项（下载），影响面小于 map。`reduce` 不受影响——状态是纯归约，切回来自动重建。
3. **导出代码丢失分组的标题与折叠**：`afz.layout` 的容器组件不能跟着导出，只保留栅格 `class`。见 4.2。
4. **`fill-sample-data` 未做**：AI 目前只能读用户填的值（经上下文注入），不能主动写入示例值。

## 8. 关键文件

契约层：

- [shared/utils/tools/](../../shared/utils/tools/) —— 泛化后的工具契约（`map/` + `form/` 两个子目录 + `index.ts` 汇总 `TOOLS` / `getTool` / `ToolOutput<N>`）
- [shared/utils/tools/form/shapes.ts](../../shared/utils/tools/form/shapes.ts) —— 12 个 form 工具共用的 zod 形状，逐一对应 `form-schema.ts` 的类型
- [shared/utils/form-schema.ts](../../shared/utils/form-schema.ts) —— `FormSchema` / `FormField` / `FieldType` / `createFormSchema()`
- [shared/utils/workspace.ts](../../shared/utils/workspace.ts) —— `Workspace` 类型与 `WORKSPACES` 常量

服务端：

- [server/utils/workspace-context.ts](../../server/utils/workspace-context.ts) —— 按工作区 zod 校验后分发上下文摘要
- [server/utils/form-context.ts](../../server/utils/form-context.ts) —— `summarizeForm()`，表单结构 + 填写值 → system prompt 摘要
- [server/utils/chat-prompts.ts](../../server/utils/chat-prompts.ts) —— `WORKSPACE_BRIEF.form`
- [server/utils/mcp/mcp-tool.ts](../../server/utils/mcp/mcp-tool.ts) —— `mcpToolFrom(name)`，返回类型必须显式标注（见 map 文档 4.1 的 TS7006 坑）
- [server/utils/mcp/tools.ts](../../server/utils/mcp/tools.ts) —— mcp-toolkit → AI SDK 桥接，按契约的 `workspaces` 过滤
- [server/mcp/tools/](../../server/mcp/tools/) —— 12 个 form handler（全部 echo 薄壳）

客户端：

- [app/composables/useToolDispatch.ts](../../app/composables/useToolDispatch.ts) —— 泛型派发器（纯归约 + fire-once + 签名节流 + error 守卫）
- [app/composables/useFormToolDispatch.ts](../../app/composables/useFormToolDispatch.ts) —— form 的薄封装，注入状态与 `$prettier`
- [app/composables/useFormWorkspace.ts](../../app/composables/useFormWorkspace.ts) —— `FormSchema` 与 `formValues` 两个 `useState`
- [app/composables/useWorkspaceContext.ts](../../app/composables/useWorkspaceContext.ts) —— 按工作区产出上传给服务端的上下文快照
- [app/utils/tool-applicators.ts](../../app/utils/tool-applicators.ts) —— `ToolApplicator<TState, TCtx>` 与 `createDefine()`
- [app/utils/form-tool-applicators.ts](../../app/utils/form-tool-applicators.ts) —— form 工具 → 「对表单做什么」
- [app/utils/form-compiler.ts](../../app/utils/form-compiler.ts) —— `FormSchema` → `z.ZodObject`；`FIELD_SPEC` / `RULE_MESSAGE` / `fieldControlProps` 的真源
- [app/utils/form-codegen.ts](../../app/utils/form-codegen.ts) —— `FormSchema` → Vue SFC 源码
- [app/pages/workspace/form.vue](../../app/pages/workspace/form.vue) —— 画布（预览 / 代码双页签）
- [app/components/form/FormGroup.vue](../../app/components/form/FormGroup.vue) —— 分组容器（标题 + 栅格 + 折叠）
- [app/plugins/prettier.ts](../../app/plugins/prettier.ts) —— `$prettier`，格式化生成的代码
- [app/plugins/zod-locale.ts](../../app/plugins/zod-locale.ts) —— zod 中文错误文案 + 必填提示（见 9.4）
- [app/utils/quick-chats.ts](../../app/utils/quick-chats.ts) —— `QUICK_CHATS.form`

`@movk/nuxt` 包：

- `dist/runtime/composables/useAutoForm.ts` —— `afz` 工厂入口
- `dist/runtime/components/AutoForm.vue` —— 表单渲染组件（全局注册名是 **`MAutoForm`**，包的组件前缀是 `M`）
- `dist/runtime/domains/auto-form/` —— `controls` / `schema` / `metadata` / `constants`
- `dist/runtime/types/auto-form/` —— `zod-factory`（`TypedZodFactory`）/ `controls`（`AutoFormControlsMeta` / `AutoFormLayoutConfig`）/ `fields`（`AutoFormFieldContext`）
- `dist/runtime/types/zod.d.ts` —— `ZodAutoFormFieldMeta`

## 9. 踩坑记录

沿用 map 文档第 7 节的标准：只记**真实 bug 的根因**与**被实测推翻的错误结论**。

### 9.1 模型把工具调用当文本吐出来：mcp-toolkit 的工具表只在启动时扫描

12 个 form 工具的契约、handler、applicator 全部写好后，第一次实测 `帮我做一份员工入职登记表`，模型回了一段这样的正文：

```text
好的，我来为你生成一份完整的员工入职登记表。<tool_call>generate-form(, , ], "group": "基本信息" },
, , , , , , , , ], "layout": {, , , , ]}, "options": {, , , , , , ], "education": {, , , , },
"validations": {, "phone": $" }, "email": {, ...
```

聊天流里没有任何工具气泡，画布是空的，但模型信誓旦旦地描述「已生成 5 个分组、17 个字段」。

**错误诊断**：先怀疑 `generate-form` 的 input schema 太复杂，`z.toJSONSchema` 转换时把 `z.unknown()` / `z.record()` 转崩了。实测证伪——单独跑 `z.toJSONSchema(z.object(generateForm))` 完全正常，`defaultValue` 转出 `{}`（any），schema 合法。

**真正根因**：`@nuxtjs/mcp-toolkit` 的工具虚拟模块 `#nuxt-mcp-toolkit/tools.mjs` 是**在 dev server 启动时扫描 `server/mcp/tools/` 目录**生成的。会话中途新增的 12 个 handler 文件不会触发重扫（HMR 只重建了 Nitro，没重建这个虚拟模块）。于是 `getToolsForWorkspace('form')` 返回空工具集——**system prompt 里明明白白写着「你可以调用 generate-form」，但工具集里根本没有它**，模型只能退回自己的内部 `<tool_call>` 文本格式硬凑。

**修复**：重启 dev server。**教训**：新增 MCP 工具文件后必须重启，HMR 不够。这个失败模式极具迷惑性——它看起来像模型能力问题或 schema 问题，实际是工具压根没下发。判据很简单：**聊天流里有没有工具气泡**。没有气泡而模型声称做了事，就是工具没注册。

### 9.2 `afz.string({ label })` 运行时能跑，typecheck 报 TS2769

见 3.4.1。第一版 codegen 把 `label` / `if` 和 `type` / `controlProps` 一起塞进 afz 工厂入参——因为编译器就是这么写的，而且画布跑得好好的。

导出的代码放进项目一 typecheck，`afz.string(...)` / `afz.number(...)` / `afz.boolean(...)` 全线 TS2769。

**根因**：编译器那份能过，是因为它在 `fieldMeta()` 里收口成了 `never`（控件 key 来自运行时表，本来就对不上静态重载）。导出的代码没有这层收口，直接撞上 `AutoFormControlsMeta` 的多余属性检查——`label` 不在里面。

**修复**：codegen 按包的类型分界线拆两处（工厂入参 / `.meta()`）。**教训**：`as never` 收口的地方，等于放弃了类型对这段代码的检查——凡是要把同样的结构再输出给别人（生成代码、导出配置）的场景，必须单独验证那份产物，不能因为运行时跑通就假定类型也对。

**顺带一个测试方法学的坑**：验证导出代码时把它放进了 `app/utils/` —— 那是 Nuxt 的自动导入目录，`export const formSchema` 于是被全局自动导入，在自己的初始化里引用自己，报出一条 `TS7022: 'formSchema' implicitly has type 'any' ... referenced directly or indirectly in its own initializer`。这条是**验证方式自己制造的假象**，与生成的代码无关。改放到非自动导入目录（或按 `.vue` 组件放进 `app/components/`）后消失。

### 9.3 画布 hydration 节点不匹配：SSR 与客户端渲染的必然是两棵树

代码页签落地后，控制台开始报 `Hydration node mismatch: rendered on server: node / expected on client: Symbol(v-fgt)`。

**根因**：表单结构是「当前消息的纯归约」，而派发器整体包在 `import.meta.client` 内（这是 map 文档 7.2 定下的、必须保留的守卫）。于是 **SSR 期 `form-workspace` 恒为空**，服务端渲染的是空状态分支；而客户端 hydrate 页面组件时，layout 里的 `CopilotPanel` 已经先 setup 完毕，它的 `watchEffect` 同步跑完了归约——**状态已经填好了**，于是客户端渲染的是表单分支。两棵树必然不同。

Phase 2 / Phase 4 没报错，只是因为当时两个分支都是单个 `<div>`（节点类型相同，Vue 悄悄 patch 了内容）。改成 `<template v-else>`（fragment）后，节点类型不同才炸出来——**问题一直在，只是之前被掩盖了**。

**修复**：整块画布包 `<ClientOnly>` 并给一个骨架 fallback。这不是权宜之计——这块画布本来就是客户端状态的投影，明确声明比让 hydration 去对齐两棵注定不同的树更诚实。

### 9.4 zod 的默认错误文案是英文，且未填写时报的是类型错误

表单必填项留空点提交，字段下方显示的是 `Invalid input: expected string, received undefined`——英文，而且暴露的是 zod 内部术语，对终端用户毫无意义。

**第一反应是逐字段传错误文案**，但走不通：`afz.enum(values, overwrite)` 的第二参是 meta 而不是 error（只有 `createBasicFactory` 那批会 `extractErrorAndMeta`），enum 类字段覆盖不到；而且把 `error` 塞进 enum 的 meta 会被当成 `UFormField` 的 `error` prop，变成常驻显示的错误。

**修复**（[app/plugins/zod-locale.ts](../../app/plugins/zod-locale.ts)）：全局配一次。

```ts
z.config({
  ...z.locales.zhCN(),
  customError: issue => (issue.input === undefined ? '此项为必填' : undefined)
})
```

优先级实测确认：**契约里逐条校验的自定义文案（`最少 2 个字符`）> `customError`（必填）> `zhCN` locale**。`customError` 返回 `undefined` 时会落回 locale，所以只需拦「未填写」这一种情况。
