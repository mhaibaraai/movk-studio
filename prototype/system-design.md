# movk-studio 系统设计文档

> AI Copilot 工作台 —— 用自然语言驱动 movk 生态（地图 / 表单 / 数据）
>
> 版本：v0.1（设计阶段）· 最后更新：2026-06-30

## 目录

- [一、需求设计](#一需求设计)
  - [1.1 背景与定位](#11-背景与定位)
  - [1.2 目标与非目标](#12-目标与非目标)
  - [1.3 核心概念](#13-核心概念)
  - [1.4 用户角色与场景](#14-用户角色与场景)
  - [1.5 功能需求](#15-功能需求)
  - [1.6 非功能需求](#16-非功能需求)
- [二、技术方案](#二技术方案)
  - [2.1 技术选型](#21-技术选型)
  - [2.2 整体架构](#22-整体架构)
  - [2.3 双通道设计](#23-双通道设计)
  - [2.4 Copilot 内核模块](#24-copilot-内核模块)
  - [2.5 三大模块设计](#25-三大模块设计)
  - [2.6 数据流与时序](#26-数据流与时序)
  - [2.7 目录结构](#27-目录结构)
  - [2.8 安全设计](#28-安全设计)
- [三、任务 TODO](#三任务-todo)
- [四、风险与决策记录](#四风险与决策记录)

---

## 一、需求设计

### 1.1 背景与定位

`movk-studio` 是建立在已发布的 movk 生态之上的 **AI Copilot 工作台**。区别于通用 Chatbot，它的核心价值是让用户用自然语言**直接驱动应用本身**：对话是「指挥层」，movk 组件（地图 / 表单 / 数据表）是「执行层」。

已完成的 movk 生态：

| 包 | 定位 | 在 studio 中的角色 |
| --- | --- | --- |
| `@movk/core` | Vue 工具函数 / composables | 底层工具支撑 |
| `@movk/nuxt` | AutoForm（Zod v4）/ DataTable / API 集成 | AI 可操作的「表单 / 表格」对象 |
| `@movk/mapbox` | 声明式 Mapbox GL v3（3D / 绘制 / 天地图 / WMS-WMTS） | AI 可操作的「地图」对象（差异化核心） |
| `@movk/nuxt-docs` | 文档主题，已内置 AI Chat + MCP | 可复用的 AI 集成参考 |
| `movk-dashboard` | RBAC 后台 | 未来集成 / 承载场景 |

设计理念借鉴 **CopilotKit** 三大支柱（Frontend Tools / Generative UI / Shared State），但因 CopilotKit 为 React 优先，故采用 **Vue 原生 + Vercel AI SDK + @nuxt/ui Chat 组件**自研，不直接引入。

### 1.2 目标与非目标

**目标**

- 提供「自然语言 → 操作 movk 组件」的统一 Copilot 体验，覆盖地图、表单、数据三大模块。
- 沉淀一套与业务解耦的 Copilot 内核，未来可抽离为 `@movk/copilot`。
- 对外通过 MCP 开放服务端能力，复用 `@movk/nuxt-docs` 的 MCP 经验。

**非目标（当前阶段明确排除）**

- 不做通用多模型大杂烩 Chatbot（官方模板已覆盖）。
- 不直接集成 React 版 CopilotKit。
- MVP 不追求生产级多租户 / 权限体系（后续接 `movk-dashboard` RBAC）。

### 1.3 核心概念

| 概念 | 说明 |
| --- | --- |
| **Frontend Tools** | AI SDK `tool()` 定义的工具，tool-call 在**浏览器客户端**执行，可操作 live 组件实例。 |
| **Generative UI** | 工具结果在对话流中直接渲染为 movk 组件 / 卡片，而非纯文本。 |
| **Shared State** | 应用状态（地图视野 / 表单值 / 表格筛选）注入对话上下文，让 AI「看得见」当前状态。 |
| **HITL** | Human-in-the-Loop，破坏性操作（清空 / 删除 / 导出）需用户确认后执行。 |
| **MCP Server** | 通过 `@nuxtjs/mcp-toolkit` 把无状态服务端能力开放给外部 AI 宿主（Cursor / Claude）。 |

> 关键区分：**Frontend Tools 在浏览器执行**（能操作 live 组件）；**MCP 在服务端无状态**（碰不到 live 组件）。两者互补，不可互替。

### 1.4 用户角色与场景

- **GIS / 业务分析人员**：用自然语言操作地图——定位、标注、叠加图层、查询要素、量算。
- **前端 / 低代码搭建者**：用自然语言生成并填充表单（AutoForm + Zod Schema）。
- **数据运营人员**：用自然语言筛选、排序、统计、导出数据表。
- **外部 AI 工具用户**：在 Cursor / Claude 中通过 MCP 调用 studio 的 geocoding / 查询能力。

### 1.5 功能需求

#### 通用能力

- [F-C1] 流式对话（Vercel AI SDK）、Markdown 渲染、错误重试。
- [F-C2] 工具调用步骤可视化（pending / running / done）。
- [F-C3] Generative UI 卡片在对话流内渲染。
- [F-C4] HITL 确认卡片拦截破坏性操作。
- [F-C5] 会话历史：新建 / 切换 / 删除 / 持久化，记录所属模块。
- [F-C6] 模块切换（地图 / 表单 / 数据），Copilot 上下文随模块切换。
- [F-C7] 明暗主题切换。

#### 地图模块（@movk/mapbox）

- [F-M1] `map.flyTo` 飞行定位（地名 / 坐标）。
- [F-M2] `map.addMarker` 标注。
- [F-M3] `map.addLayer` 叠加图层（WMS / WMTS / 天地图）。
- [F-M4] `map.queryFeatures` 要素查询 → 要素列表卡片。
- [F-M5] `map.measureDistance` 距离量算 → 结果卡片。
- [F-M6] `map.toggle3D` 3D 倾斜视角。
- [F-M7] `map.drawPolygon` / `drawLine` 绘制。
- [F-M8] `map.clearMarkers` 清空（HITL）。

#### 表单模块（@movk/nuxt AutoForm）

- [F-F1] `form.generateSchema` 由自然语言生成 Zod Schema → Schema 预览卡片。
- [F-F2] `form.render` 渲染 AutoForm 字段。
- [F-F3] `form.addField` 动态增删字段、改必填。
- [F-F4] `form.setValues` 填充示例 / 指定数据。
- [F-F5] `form.validate` 校验并高亮错误字段。
- [F-F6] `form.submit` 提交（HITL，可选）。

#### 数据模块（@movk/nuxt DataTable）

- [F-D1] `table.filter` 条件筛选 → 筛选 chip。
- [F-D2] `table.sort` 排序（含表头点击）。
- [F-D3] `table.search` 关键字搜索。
- [F-D4] `table.aggregate` 分组统计 → 图表卡片。
- [F-D5] `table.export` 导出 CSV（HITL）。

#### 对外 MCP 通道

- [F-X1] `geocode` 地名 → 坐标。
- [F-X2] `query-features` 服务端要素查询。
- [F-X3] `layer-metadata` WMS / WMTS 元数据。

### 1.6 非功能需求

| 维度 | 要求 |
| --- | --- |
| 性能 | 首屏 < 2s；工具执行反馈即时（步骤流式）；地图操作 60fps。 |
| 安全 | 密钥仅 env；工具参数 Zod 校验；HITL 拦截破坏性操作；GenUI / Markdown 渲染消毒（防 XSS）。 |
| 可维护 | 内核与业务解耦；单文件 200–400 行典型、800 上限；多小文件优先。 |
| 可扩展 | 新增模块 / 工具不改动内核；工具注册即生效。 |
| 可移植 | 内核可抽为 `@movk/copilot`；服务端工具 schema 前后端 / MCP 两用。 |
| 可访问 | 键盘可达、ARIA 标签、明暗主题对比度达标。 |

---

## 二、技术方案

### 2.1 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Nuxt 4（根目录 `app/` srcDir） | 单应用，非 monorepo（避免过度设计） |
| UI | `@nuxt/ui` v4 | `UChatMessages` / `UChatPrompt` / `UChatMessage` / `UChatPalette` |
| AI | Vercel AI SDK（`ai`） | 流式、`tool()` 工具调用、`streamText` |
| 校验 | `zod` v4 | 工具参数 / 表单 Schema，前后端共享 |
| 地图 | `@movk/mapbox` | 业务执行层 |
| 表单 / 表格 | `@movk/nuxt` | AutoForm / DataTable |
| 工具库 | `@movk/core` | composables |
| MCP | `@nuxtjs/mcp-toolkit` | 对外通道（Phase 3） |
| 持久化 | Drizzle ORM + SQLite | 会话历史（Phase 3） |

### 2.2 整体架构

```text
┌───────────────────────────── 浏览器（用户眼前）─────────────────────────────┐
│  ┌── 舞台区（执行层）──┐         ┌────────── Copilot 面板（指挥层）──────────┐ │
│  │ 地图 / 表单 / 数据  │ ◀────── │ UChatMessages + UChatPrompt + 历史抽屉    │ │
│  │  live 组件实例      │  操作   │  ├ Generative UI 渲染                     │ │
│  └────────┬───────────┘         │  └ HITL 确认                              │ │
│           │ Shared State 注入 ──────────▶ 上下文                            │ │
│           ▼                     └──────────────┬────────────────────────────┘ │
│       Dispatcher（客户端执行器）◀── tool-call ──┘                              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                     │ /api/chat（流式）
┌────────────────────────────────────▼─────────────────────────────────────────┐
│  Nuxt 服务端                                                                   │
│   ├ server/api/chat.post.ts —— AI SDK streamText + 工具 schema 收集 + 模型网关 │
│   ├ server/mcp/tools/* —— @nuxtjs/mcp-toolkit（对外通道）                       │
│   └ server/db/* —— Drizzle + SQLite 会话历史                                   │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                      │ MCP 协议
                            外部 AI 宿主（Cursor / Claude / VS Code）
```

### 2.3 双通道设计

| | 通道一 In-app Copilot（MVP 主线） | 通道二 MCP Server（Phase 3） |
| --- | --- | --- |
| 调用方 | studio 自身对话 UI | 外部宿主（Cursor / Claude） |
| 执行位置 | 浏览器客户端 | 服务端（无状态） |
| 能否操作 live 组件 | ✅ | ❌ |
| 适用工具 | 操作类（flyTo / setValues / filter） | 查询类（geocode / query-features） |
| 共享 | 服务端查询工具的 Zod schema 两通道复用 | |

### 2.4 Copilot 内核模块

> 模块边界即未来 `@movk/copilot` 的包边界。

| 模块 | 职责 | 关键 API |
| --- | --- | --- |
| `runtime` | 工具定义 / 注册 / 调度 | `defineTool()`、`registry`、`dispatcher` |
| `state` | Shared State 注入 | `useCopilotReadable()`、`snapshot()` |
| `ui` | Generative UI 映射与渲染 | `registerPart()`、`<PartRenderer>` |
| `hitl` | 破坏性操作确认 | `useConfirm()`、`<ConfirmCard>` |
| `provider` | 组合外壳 | `useCopilot()`、`<MovkCopilot>` |
| `server` | 流式端点封装 | `defineChatHandler()`、模型网关 |

### 2.5 三大模块设计

#### 地图模块

- 嵌入 `@movk/mapbox` 实例；地图状态 store（视野 / 图层 / 标注 / 绘制）接入 Shared State。
- 工具集见 [F-M1~F-M8]；Generative UI：位置卡片、要素列表、量算结果。
- HITL：清空绘制 / 批量删除标注。

#### 表单模块

- 嵌入 `@movk/nuxt` AutoForm；AI 输出 Zod Schema → 渲染字段。
- 状态：`{ fields, values }` 接入 Shared State；工具集见 [F-F1~F-F6]。
- Generative UI：Schema 预览卡片、填充摘要、校验结果。

#### 数据模块

- 嵌入 `@movk/nuxt` DataTable；状态：`{ filters, sort, search }`。
- 工具集见 [F-D1~F-D5]；表头点击排序与工具排序状态同源。
- Generative UI：筛选 chip、分组统计图表卡片、导出结果。

### 2.6 数据流与时序

```text
用户输入
  → /api/chat（messages + 工具 schema + 状态快照）
  → LLM 决策 tool-call
  → 流式回传 tool-call
  → Dispatcher 解析 → 客户端执行器操作 live 组件
  → tool-result 回填
  → LLM 续写（文本 + Generative UI part）
  → 渲染卡片 + 组件状态已变化
```

破坏性工具在「客户端执行」前插入 HITL：待确认 → 用户批准 → 执行；否则回填取消结果。

### 2.7 目录结构

```text
movk-studio/
├── app/
│   ├── copilot/                      # Copilot 内核（未来 @movk/copilot）
│   │   ├── runtime/                  #   define-tool / registry / dispatcher
│   │   ├── state/                    #   use-copilot-readable / snapshot
│   │   ├── ui/                       #   register-part / PartRenderer.vue
│   │   ├── hitl/                     #   use-confirm / ConfirmCard.vue
│   │   ├── provider/                 #   use-copilot / MovkCopilot.vue
│   │   └── types.ts
│   ├── features/
│   │   ├── map/{tools,ui,state,MapCanvas.vue}
│   │   ├── form/{tools,ui,state,FormCanvas.vue}
│   │   └── data/{tools,ui,state,DataCanvas.vue}
│   ├── components/CopilotPanel.vue
│   ├── pages/index.vue
│   └── app.vue
├── server/
│   ├── api/chat.post.ts              # 通道一
│   ├── mcp/tools/*                   # 通道二（@nuxtjs/mcp-toolkit）
│   ├── utils/{model-gateway,geocoding}.ts
│   └── db/{schema,client}.ts
├── shared/tool-schemas/*             # 前后端 / MCP 共享 Zod schema
├── prototype/                        # 本原型与文档
│   ├── index.html
│   └── system-design.md
├── nuxt.config.ts
└── package.json
```

### 2.8 安全设计

- **密钥管理**：模型 / 地图 token 仅来自 `.env`，`.env.example` 占位，启动时校验存在性。
- **输入校验**：所有工具参数经 Zod 校验；表单数据经 Schema 校验。
- **XSS 防护**：Generative UI 与 Markdown 渲染消毒，禁止注入未净化 HTML（原型中演示用 `innerHTML` 仅限可信常量，生产用结构化渲染）。
- **HITL**：删除 / 清空 / 导出 / 提交等破坏性操作强制确认。
- **MCP 边界**：仅暴露无状态只读查询能力，不开放写操作。
- **越权防护**：接入 `movk-dashboard` RBAC 后，工具调用受角色权限约束。

---

## 三、任务 TODO

### Phase 0 · 基础设施

- [ ] Nuxt 4 应用接入 `@nuxt/ui`、`@movk/mapbox`、`@movk/core`、`@movk/nuxt`
- [ ] 安装 `ai`（Vercel AI SDK）+ `zod`
- [ ] `server/utils/model-gateway.ts`：模型网关，密钥读 env，`.env.example` 占位
- [ ] `server/api/chat.post.ts`：`streamText` 流式端点骨架
- [ ] `app.vue` / `pages/index.vue`：`UChatMessages` + `UChatPrompt` 对话外壳
- [ ] 验收：能发消息并收到流式回复；无硬编码密钥

### Phase 1 · Copilot 内核

- [ ] `runtime/define-tool.ts`：`defineTool()`（Zod schema + 客户端执行器）
- [ ] `runtime/registry.ts`：工具注册表
- [ ] `runtime/dispatcher.ts`：tool-call → 客户端执行 → result 回填
- [ ] `state/use-copilot-readable.ts` + `snapshot.ts`：Shared State + 脱敏
- [ ] `ui/register-part.ts` + `PartRenderer.vue`：Generative UI 映射与安全渲染
- [ ] `hitl/use-confirm.ts` + `ConfirmCard.vue`：确认流
- [ ] `provider/use-copilot.ts` + `MovkCopilot.vue`：组合外壳
- [ ] 验收：mock `echo` 工具端到端验证 tool-call → 客户端执行 → 流内渲染组件

### Phase 2 · 三大模块

**地图（标杆，优先）**

- [ ] `MapCanvas.vue` 嵌入 `@movk/mapbox`
- [ ] `state/use-map-store.ts` 接入 Shared State
- [ ] 工具：`fly-to` `add-marker` `draw-polygon` `add-layer` `query-features` `measure-distance` `toggle-3d` `clear-markers`
- [ ] Generative UI：`LocationCard` `FeatureList` `MeasureResult`
- [ ] HITL：清空 / 批量删除
- [ ] 验收：「飞到上海并标注外滩，叠加天地图影像」多步工具链真实改变地图

**表单**

- [ ] `FormCanvas.vue` 嵌入 AutoForm
- [ ] 工具：`generate-schema` `render` `add-field` `set-values` `validate` `submit`
- [ ] Generative UI：`SchemaCard` `FillSummary` `ValidateResult`
- [ ] 验收：「生成用户注册表单 → 添加手机号必填 → 填充示例 → 校验」全链路

**数据**

- [ ] `DataCanvas.vue` 嵌入 DataTable
- [ ] 工具：`filter` `sort` `search` `aggregate` `export`
- [ ] Generative UI：`FilterChips` `AggregateChart` `ExportResult`
- [ ] 表头点击排序与工具状态同源
- [ ] 验收：「筛选活跃用户 → 倒序 → 统计 → 导出」全链路

### Phase 3 · 持久化 + MCP

- [ ] `server/db/schema.ts` + `client.ts`：Drizzle + SQLite 会话 / 消息
- [ ] 会话历史：新建 / 切换 / 删除 / 按模块标记（结构化消息数组）
- [ ] 错误处理、流中断恢复、工具失败降级
- [ ] `server/mcp/tools/`：`geocode` `query-features` `layer-metadata`
- [ ] `shared/tool-schemas/`：前后端 / MCP 共享 Zod schema
- [ ] 可选：`UChatPalette` 命令面板、GeoJSON 上传
- [ ] 验收：外部宿主（Cursor / Claude）可经 MCP 调用 studio 服务端能力

### Phase 4 · 抽包与扩展

- [ ] `app/copilot/**` → `packages/copilot`（边界已对齐）
- [ ] 接入 `movk-dashboard` RBAC，工具受权限约束
- [ ] 多模型网关、模型切换 UI

### 全局验收

- [ ] 端到端：自然语言多步指令真实驱动三模块
- [ ] 安全：密钥 env、Zod 校验、HITL 拦截、渲染消毒
- [ ] 解耦：新增 mock 工具无需改动内核
- [ ] 测试：单元（工具 / state）+ 集成（/api/chat）+ E2E（关键用例），覆盖率 ≥ 80%

---

## 四、风险与决策记录

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 是否引入 CopilotKit | 否，借鉴理念自研 | React 优先，适配成本高，与 Vue 生态不符 |
| 应用形态 | 根目录单 Nuxt 4 应用 | `@movk/*` 已发布，studio 仅消费方，monorepo 过度设计 |
| MVP 首场景 | 地图 Copilot | 演示张力最强、最独特 |
| MCP 定位 | 对外通道，Phase 3 后置 | 不阻塞 MVP 主线 |
| 历史持久化时机 | MVP 内存态，Phase 3 SQLite | 更快验证 |

**待确认决策**

1. 模型供应商：先单一供应商跑通，再接多模型网关？
2. 地名解析：用 Mapbox / 天地图 geocoding API（而非 LLM 猜坐标）？

---

## 附：原型说明

`prototype/index.html` 为可直接运行的交互原型（浏览器打开即可，无需构建 / token）：

- 顶部切换 **地图 / 表单 / 数据** 三模块。
- 右侧 Copilot 面板点击建议气泡，观察 AI 驱动左侧工作区。
- 演示了 Frontend Tools、Generative UI、HITL 确认、Shared State 浮层、会话历史（localStorage 持久化）。

> 原型为 UI / 交互演示，工具执行为脚本化模拟；真实实现以本文档技术方案为准。
