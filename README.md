# Movk Studio

基于 Nuxt UI 与 Vercel AI SDK 的 AI Copilot 工作台，用自然语言驱动地图、表单与数据等 movk 生态组件。

左边是对话，右边是画布。你说「加一列状态，用徽章展示，已完成显示绿色」，AI 调用工具，右侧的表格立刻长出这一列——它是一张真实可排序、可勾选、可翻页的 `MDataTable`，不是截图。切到「代码」页签，就是可以直接粘回项目的 Vue 单文件组件。

与传统低代码的差异：这里没有拖拽面板。「搭建」由 AI 的工具调用完成，用户在画布上做的是「试用」——填表单触发校验、排序勾选表格、在地图上手绘要素。这些交互产物会随下一条消息回灌给模型，成为它的上下文。

## 工作区

| 工作区 | 路由 | 画布 | 工具数 |
| --- | --- | --- | --- |
| 通用 | `/` | 首页（工作区入口） | 0 |
| 地图 | `/workspace/map` | `@movk/mapbox` + mapbox-gl + 天地图 | 22 |
| 表单 | `/workspace/form` | `MAutoForm` | 7 |
| 数据 | `/workspace/data` | `MDataTable` | 7 |

- **通用**：首页列出三个工作区入口，Copilot 在这里不带工具，用于介绍能力、帮你判断该去哪个工作区。
- **地图**：底图切换、3D 建筑、地形、热力图、点聚合、缓冲圆、路线规划、行政边界、POI 检索、地理编码、坐标转换、测距、手绘（MapboxDraw）、导出图片。
- **表单**：生成表单、增删改字段、重排、设置布局、条件联动，导出 Vue SFC。画布上的表单是活的，可以真实填写并触发 Zod 校验。
- **数据**：生成表格、增删改列、重排、表格选项（分页/多选/行动作），导出 Vue SFC。画布上的表格是活的，可以排序、勾选、翻页。

表单与数据工作区都提供「预览 / 代码」双页签，代码经 Prettier 格式化、Shiki 高亮，可复制或下载。

工作区枚举定义在 [shared/utils/workspace.ts](shared/utils/workspace.ts)。

## 架构

```text
自然语言
  → Copilot（@ai-sdk/vue useChat）
  → server/api/chats/[id].post.ts（streamText + getToolsForWorkspace）
  → MCP 工具调用（回显式 handler）
  → useToolDispatch（工具输出 → 画布状态的纯归约）
  → 画布状态 ─┬→ compiler：编译成活组件
              ├→ codegen：打印成 Vue SFC
              └→ context：摘要成中文回灌进 system prompt
```

三个工作区完全同构，靠三条不变量支撑。

### 工具三层

每个工具拆成三层，跨越三个目录：

1. **契约** [shared/utils/tools/](shared/utils/tools/) — 用 Zod 描述 input / output，字段说明写在 `.describe()` 里给模型看。
2. **handler** [server/mcp/tools/](server/mcp/tools/) — 回显式，服务端只做校验，不产生副作用。**工具属于哪个工作区，由它在这里的子目录名决定**（见 [server/utils/mcp/tools.ts](server/utils/mcp/tools.ts) 的 `getToolsForWorkspace`）。
3. **applicator** [app/utils/](app/utils/) — 客户端把工具输出应用到画布。

AI 的工具调用本质上只能是一个 RPC 描述符；真正的副作用（地图飞行、表格重建）必须由客户端的分发器触发。同一份工具定义同时服务应用内的 `streamText` 与对外的 `/mcp` 端点。

### 状态是消息的纯归约

[app/composables/useToolDispatch.ts](app/composables/useToolDispatch.ts) 把当前会话的全部消息归约成画布状态：

```text
状态 = reduce(所有消息中的工具输出)
```

切换会话、编辑消息、重新生成、删除消息，状态都会自动收敛，不存在累积泄漏。`reduce`（幂等，归约进状态）与 `effect`（按 `toolCallId` 只触发一次，如相机飞行、下载文件）严格分离。画布状态不落库，只有会话与消息落库。

### 语义三视图单一真源

[shared/utils/table-semantics.ts](shared/utils/table-semantics.ts)、[shared/utils/form-semantics.ts](shared/utils/form-semantics.ts)、[shared/utils/condition-semantics.ts](shared/utils/condition-semantics.ts) 是三个工作区的语义真源。每条语义只定义一次，同时给出三个视图：

- **怎么求值** — 画布编译时用（`format` / `test` / `apply`）
- **怎么生成代码** — 代码导出时用（`formatCode` / `code`）
- **怎么说成人话** — prompt 摘要时用（`label`）

三视图同义由 [test/](test/) 下的对拍测试保证：`table-semantics.spec.ts` 用 `new Function` 真的执行生成的源码，与运行时求值结果逐样本比对；`form-semantics.spec.ts` 保证画布上的校验提示与导出代码里的报错文案是同一句。

安全约束：**绝不 `eval` AI 产出的字符串**。声明式条件的求值一律走 `CONDITION_OPS` 里的 `test` 函数。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 框架 | Nuxt 4.4、Vue 3、Nuxt UI 4.9、Tailwind CSS 4 |
| 组件 | `@movk/nuxt`（`MDataTable` / `MAutoForm`）、`@movk/mapbox`、`@movk/core` |
| AI | Vercel AI SDK 7（`ai`、`@ai-sdk/vue`、`@ai-sdk/gateway`、`@ai-sdk/alibaba`） |
| 工具协议 | `@nuxtjs/mcp-toolkit` |
| 数据 | NuxtHub + Drizzle ORM + PostgreSQL |
| 其他 | Zod 4、Shiki、Prettier、Vitest 4、nuxt-csurf |

可选模型见 [shared/utils/models.ts](shared/utils/models.ts)：GLM 5.2、Qwen 3.7 Plus、Deepseek V3.2。三者均以 `alibaba/` 前缀在 [server/utils/model.ts](server/utils/model.ts) 解析到 DashScope。

## 快速开始

需要 Node 24 与 pnpm 11.10.0。

```bash
pnpm install
cp .env.example .env   # 按下表填写
pnpm db:migrate
pnpm dev               # http://localhost:3100
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | nuxt-auth-utils 会话密钥，至少 32 字符 |
| `NUXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Mapbox 浏览器端 token |
| `NUXT_PUBLIC_MAPBOX_TIANDITU_TOKEN` | 天地图浏览器端 token |
| `NUXT_TIANDITU_API_TOKEN` | 天地图地点检索专用，需申请「服务端」类型 key（IP 白名单校验），与浏览器端 key 不是同一个 |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `NUXT_OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth 登录 |
| `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth 登录 |
| `AI_GATEWAY_API_KEY` | AI Gateway |
| `ALIBABA_API_KEY` | DashScope API Key |
| `ALIBABA_BASE_URL` | 可选。留空用 SDK 默认（国际站）；大陆站填 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `HTTPS_PROXY` | 可选。容器出站代理，本地开发留空 |

前缀 `NUXT_PUBLIC_` 的 token 属于 public runtime config，容器启动时注入即可，无需重新构建镜像。

## 目录结构

```text
app/
  pages/              index.vue、workspace/{map,form,data}.vue
  layouts/            default.vue（侧边栏 + 工作区导航 + 常驻 CopilotPanel）
  components/         CopilotPanel、chat/*、form/*
  composables/        useCopilot、useToolDispatch、use{Map,Form,Table}Workspace、useWorkspaceContext
  utils/              {map,form,table}-tool-applicators、{form,table}-compiler、{form,table}-codegen
  plugins/            prettier、zod-locale
server/
  api/chats/          会话与消息 CRUD、streamText 主链路
  mcp/                index.ts（/mcp 端点）、tools/{map,form,data}/（工具 handler）
  db/                 Drizzle schema 与 migrations
  utils/              chat-prompts、model、{workspace,form,table}-context、mcp/*
shared/
  utils/              workspace、models、{form,table}-schema、{form,table,condition}-semantics
  utils/tools/        工具契约（Zod）
test/                 语义三视图对拍测试
docs/references/      四篇实现参考文档
```

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器，端口 3100 |
| `pnpm build` | 生产构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm typecheck` | `nuxt typecheck` |
| `pnpm test` | Vitest |
| `pnpm db:generate` | 生成 Drizzle migration |
| `pnpm db:migrate` | 执行 migration |
| `pnpm clean` | 清理构建缓存 |

## 测试

Vitest 4，用例位于 `test/**/*.spec.ts`，`node` 环境。四个 spec 全部围绕语义三视图对拍：

- `table-semantics.spec.ts` / `table-codegen.spec.ts` — 表格单元格语义与代码生成
- `form-semantics.spec.ts` — 表单校验规则语义
- `condition-semantics.spec.ts` — 条件算子语义

注意：CI（[.github/workflows/ci.yml](.github/workflows/ci.yml)）目前只跑 `lint` 与 `typecheck`，**不跑测试**，本地改动语义相关代码后请手动执行 `pnpm test`。

## 部署

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) 在 push 到 `main` 时触发：经 SSH 隧道连接 Postgres → `pnpm db:migrate` → `pnpm build` → 构建镜像推送到 `ghcr.io`。

[Dockerfile](Dockerfile) 是 runtime-only 镜像，只拷贝 `.output`，入口 `node server/index.mjs`，监听 3000。

## MCP 端点

应用自身暴露一个 MCP 端点 `/mcp`（[server/mcp/index.ts](server/mcp/index.ts)，服务名 `Movk Studio`），外部 MCP 客户端可以直接复用这批工具。端点要求登录；[nuxt.config.ts](nuxt.config.ts) 的 `routeRules` 对其关闭了 CSRF 校验。

## 延伸阅读

- [数据表格工作区](docs/references/data-table-workspace-reference.md) — 哪些东西不能进画布状态、`CELL_SPEC` 三视图、新增工具的五步清单
- [表单工作区](docs/references/autoform-form-workspace-reference.md) — AI 只能吐 JSON 而 AutoForm 吃活的 Zod 对象，这中间怎么接
- [地图工具](docs/references/mcp-toolkit-map-tools-reference.md) — 22 个地图工具的分层落地与踩坑记录
- [Copilot 面板](docs/references/chat-copilot-reference.md) — AI SDK 传输层、chatId 与工作区的关系
