# AI 工具调用参考资料：@nuxtjs/mcp-toolkit 落地 map 工作区工具

> 面向 movk-studio「GIS Copilot」工具调用能力的实现参考。整理手写 tools 与 mcp-toolkit 两种方案的对比、`@movk/mapbox` 真实可调用接口清单，Tier 1（10 个 map 工具）的落地结果，以及两个真实 bug 的根因排查记录。**Tier 1 已实现并验证通过**，标 ✅ 的为已落地内容；Tier 2/3 仍是设计阶段。

## 1. 背景

[server/api/chats/[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) 里 `streamText` 的 `tools: {}` 曾是空占位符，注释写着「GIS 工具在 shared/utils/tools/ 落地后于此注册：flyTo / addLayer / queryPoi / annotate / setPitch 等」。此前 Copilot 只能用文字描述地图操作，不能真正驱动地图；现已接入 `getToolsForWorkspace(chat.workspace)`（见 4.6）。

本资料回答三个问题：

1. 该用手写 tools 还是 `@nuxtjs/mcp-toolkit`？
2. `@movk/mapbox` 真实支持哪些可被 AI 调用的操作？
3. 工具调用产生的结果，如何真正驱动浏览器里的 Mapbox 实例？

## 2. 两种工具方案对比

| 维度 | 方案 A：手写 tools（`chat` 模板） | 方案 B：`@nuxtjs/mcp-toolkit`（nuxt/ui docs 站） |
| --- | --- | --- |
| 定义方式 | 逐个 `tool({ description, inputSchema: zod, execute })`（来自 `ai` 包），静态对象字面量 | 每个工具一个文件，`server/mcp/tools/*.ts` 用 `defineMcpTool({ description, inputSchema, handler })`，文件名自动生成 kebab-case 工具名 |
| 接入 `streamText` | 手写 import，`tools: { chart: chartTool, weather: weatherTool }` | 自动发现所有工具文件，经虚拟导入 `#nuxt-mcp-toolkit/tools.mjs` 拿到定义数组，运行时转换成 AI SDK 的 `tool()` 对象后 `...` 展开 |
| 工具数量/新增成本 | 作者手动维护、手动 import | 新增文件即自动出现在工具集里，同时也自动出现在 `/mcp` 端点供外部 MCP 客户端调用 |
| 客户端 UI 映射 | `getToolName(part) === 'x'` 显式分支到专属 Vue 组件（`Chart.vue`/`Weather.vue`），读 `invocation.state` 渲染富卡片 | nuxt/ui docs 站没有这套映射，工具结果更像"触发 + 旁观察"（如 `applyTheme`）而非渲染卡片 |
| 服务端 `execute`/`handler` 实际做什么 | 真正做事，返回可直接渲染的数据 | 部分工具真做事（查文档），部分只是校验回显（`applyTheme`/`resetTheme`），真正的副作用在客户端完成 |

**结论**：两种方案的 `execute`/`handler` 都只在服务端运行，都不会直接操作浏览器里的 Mapbox 实例。对 GIS 场景而言，AI 工具调用本质上只能是一个「RPC 描述符」——服务端做校验（或做真正能纯计算的事，比如坐标转换），真正的地图副作用必须由客户端一个监听 `tool-output` 部件的分发器来触发。

`@nuxtjs/mcp-toolkit` 的价值在于：**同一份工具定义**既能注册为 `/mcp` 端点供外部 MCP 客户端（Claude Desktop、IDE 等）调用，又能在本项目自己的 `streamText` 里复用，不需要为"给 AI 用"和"给外部 MCP 客户端用"写两套工具。这是选择方案 B 的核心理由。

### `@nuxtjs/mcp-toolkit` 关键 API（已核对已发布的 0.17.2 版本源码）

- `defineMcpTool({ name?, title?, description?, inputSchema?, outputSchema?, annotations?, handler, cache? })`：`inputSchema` 是**原始 Zod shape**（不是 `z.object(...)`，模块自己包一层）；`name`/`title` 缺省时从文件名自动生成（kebab-case）。
- 工具文件放在 `server/mcp/{dir}/tools/*.ts`（`dir` 默认 `mcp`，即 `server/mcp/tools/`），自动发现、自动注册到 `/mcp` 端点。
- 服务端消费全部工具定义的虚拟导入是 **`#nuxt-mcp-toolkit/tools.mjs`**（导出 `tools` 数组）。

  > ⚠️ 踩坑记录：`mcp-toolkit` 源码仓库（未发布的开发分支）里这个路径已经改名为 `#nuxt-mcp/tools.mjs`，但 npm 上已发布、且 nuxt/ui docs 站实际安装跑通的 0.17.2 版本，编译产物（`dist/module.mjs`）里用的仍然是 `#nuxt-mcp-toolkit/tools.mjs` 前缀。以 `npm view @nuxtjs/mcp-toolkit version` 确认的已发布版本为准，不要以源码仓库当前状态为准。

- `defineMcpHandler({ middleware, tools, resources, prompts, ... })`：放在 `server/mcp/index.ts` 可以覆盖默认 `/mcp` handler 的配置，`middleware` 能在请求处理前后插入逻辑（如鉴权）。
- `nuxt.config.ts` 的 `mcp` 配置项：`enabled`（默认 `true`）、`route`（默认 `/mcp`）、`browserRedirect`（默认 `/`）、`name`、`version`（默认 `1.0.0`）、`dir`（默认 `mcp`）。

参考实现：[server/api/ai.post.ts](../../../ui/docs/server/api/ai.post.ts)（nuxt/ui docs 站，`mcpToolsToAiTools()` 函数即桥接逻辑原型）。

## 3. `@movk/mapbox` 真实可调用接口清单

这一节决定了"AI 工具"能不能真正落地成一次函数调用，而不是空中楼阁。已用官方 MCP 文档 + 本地已安装包类型声明核实。

### 3.1 相机控制 —— 唯一的组件树外命令式逃生舱口

```ts
useMapboxCamera({ mapId }) // → { flyTo, easeTo, jumpTo, fitBounds }
```

- 全部返回 `Promise<void>`，内部自动等待地图加载完成。
- **在 `<MapboxMap>` 组件树外，指定 `mapId` 即可调用**——这意味着位于 layout 里的 `CopilotPanel.vue` 可以直接驱动地图，无需 `map.vue` 参与任何逻辑。
- `flyTo`/`easeTo` 的 `EasingOptions` 含 `center`/`zoom`/`pitch`（3D 倾斜角）/`bearing`（方位角）/`duration`，`fitBounds` 额外接受任意 GeoJSON 自动求包围盒。
- 底层逃生舱口是 `useMapbox(mapId)`（返回 `MapboxContext | undefined`，从全局注册表按 `map-id` 查找），只有显式设置了 `map-id` 的 `<MapboxMap>` 才会注册进去。

### 3.2 图层 / 标注 / 弹窗 —— 声明式组件，没有命令式函数

`MapboxLayer`、`MapboxTiandituLayer`、`MapboxMarker`、`MapboxPopup` 等都是 Vue 组件，通过挂载/卸载来"增删"，**不存在** `addLayer()`/`addMarker()` 这样的 JS 函数。`useMap()` 虽然也能拿到地图上下文，但只能在 `<MapboxMap>` 子树内注入使用，同样不适合从 `CopilotPanel` 调用。

因此：AI 工具产生的"加标注"、"切换底图"这类结果，必须写入一份**共享响应式状态**，再由 `map.vue` 的模板声明式地渲染（`v-for`/`v-if` 绑定该状态）。这是唯一可行路径，不是设计偏好。

### 3.3 绘制 —— 无 id 逃生舱口，本轮无法从 Copilot 驱动

```ts
useMapboxDraw() // 必须在 <MapboxDrawControl> 子树内调用，否则抛错
```

没有类似 `useMapbox(id)` 的按 id 查找方式，`CopilotPanel` 够不到。要支持"AI 让我画一个多边形"，需要先给 `map.vue` 设计一层 provide/emit 桥接（把 draw 指令从外部传进 `MapboxDrawControl` 子树），是一项独立的后续工作，本轮不做。

### 3.4 纯函数 —— 真正能在服务端完整执行的能力

```ts
import { transformPoint, transformGeoJSON } from '@movk/mapbox/utils/coordinate'
// transformPoint(point: [number, number], from: CRS, to: CRS, options?: { precision?: number }): [number, number]
// CRS = 'WGS84' | 'GCJ02' | 'BD09' | 'EPSG3857'
```

不涉及任何地图实例，是唯一一个 `handler` 里能"真正干活"而不是校验回显的工具候选——坐标转换。

### 3.5 无对应能力（需推迟或需外部集成）

- **POI 查询**：`@movk/mapbox` 没有 POI 搜索 composable；需接天地图 POI Web 服务或高德 POI API（有对应的 `NUXT_TIANDITU_TOKEN`，可复用）。
- **通用任意图层添加**：没有命令式 `addLayer`，且完整支持任意 `paint`/`layout` schema 的输入远比"加一个标注点"复杂，需等标注/底图这类声明式状态方案验证过后再评估。

## 4. 落地结果（Tier 1，已实现）

### 4.1 工具与工作区映射 ✅

[server/utils/tools.ts](../../server/utils/tools.ts) 的 `getToolsForWorkspace(workspace)`：桥接 `#nuxt-mcp-toolkit/tools.mjs` 的定义数组为 AI SDK 的 `ToolSet`，按 [shared/utils/tool-workspaces.ts](../../shared/utils/tool-workspaces.ts) 的 `TOOL_WORKSPACES: Record<string, Workspace[]>`（工具名 → 可用工作区，唯一真源）过滤后喂给 `streamText`。新增 form/data 工具时只需在这张表里加一行，架构不用改。

### 4.2 首批 10 个 map 工具 ✅

比最初设计的 6 个多了 4 个：研究证明 `buffer-circle`（`MapboxBufferCircle` 声明式组件）、`add-geojson`（`MapboxLayer` 声明式渲染）、`export-image`（`useMapExport({mapId})` 同样支持组件树外注册表逃生舱口）、`measure-distance`（纯 haversine 计算，不需要地图实例）都**不需要扩展 `@movk/mapbox` 包**即可实现，比原计划推迟的范围小得多。

| 工具名 | 类型 | 文件 |
| --- | --- | --- |
| `fly-to` | 客户端派发（校验回显） | [server/mcp/tools/fly-to.ts](../../server/mcp/tools/fly-to.ts) |
| `fit-bounds` | 客户端派发（校验回显） | [server/mcp/tools/fit-bounds.ts](../../server/mcp/tools/fit-bounds.ts) |
| `set-basemap` | 客户端派发（校验回显） | [server/mcp/tools/set-basemap.ts](../../server/mcp/tools/set-basemap.ts) |
| `add-marker` | 客户端派发（服务端生成 markerId） | [server/mcp/tools/add-marker.ts](../../server/mcp/tools/add-marker.ts) |
| `remove-marker` | 客户端派发（校验回显） | [server/mcp/tools/remove-marker.ts](../../server/mcp/tools/remove-marker.ts) |
| `buffer-circle` | 客户端派发（服务端生成 circleId） | [server/mcp/tools/buffer-circle.ts](../../server/mcp/tools/buffer-circle.ts) |
| `add-geojson` | 客户端派发（服务端生成 layerId） | [server/mcp/tools/add-geojson.ts](../../server/mcp/tools/add-geojson.ts) |
| `export-image` | 客户端派发（校验回显） | [server/mcp/tools/export-image.ts](../../server/mcp/tools/export-image.ts) |
| `measure-distance` | 真正服务端执行（haversine） | [server/mcp/tools/measure-distance.ts](../../server/mcp/tools/measure-distance.ts) |
| `convert-coordinate` | 真正服务端执行（`gcoord`） | [server/mcp/tools/convert-coordinate.ts](../../server/mcp/tools/convert-coordinate.ts) |

> 边界校验：`add-geojson` 的坐标经纬度加了 `[-180, 180]` / `[-90, 90]` 范围约束，并在 handler 内按几何类型强制最少点数（line ≥ 2、polygon ≥ 3）；`measure-distance` 的坐标同样加了范围约束。客户端派发前另用工具回显 zod schema `safeParse` 兜底，拒绝 handler 抛错的 `{ error }` 与畸形输出（见 4.3）。

推迟到 Tier 3：`search-poi`（无对应 composable，需接天地图 POI Web 服务）、绘制类工具（`useMapboxDraw` 无 id 逃生舱口）。`convert-coordinate` 实际改用直接依赖 `gcoord`（而非 `@movk/mapbox/utils/coordinate`），见 7.2 的踩坑记录。

### 4.3 客户端分发机制 ✅

- [app/composables/useMapWorkspace.ts](../../app/composables/useMapWorkspace.ts)：`useState` 承载 `markers`/`basemap`/`geojsonLayers`/`bufferCircles` 四类响应式状态，供 `map.vue` 声明式渲染消费。对外只暴露 `setState(next)`（整体替换）与 `createMapWorkspaceState()`（初始 / 复位值工厂），不再提供 `addMarker`/`removeMarker` 等命令式增量方法——状态一律由分发器归约后整体写入。
- [app/pages/workspace/map.vue](../../app/pages/workspace/map.vue)：`MapboxMap` 加 `map-id="workspace-map"`，`<MapboxTiandituLayer>`/`<MapboxMarker v-for>`/`<MapboxLayer v-for>`/`<MapboxBufferCircle v-for>` 绑定 `useMapWorkspace()` 的状态。
- [app/utils/map-tool-applicators.ts](../../app/utils/map-tool-applicators.ts)：**工具名 → 客户端应用逻辑的唯一真源**。每个被派发工具登记 `{ kind, output, reduce | effect }`，`HANDLED` 集合与分类均由此表派生：
  - `kind: 'state'` → `reduce(draft, output)`：把输出归约进状态草稿（`set-basemap`/`add-marker`/`remove-marker`/`buffer-circle`/`add-geojson`）。
  - `kind: 'camera'` → `effect(ctx, output, animate)`：`fly-to`/`fit-bounds`，先经 `omitUndefined`（`@movk/core`）剔除未提供的相机键，根治 7.1 的 `undefined` 键污染；`fly-to` 省略 `duration` 时走 mapbox 默认飞行动画。
  - `kind: 'action'` → `effect(ctx, output)`：`export-image` 一次性副作用。
  - `output` 是运行时 zod schema，客户端据此 `safeParse` 校验并推导类型（消除 `as` 强转），handler 抛错回显的 `{ error }` 与畸形输出解析失败即被跳过。
- [app/composables/useMapToolDispatch.ts](../../app/composables/useMapToolDispatch.ts)：无模板的纯逻辑 composable，签名 `useMapToolDispatch(messages, workspace, chatId)`。`camera`（`useMapboxCamera({mapId})`）与 `mapExport`（`useMapExport({mapId})`）在 setup 阶段一次性构造（不要放进 `watchEffect` 回调按次构造，否则脱离组件同步栈触发 Vue 注入警告）。核心是 `watchEffect(recompute)`：
  - **状态类 = 消息纯归约**：每次从 `createMapWorkspaceState()` 起，按序归约当前全部 `output-available` 工具输出，得到完整状态后整体 `setState`。状态即「当前消息的纯函数」——切换会话、新建、编辑、重生成、删除消息都自动收敛，**无累积泄漏、无需手动重置**（取代旧的「命令式增量 + 全量重放」，见 7.4）。
  - **相机 / 动作 = fire-once-on-new**：按 `toolCallId` 去重（`firedEffects`）。`bulkApplied` 区分「会话首屏批量落位」（相机只取最后一个且不带动画、动作只标记不重放，避免刷新时逐个重放飞行动画与重复下载）与「流式实时」（新输出即时应用、相机带动画）。
  - **切换会话重置**：`watch(chatId)` 清空 `firedEffects` 并重置 `bulkApplied`，下一次消息归约即按「首屏批量落位」重放目标会话。
  - **渲染节流**：流式期每 token 都会触发 `recompute`，用状态签名（`JSON.stringify(draft)`）守卫，仅归约结果变化时才 `setState`。
  - **SSR 守卫**：整个注册包在 `if (import.meta.client)` 内（见 7.2）。
- [app/components/CopilotPanel.vue](../../app/components/CopilotPanel.vue)：在 `messages`/`workspace`/`chatId` 所在作用域调用一次 `useMapToolDispatch(messages, workspace, chatId)`；`CopilotPanel` 是 layout 级常驻组件，只 setup 一次，composable 内部按 `workspace.value !== 'map'` 守卫。

### 4.4 Prompt 设计 ✅

[server/utils/copilot.ts](../../server/utils/copilot.ts) 的 `WORKSPACE_BRIEF.map` 已扩展为：完整工具清单（含每个工具何时该调用）+ 坐标格式规范（WGS84、经度在前）+ 坐标系混淆处理（GCJ02/BD09 先调用 `convert-coordinate` 转换）+ 地名歧义处理策略（优先据地理知识直接调用工具执行，只在真正有歧义时才反问，不臆造坐标）。

### 4.5 `/mcp` 端点访问控制 ✅

[server/mcp/index.ts](../../server/mcp/index.ts) 用 `defineMcpHandler({ middleware })` 鉴权。**注意**：不能只判断 `!session.id`——`nuxt-auth-utils` 会给每个匿名请求自动下发一个 `session.id`（这正是 `/api/chats` 等接口拿它当匿名用户 id 的机制），永远非空，等于鉴权形同虚设。必须判断 `!session.user?.id`（真实登录用户），未登录返回 401。

### 4.6 接入 `streamText` ✅

[server/api/chats/[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) 的 `tools: {}` 占位符已替换为 `tools: getToolsForWorkspace(chat.workspace)`。

## 5. 已知限制

`app/layouts/default.vue` 的 `<slot/>` 外没有 `<KeepAlive>`，切走 `/workspace/map` 会卸载 `<MapboxMap>`。若某次 map 工作区的工具输出在用户已切到 form/data 之后才 resolve，`useMapboxCamera({ mapId })` 内部等待地图加载的 promise 永远不会 resolve——静默无效果，不报错。可接受，后续如需要可给 `<slot/>` 包 `<KeepAlive>`。

## 6. 关键文件

- [server/api/chats/[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) —— 接入 `getToolsForWorkspace(chat.workspace)`
- [server/utils/tools.ts](../../server/utils/tools.ts) —— mcp-toolkit → AI SDK 桥接
- [shared/utils/tool-workspaces.ts](../../shared/utils/tool-workspaces.ts) —— `TOOL_WORKSPACES` 工具 → 工作区过滤表
- [server/utils/copilot.ts](../../server/utils/copilot.ts) —— `copilotSystemPrompt`/`WORKSPACE_BRIEF.map`
- [server/mcp/index.ts](../../server/mcp/index.ts) —— `/mcp` 鉴权中间件
- [server/mcp/tools/](../../server/mcp/tools/) —— 10 个工具定义
- [app/composables/useMapWorkspace.ts](../../app/composables/useMapWorkspace.ts) —— 共享响应式地图状态
- [app/composables/useMapToolDispatch.ts](../../app/composables/useMapToolDispatch.ts) —— 客户端派发器（消息纯归约 + 相机/动作 fire-once + chatId 重置 + 错误输出守卫）
- [app/utils/map-tool-applicators.ts](../../app/utils/map-tool-applicators.ts) —— 工具 → 客户端应用逻辑注册表（zod 输出 schema + reduce/effect），`HANDLED` 与分类的唯一真源
- [app/utils/quick-chats.ts](../../app/utils/quick-chats.ts) —— Copilot 侧栏快捷提示文案，覆盖全部 10 个工具
- [app/components/CopilotPanel.vue](../../app/components/CopilotPanel.vue) —— `messages`/`workspace` 所在作用域，调用 `useMapToolDispatch`
- [app/components/chat/message/MessageContent.vue](../../app/components/chat/message/MessageContent.vue) —— `TOOL_STATUS_LABELS` 中文工具状态文案
- [app/pages/workspace/map.vue](../../app/pages/workspace/map.vue) —— `map-id` + 声明式渲染 `useMapWorkspace()` 状态
- [shared/utils/workspace.ts](../../shared/utils/workspace.ts) —— `Workspace` 类型与 `WORKSPACES` 常量

## 7. 踩坑记录（真实 bug 根因，供以后排查参考）

排查这两个 bug 时走过几次错误诊断，记录下来避免以后重蹈——**遇到 mapbox-gl 报错先检查 options 里有没有值为 `undefined` 的键，而不是先怀疑加载时序或投影类型**。

### 7.1 `failed to invert matrix`：不是加载时序、不是 globe 投影，是 `undefined` 键污染

**真正根因**：给 mapbox-gl 的 `flyTo`/`fitBounds` 传 options 对象时，`zoom`/`pitch`/`bearing`/`padding` 等可选字段即便值是 `undefined` 也**始终把键写进对象**（如 `{ zoom: o.zoom as number | undefined }`，当 `o.zoom` 为 `undefined` 时，对象仍有 `zoom` 这个键，只是值是 `undefined`）。mapbox-gl 内部按 `'key' in options` 判断该字段是否被指定，不是判断 `!== undefined`——一旦判断"已指定"就会拿 `undefined` 参与插值运算，产出 `NaN`，污染 transform 矩阵，抛 `Uncaught Error: failed to invert matrix`。**只要调用只指定了部分相机参数**（比如只给 `zoom` 没给 `bearing`）就会命中，与用 `flyTo` 还是 `jumpTo`、`globe` 还是 `mercator` 投影都无关。`@movk/mapbox` 自己的 `Map.vue` 其实早有注释点出这个坑（"剔除 undefined：mapbox jumpTo 以 `key in options` 判定，`+undefined` 会得 NaN 污染相机矩阵"），只是 [useMapToolDispatch.ts](../../app/composables/useMapToolDispatch.ts) 重新构造 options 时没有照做。

**修复**：只在字段确实不是 `undefined` 时才把对应键并入 options 对象，其余情况完全不出现该键。

**排查中走过的两条错误诊断（均已验证证伪并撤回）**：

1. 怀疑 `useMapboxCamera` 的 `whenLoaded()`（mapbox-gl `'load'` 事件）与容器 `ResizeObserver` 修正之间存在时序竞争，给 `@movk/mapbox` 包的 `context.ts` 加了 `instance.resize()`。用 `pnpm link` 验证时，链接目标在 Vite 默认允许目录之外，`@movk/mapbox/dist/runtime/index.css`（定义 `.movk-mapbox__container { position:absolute; inset:0 }`，地图容器的实际尺寸靠它）被 Vite 拦截报 `outside of Vite serving allow list`——这是**验证方式自己引入的假象**：CSS 没加载导致容器确实没尺寸，看起来像是尺寸竞争，但撤回 link 用发布版复测后崩溃依旧。
2. 怀疑 `projection: 'globe'` 在相机缓动时矩阵退化，改成 `mercator`。改了之后崩溃依旧，证明投影类型也不是原因。

结论：**先看数据（options 对象实际长什么样），再动包源码或视觉配置**——两次错误诊断都是在没有先打印/检查实际传入 mapbox-gl 的参数值之前就动了更底层的东西。

### 7.2 `MapboxMarker` hydration 不匹配：分发器不该在 SSR 阶段跑

`useMapToolDispatch` 的 `watchEffect` 此前没有做客户端守卫，会在 SSR 阶段也执行一次——把 `add-marker` 等工具输出写进 [useMapWorkspace.ts](../../app/composables/useMapWorkspace.ts) 的共享 `useState`，导致 SSR 渲染出的 `MapboxMarker` DOM 结构和纯客户端 hydration 阶段的渲染结果不一致，触发 Vue hydration mismatch 警告。**这个分发器驱动的是纯客户端 Mapbox 实例，SSR 阶段执行毫无意义，只会带来副作用**。

**修复**：整个 `watchEffect` 注册包进 `if (import.meta.client) { ... }`。

### 7.3 `@movk/mapbox` 包本身的一个真实缺陷（未修，Tier 3 可顺手改）

`convert-coordinate` 最初想直接复用 `@movk/mapbox/utils/coordinate` 的 `transformPoint`，但该包 `package.json` 的 `./utils/*` 导出目标是不带扩展名的路径（`./dist/runtime/utils/*`）。Vite（客户端）容忍这种写法，但 Nitro（服务端）解析时报 `ENOENT`。改用直接依赖 `gcoord`（`transformPoint` 底层就是包了一层 `gcoord.transform`）绕开了这个问题，服务端可正常解析。这是 `@movk/mapbox` 包导出配置的一个真实缺陷，后续改包时可顺手把导出目标补上扩展名。

### 7.4 跨会话地图状态泄漏：命令式累加改「消息纯归约」

分发器早期用命令式增量（`addMarker`/`removeMarker` 直接改共享 `useState`）+ `dispatched` 去重 + `hydrated` 一次性水合。`CopilotPanel` 是 layout 常驻组件、`useMapToolDispatch` 只 setup 一次，切换会话时不重跑：旧会话的 marker / 图层 / 底图不会被清除，新会话的输出叠加其上（相机还逐个重放动画）；新建对话、编辑 / 重生成 / 删除消息同理残留。根因是「状态靠副作用累加」，每条失效路径都得单独补重置。

**修复**：把地图状态改为**当前消息的纯归约**——`markers`/`geojsonLayers`/`bufferCircles`/`basemap` = `reduce(全部 output-available 工具输出)`，每次消息变化整体重算并 `setState`。任意消息变化都自动收敛，无需为切换 / 编辑 / 重生成各写一处重置。相机 / 动作是副作用（非状态）无法归约，保留 fire-once-on-new + `watch(chatId)` 重置去重追踪。**教训：能表达成「状态 = f(输入)」的就不要用副作用累加维护——派生优于累加，一处逻辑覆盖全部失效路径。**

## 8. Tier 2/3 路线图（设计阶段，尚未实现）

Tier 1 落地前已一并设计好后续分层，记录在此供后续排期对照。

### 8.1 Tier 2 —— 进阶可视化（无需改包）

均为 `@movk/mapbox` 已有的声明式组件，走 `useMapWorkspace` 状态的同一模式纯增量扩展：

| 工具名 | 说明 |
| --- | --- |
| `toggle-3d-buildings` | `MapboxBuildingLayer`（官方 composite 3D 建筑）开关 |
| `set-terrain` | `MapboxTerrain`（raster-DEM 地形，exaggeration 夸张系数） |
| `add-heatmap` | `MapboxLayer` heatmap（点集 → 热力图，heatmap-weight/radius/color） |
| `add-cluster` | `MapboxClusterLayer`（大量点自动聚合） |

### 8.2 Tier 3 —— 需扩展 `@movk/mapbox`（源码在 `/Users/yixuanmiao/Projects/movk-mapbox`）

- **`search-poi`**：接天地图 POI Web 服务。包侧新增 `src/runtime/utils/tianditu-search.ts`（纯 fetch，封装 `api.tianditu.gov.cn/v2/search`，token 经 `getMapboxConfig().tiandituToken` 同步取得——已确认该 token 在 `runtimeConfig.public.mapbox`，客户端可见）+ `src/runtime/composables/useTiandituSearch.ts`（放进 `composables/` 即自动导入）。天地图返回坐标是 **GCJ02**，需 `transformPoint(..., 'GCJ02', 'WGS84')` 转换后再供 `add-marker` 落点。当前无现存 geocoding 代码，是 greenfield。
- **`draw-*`**（交互式绘制，如"让我手动画一个多边形"；已知几何仍走 Tier 1 的 `add-geojson`，不需要这个扩展）：镜像 `useMapboxCamera({mapId})` 的注册表逃生舱口模式。当前 `src/runtime/domains/map/draw.ts` 只有 `DrawKey` inject、无注册表；`useMapboxDraw.ts` 纯 inject、子树外抛错。改法：① 新增 `src/runtime/domains/map/draw-registry.ts`（镜像 `registry.ts` 的模块级 `Map<string, ShallowRef<MapboxDraw>>`）；② `components/extensions/DrawControl.vue` 挂载时用 `useMap()` 拿到的 `ctx.id` 注册、卸载注销（一张地图一个 draw 控件，key 用父地图 map-id）；③ 扩展 `useMapboxDraw(options?: { mapId })`，传 mapId 时查注册表、否则回退 `inject(DrawKey)`（镜像 `resolve.ts` 的 `useContextResolver`）。
- **发布流程**：包内实现 → `playgrounds/play` 验证 → `pnpm build` → bump patch version → `pnpm release`（`before:init` 跑 lint+typecheck+test）+ `npm publish` → studio 侧 `pnpm up @movk/mapbox` 后接入对应工具（新增 `server/mcp/tools/*.ts` + `useMapToolDispatch` 分支 + `TOOL_WORKSPACES` 映射）。`pnpm-workspace.yaml` 已有 `minimumReleaseAgeExclude: ['@movk/mapbox@1.0.1']`，说明这类自用包快速发版验证是既有工作流。
