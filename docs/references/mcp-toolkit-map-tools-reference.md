# AI 工具调用参考资料：@nuxtjs/mcp-toolkit 落地 map 工作区工具

> 面向 movk-studio「GIS Copilot」工具调用能力的实现参考。整理手写 tools 与 mcp-toolkit 两种方案的对比、`@movk/mapbox` 真实可调用接口清单，22 个 map 工具的落地结果与契约层架构，以及若干真实 bug 的根因排查记录。当前形态：契约（`shared/utils/tools/map/`）+ handler（`server/mcp/tools/`）+ applicator（`app/utils/map-tool-applicators.ts`）三层，天地图能力全部经 `createTianditu` 客户端。绘制类工具（Tier 3）已随包侧的 `useMapboxDraw({ mapId })` 跨树能力一并落地，见 8。

## 1. 背景

[server/api/chats/[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) 里 `streamText` 的 `tools: {}` 曾是空占位符，注释写着「GIS 工具在 shared/utils/tools/ 落地后于此注册：flyTo / addLayer / queryPoi / annotate / setPitch 等」。此前 Copilot 只能用文字描述地图操作，不能真正驱动地图；现已接入 `getToolsForWorkspace(chat.workspace)`（见 4.7）。

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

### 3.3 绘制 —— 有 id 逃生舱口（已接入，见 8）

```ts
useMapboxDraw({ mapId }) // → { draw, whenReady, changeMode, add, deleteAll, setFeatureProperty, getAll, getMode }
```

1.1.x 的 `useMapboxDraw()` 只有 `inject`，子树外抛错，`CopilotPanel` 够不到。1.2.0 起它返回**绘制上下文对象**，传 `mapId` 即可在 `<MapboxDrawControl>` 子树外驱动，与 3.1 的相机同构：

- 写操作（`changeMode` / `add` / `deleteAll` / `setFeatureProperty`）返回 `Promise`，内部等待绘制实例就绪后执行，并同步控件的 `v-model:features` / `v-model:mode`。
- 读操作（`getAll` / `getMode`）同步返回，未就绪时为 `undefined`（它们常在 `computed` 里反复求值，故不告警）。
- 目标地图必须显式设置 `map-id`——没设的地图不进注册表，`map.vue` 已有 `map-id="workspace-map"`。
- 未注册控件时：写操作 `logger.warn` 空操作，`whenReady()` **reject 明确错误**而非返回永不 resolve 的 promise（刻意规避 5 记录的静默悬挂）。

> ⚠️ 破坏性变更：`useMapboxDraw()` 的返回值由 `ShallowRef<MapboxDraw | undefined>` 变为上下文对象，裸实例移到 `draw` 字段。顺带修掉了「裸实例调 `deleteAll()` 不回写 `v-model:features`」的模型失配——同步逻辑现在只有上下文一处实现，`defineExpose` 与跨树门面共用。

### 3.4 纯函数与 Web 服务 —— 真正能在服务端完整执行的能力

```ts
import { transformPoint, transformGeoJSON } from '@movk/mapbox/utils/coordinate'
// transformPoint(point: [number, number], from: CRS, to: CRS, options?: { precision?: number }): [number, number]
// CRS = 'WGS84' | 'GCJ02' | 'BD09' | 'EPSG3857'

import { createTianditu } from '@movk/mapbox/utils/tianditu-client'
// createTianditu({ tk }) → { search, locate, searchNearby, geocode, reverseGeocode, administrative, route }
```

不涉及任何地图实例，是 `handler` 里能"真正干活"而不是校验回显的工具来源——坐标转换与全部天地图 Web 服务。1.1.0 起天地图逻辑收敛为 `createTianditu({ tk })` 工厂（`tk` 注入一次），裸函数仍逐个导出供树摇/测试。

### 3.5 无对应能力（需推迟或需外部集成）

- **通用任意图层添加**：没有命令式 `addLayer`，且完整支持任意 `paint`/`layout` schema 的输入远比"加一个标注点"复杂，需等标注/底图这类声明式状态方案验证过后再评估。

> POI 查询原本记录在这一节（`@movk/mapbox` 没有 POI 搜索 composable），现已由包侧的 `createTianditu` 客户端提供（见 4.3），不再是无对应能力。

## 4. 落地结果（22 个工具，已实现）

### 4.1 契约层：一个工具只有一个「长什么样」的答案 ✅

早期实现把一个工具摊在四张按工具名索引的表里——`server/mcp/tools/<name>.ts`（描述 + 输入 schema + handler）、`app/utils/map-tool-applicators.ts`（**又一份手抄的输出 schema** + 落图逻辑）、`shared/utils/tool-workspaces.ts`（工具名 → 工作区）、`MessageContent.vue` 的 `TOOL_STATUS_LABELS`（工具名 → 中文文案）。漏改一处不报错，只静默失效；`fly-to`/`fit-bounds`/`set-basemap`/`remove-marker` 的 handler 是 `return input`，两份 schema 逐字相同却分居两地，可以无声漂移。

现在收敛为三层，每层回答一个正交问题：

| 问题 | 位置 |
| --- | --- |
| 它长什么样（描述、输入、输出、工作区、状态文案、annotations） | [shared/utils/tools/map/](../../shared/utils/tools/map/) 契约 |
| 它在服务端算什么 | [server/mcp/tools/](../../server/mcp/tools/) 的 handler |
| 它对地图做什么 | [app/utils/map-tool-applicators.ts](../../app/utils/map-tool-applicators.ts) |

契约按域分文件（`camera.ts` / `annotation.ts` / `visualization.ts` / `compute.ts` / `tianditu.ts` / `draw.ts`），`map/index.ts` 汇总为 `MAP_TOOLS`，再由 [shared/utils/tools/index.ts](../../shared/utils/tools/index.ts) 与 `FORM_TOOLS` 合并成 `TOOLS`：

```ts
export interface ToolContract {
  workspaces: Workspace[]
  description: string
  input: ZodRawShape          // 直接作为 defineMcpTool 的 inputSchema
  output?: ZodType            // 仅需驱动画布的工具声明；纯信息类工具省略
  status: [string, string]    // 聊天流的进行时 / 完成态文案
  annotations?: ToolAnnotations
}
```

> **落地 form 工作区时做过一次去 map 化泛化**：契约层从 `shared/utils/map-tools/` 迁到 `shared/utils/tools/`，`MapToolContract` / `MAP_TOOLS` / `getMapTool` 更名为 `ToolContract` / `TOOLS` / `getTool`——这七个字段无一处与地图耦合，是无损重命名。派发器同时泛型化为 `useToolDispatch<TState, TCtx>`，`useMapToolDispatch` 退化为注入地图状态与命令式实例的薄封装。**22 个 handler 零改动**（`mcpToolFrom` 与 `defineMcpTool` 都是自动导入，handler 文件根本不 import 契约层）。详见 [autoform-form-workspace-reference.md](./autoform-form-workspace-reference.md) 的 2.4 与 5.1。

关键在于 `defineMcpTool` 的 `inputSchema` 收的是 **ZodRawShape 裸对象**（不是 `z.object(...)`，模块自己包一层），所以同一份 shape 能直接喂服务端，客户端 `z.object(shape)` 后 `safeParse`。Nuxt 4 的 `shared/` 正是双端共用代码的位置，客户端本来就已 import zod，无包体回归。

由此派生并删除三处冗余：`shared/utils/tool-workspaces.ts` 整个删除；`TOOL_STATUS_LABELS` 删除（改读 `contract.status`，顺带补齐了此前从未登记、在聊天流里显示裸工具名的 6 个天地图工具）；[server/utils/mcp/tools.ts](../../server/utils/mcp/tools.ts) 里靠 `_meta.filename` 正则猜工具名的 `resolveToolName` 删除——工具名现在由 `mcpToolFrom` 从契约 key 显式写入。

服务端工具文件因此只剩它独有的东西：

```ts
// server/mcp/tools/fly-to.ts —— 全文
export default defineMcpTool({
  ...mcpToolFrom('fly-to'),
  handler: input => input
})
```

> `mcpToolFrom` 住在 [server/utils/mcp/mcp-tool.ts](../../server/utils/mcp/mcp-tool.ts) 而不是 `tools.ts`：后者 import 虚拟模块 `#nuxt-mcp-toolkit/tools.mjs`，而该虚拟模块反过来 import 各工具文件，工具文件若从 `tools.ts` 取定义就会成环。
>
> 它的返回类型必须**显式标注**为 `(typeof TOOLS)[N]['input']`。若交给 TS 推断，泛型 `N` 未实例化时它会在约束上做属性访问，把 `inputSchema` 求值成全部工具 shape 的并集，handler 的入参随之退化为 `any`——`pnpm typecheck` 会以 16 条 `TS7006 implicitly has an 'any' type` 报出来。

新增一个工具：契约加一条 → `server/mcp/tools/<name>.ts` 补 handler →（若要驱动画布）applicator 加一条。`createDefine<TState, TCtx>()` 产出的 `define()` 会在模块初始化时断言「有 applicator 就必须有 output schema」，避免忘写契约 output 导致运行时静默跳过。

> ⚠️ **新增工具文件后必须重启 dev server**。mcp-toolkit 的虚拟模块 `#nuxt-mcp-toolkit/tools.mjs` 只在启动时扫描 `server/mcp/tools/` 目录，HMR 不会重扫。不重启的话工具集里没有新工具，但 system prompt 里已经写了它——模型会把工具调用当成正文吐出来（`<tool_call>generate-form(, , ]...`），聊天流里没有工具气泡、画布毫无反应，却言之凿凿地说自己做完了。判据：**没有工具气泡而模型声称做了事，就是工具没注册**。详见 [autoform-form-workspace-reference.md](./autoform-form-workspace-reference.md) 的 9.1。

### 4.2 工具清单 ✅

`buffer-circle`（`MapboxBufferCircle` 声明式组件）、`add-geojson`（`MapboxLayer` 声明式渲染）、`export-image`（`useMapExport({mapId})` 同样支持组件树外注册表逃生舱口）、`measure-distance`（纯 haversine 计算）都**不需要扩展 `@movk/mapbox` 包**即可实现。

| 工具名 | 服务端 handler | 客户端 applicator |
| --- | --- | --- |
| `fly-to` | echo | `effect` 相机，`replayOnLoad` |
| `fit-bounds` | echo | `effect` 相机，`replayOnLoad` |
| `set-basemap` | echo | `reduce` |
| `add-marker` | 生成 markerId | `reduce`（累加） |
| `remove-marker` | echo | `reduce` |
| `buffer-circle` | 生成 circleId | `reduce`（累加） |
| `add-geojson` | 校验最少点数 + 生成 layerId | `reduce`（累加） |
| `toggle-3d-buildings` | echo | `reduce`（单值替换，关闭时置空） |
| `set-terrain` | 缺省夸张系数 1.5 | `reduce`（单值替换，关闭时置空） |
| `add-heatmap` | 生成 heatmapId + 求权重上界 | `reduce`（单值替换） |
| `add-cluster` | 生成 clusterId | `reduce`（单值替换） |
| `export-image` | 缺省文件名 | `effect` 动作，**不** `replayOnLoad` |
| `measure-distance` | haversine 直线距离 | 无（纯信息） |
| `convert-coordinate` | `transformPoint`（包） | 无（纯信息） |
| `geocode-place` | `geocode()` → 回退 `locate()` | 无（纯信息） |
| `search-poi` | `searchNearby()` | `reduce`（替换）+ `effect` fitBounds |
| `search-poi-in-area` | `administrative()` → `search({type:'district'})` | 同上（共用 applicator） |
| `reverse-geocode` | `reverseGeocode()` | 无（纯信息） |
| `get-administrative-boundary` | `administrative({boundary:true})` | `reduce`（单值替换）+ `effect` fitBounds |
| `plan-route` | `route()` | `reduce`（单值替换）+ `effect` fitBounds |
| `draw-shape` | echo | `effect` `changeMode` + 挂起 `color`，**不** `replayOnLoad` |
| `clear-drawing` | echo `{}` | `effect` `deleteAll`，**不** `replayOnLoad` |

> 边界校验：坐标经纬度一律带 `[-180, 180]` / `[-90, 90]` 范围约束；`add-geojson` 在 handler 内按几何类型强制最少点数（line ≥ 2、polygon ≥ 3）。客户端派发前再用契约 output schema `safeParse` 兜底（见 4.4）。

### 4.2.1 进阶可视化四工具的三个约束 ✅

1. **`MapboxBuildingLayer` 在 `empty-v9` 底样式下静默无效**。它默认读 `composite` / `building` 矢量源（见包内 `utils/building.ts` 的 `buildingLayerSpec`，注释已写明「天地图等空样式下无效」），而 [map.vue](../../app/pages/workspace/map.vue) 的底样式是 `mapbox://styles/mapbox/empty-v9` + 天地图栅格瓦片，压根没有这个源——挂上去不报错、也不出建筑。修复是用 `<MapboxSource>` 额外挂 `mapbox://mapbox.mapbox-streets-v8`（其 `building` 图层带 `height` / `min_height` / `extrude` 属性），再把 `source` / `sourceLayer` 指向它。
2. **`heatmapPaint()` 的 `weightProperty` 缺省是 `'temperature'`**。它来自 `@movk/mapbox/utils/heatmap`（utils 非自动导入，须显式 import；组件才是全局的）。map.vue 写进 feature 的属性名是 `w`，若不显式传 `weightProperty`，`['get', 'temperature']` 取到 `undefined`，插值出 `NaN`，整张热力图不显示。handler 侧同理：权重全为 0 时 `weightRange` 退化成 `[0, 0]`，线性插值除零，故兜底为 `[0, 1]`。
3. **这四个工具全部只写 `reduce`、不写 `effect`**。3D 建筑与地形只在 `pitch > 0` 时才看得出效果（建筑还要求 `zoom ≥ minzoom`，缺省 15），但倾斜相机不归它们管——交给已有的 `fly-to`，由 prompt 指导 AI 追加调用。原因不是洁癖：派发器水合时**只重放最后一个 `replayOnLoad` 的副作用**（见 4.4），若给 toggle 类工具加相机 effect，刷新页面时它会顶掉真正的 `fly-to`，视角对了、位置却丢了。

> 已知缺口：`add-heatmap` / `add-cluster` 没有对应的移除工具（两个 toggle 自带 `enabled: false` 关闭路径）。用户说「去掉热力图」时 AI 无工具可用。后续可考虑一个统一的 `clear-map({ targets })`，同时收编 `remove-marker` 的 `all` 分支。

### 4.3 天地图工具：`createTianditu` 客户端 + studio 薄适配 ✅

**代码归属**：天地图 HTTP 调用与响应解析全部在 `@movk/mapbox` 包内（`createTianditu({ tk })` 工厂），movk-studio 只写薄适配层——与 `coordinate.ts`（包）↔ `convert-coordinate.ts`（app）的既有分层一致。包本身不引入 `@nuxtjs/mcp-toolkit`，不感知 MCP 概念。

[server/utils/mcp/tianditu.ts](../../server/utils/mcp/tianditu.ts) 的 `useTianditu()` 读 `runtimeConfig.tiandituApiToken`（缺失抛 500），因 tk 恒定而进程内缓存 client 一次；六个 handler 因此瘦成一行式。该 token 必须是**服务端类型** key（IP 白名单），与浏览器端的 `NUXT_PUBLIC_MAPBOX_TIANDITU_TOKEN`（Referer 校验）不是同一种，见 7.5。

几处值得记的设计：

- **`geocode-place` 内部级联**：先试 `geocode()`（门址级精度，内置 score < 60 过滤，低置信度返回 `undefined`），未命中再走 `locate()`（利用天地图返回的 `suggestedDistrict` 二次收窄范围 + 同名精确匹配优先排序）。对 LLM 只暴露一个工具——它很难自行判断「这是门址还是地标」。handler 把 `locate()` 的 `SearchResult` 判别联合归一成扁平结果：`kind:'poi'` 取首个 POI 并附 `alternatives`，`kind:'area'` 取行政区中心点，`kind:'suggestion'` 返回 `candidates` 交给 LLM 反问用户，其余为 `{ found: false }`。**空结果是正常返回，不抛错**。
- **`search-poi-in-area` 内部两跳**：天地图行政区检索按国标码限定范围，而 LLM 只知道行政区名，所以 handler 先 `administrative(areaName, { boundary: false })` 拿 code，再 `search({ type: 'district', specify: code, keyword })`。同样对 LLM 只暴露 `{ areaName, keyword }`。
- **几何绝不回流 LLM**：`plan-route` 一条路线实测 83 个点（长途几百个）。**没有**让 AI 把路径坐标从 `plan-route` 输出再抄进 `add-geojson` 入参——那会让几百个坐标以工具调用 JSON 穿过 LLM，token 贵、易截断。做法：`path` 由 applicator 的 `reduce` 直接落图，`distanceKm`/`durationMinutes` 标量留在输出供 LLM 口述。`get-administrative-boundary` 同理。
- **状态语义**：`pois` 是**赋值替换**而非累加（每次搜索是「当前展示」，不跨轮次累积）；`adminBoundary`/`route` 是单值几何、每次调用替换。只有 `markers`/`bufferCircles`/`geojsonLayers` 是累加。
- **自动落位**：`search-poi`/`search-poi-in-area`/`get-administrative-boundary`/`plan-route` 在 `reduce` 之外还带 `effect`，落图后自动 `fitBounds` 到结果几何。`useMapboxCamera().fitBounds` 声明的是 `target: LngLatBoundsLike | GeoJSON`（自动求包围盒），所以直接把 `path`/`boundary`/POI 的 `MultiPoint` 传进去即可，**不需要手写 bbox 计算**，也不用赌天地图 `mapinfo.scale` 与 mapbox zoom 的映射关系（故 `plan-route` 输出丢弃 `center`/`scale`）。`FIT_OPTIONS` 限制 `maxZoom`，避免单点结果的退化包围盒把相机贴地放大。

### 4.4 客户端分发机制 ✅

- [app/composables/useMapWorkspace.ts](../../app/composables/useMapWorkspace.ts)：**单个** `useState<MapWorkspaceState>('map-workspace', createMapWorkspaceState)` 承载全部状态。早期是 7 个 `useState` + `setState` 里 7 行逐字段赋值，加一个状态字段要改三处；现在只需改 `MapWorkspaceState` 与 `createMapWorkspaceState`。`MapPoi` 直接对齐包的 `Poi` 形状（`location: [lng, lat]` 元组），省去 handler 侧的字段搬运。
- [app/pages/workspace/map.vue](../../app/pages/workspace/map.vue)：`MapboxMap` 加 `map-id="workspace-map"`，`<MapboxTiandituLayer>`/`<MapboxMarker v-for>`/`<MapboxLayer v-for>`/`<MapboxBufferCircle v-for>` 绑定该状态声明式渲染。
- [app/utils/map-tool-applicators.ts](../../app/utils/map-tool-applicators.ts)：**工具名 → 客户端应用逻辑**，派发器的 `handled` 集合由此表派生。早期是 `StateApplicator`/`EffectApplicator`（`kind: 'camera' | 'action'`）三个 interface + 三个工厂函数 + `kind` 判别，而 `kind` 真正编码的只有两位信息；「落图 + 自动相机」恰好是这个互斥模型表达不了的组合。现在合一（泛化后住在 [app/utils/tool-applicators.ts](../../app/utils/tool-applicators.ts)，map 绑定 `TState = MapWorkspaceState` / `TCtx = MapEffectContext`）：

  ```ts
  export interface ToolApplicator<TState, TCtx> {
    reduce?: (draft: TState, output: never) => void            // 状态：随消息重放，必须幂等
    effect?: (ctx: TCtx, output: never, animate: boolean) => void  // 副作用：按 toolCallId 只触发一次
    replayOnLoad?: boolean                                     // 首屏批量落位时是否重放
  }
  ```

  `output` schema 不在这里——它属于契约。`fly-to`/`fit-bounds` 的 effect 先经 `omitUndefined`（`@movk/core`）剔除未提供的相机键，根治 7.1 的 `undefined` 键污染。
- [app/composables/useToolDispatch.ts](../../app/composables/useToolDispatch.ts)：泛型派发器，无模板的纯逻辑 composable。[useMapToolDispatch.ts](../../app/composables/useMapToolDispatch.ts) 是它的薄封装，签名仍是 `useMapToolDispatch(messages, workspace, chatId)`，负责注入 `useMapWorkspace()` 与 ctx。`camera`（`useMapboxCamera({mapId})`）与 `mapExport`（`useMapExport({mapId})`）在 setup 阶段一次性构造（不要放进 `watchEffect` 回调按次构造，否则脱离组件同步栈触发 Vue 注入警告）。核心是 `watchEffect(recompute)`：
  - **状态 = 消息纯归约**：每次从 `createMapWorkspaceState()` 起，按序归约当前全部 `output-available` 工具输出，整体写入。状态即「当前消息的纯函数」——切换会话、新建、编辑、重生成、删除消息都自动收敛，**无累积泄漏、无需手动重置**（取代旧的「命令式增量 + 全量重放」，见 7.4）。
  - **副作用 = fire-once-on-new**：单个 `seen: Set<string> | null` 同时表达「已触发过的 toolCallId」与「当前会话是否已水合」（`null` 即未水合）。水合时把全部 id 记入 `seen`、只重放最后一个 `replayOnLoad` 的副作用且不带动画（避免刷新时逐个重放飞行动画、重复触发导出下载）；之后每个新 id 即时应用、相机带动画。`watch(chatId)` 把 `seen` 置回 `null` 即完成切换会话的重置。
  - **渲染节流**：流式期每 token 都会触发 `recompute`，用状态签名（`JSON.stringify(draft)`）守卫，仅归约结果变化时才写入。
  - **一处看似冗余、实则必要的守卫**：`parseOutput` 里的 `'error' in output` 前置检查不能删。`execute` 捕获异常后回显 `{ error }`，而 `remove-marker` 的输出字段全为 optional——`{ error: '...' }` 剥离未知键后是合法空对象，**能通过 `z.object` 校验**，进而误触发「移除最近一个标注」。
  - **SSR 守卫**：整个注册包在 `if (import.meta.client)` 内（见 7.2）。
- [app/components/CopilotPanel.vue](../../app/components/CopilotPanel.vue)：在 `messages`/`workspace`/`chatId` 所在作用域调用一次 `useMapToolDispatch(messages, workspace, chatId)`（form 的派发器与它并列挂在同一处）；`CopilotPanel` 是 layout 级常驻组件，只 setup 一次，派发器内部按 `workspace.value !== target` 守卫。

### 4.5 Prompt 设计 ✅

[server/utils/chat-prompts.ts](../../server/utils/chat-prompts.ts) 的 `WORKSPACE_BRIEF.map`：完整工具清单 + 坐标格式规范（WGS84、经度在前）+ 坐标系混淆处理（GCJ02/BD09 先 `convert-coordinate`）+ 地名解析纪律（先 `geocode-place`，`candidates`/`alternatives` 时反问用户而非臆造）+ 工具选型规则（真实路径用 `plan-route` 而非 `add-geojson` 直线；行政区范围用 `get-administrative-boundary` 而非 `buffer-circle`）。

自动落位落地后，**删除**了原有的「调用 X 后再调 fit-bounds」编排指令，改为明确告知 AI 这四个工具会自行落位、无需追加相机调用——prompt 里每条模型不需要遵守的规则都在稀释它对其余规则的注意力。

### 4.6 `/mcp` 端点访问控制 ✅

[server/mcp/index.ts](../../server/mcp/index.ts) 用 `defineMcpHandler({ middleware })` 鉴权。**注意**：不能只判断 `!session.id`——`nuxt-auth-utils` 会给每个匿名请求自动下发一个 `session.id`（这正是 `/api/chats` 等接口拿它当匿名用户 id 的机制），永远非空，等于鉴权形同虚设。必须判断 `!session.user?.id`（真实登录用户），未登录返回 401。

### 4.7 接入 `streamText` ✅

[server/api/chats/[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) 的 `tools: {}` 占位符已替换为 `tools: getToolsForWorkspace(chat.workspace)`。

## 5. 已知限制

`app/layouts/default.vue` 的 `<slot/>` 外没有 `<KeepAlive>`，切走 `/workspace/map` 会卸载 `<MapboxMap>`。若某次 map 工作区的工具输出在用户已切到 form/data 之后才 resolve，`useMapboxCamera({ mapId })` 内部等待地图加载的 promise 永远不会 resolve——静默无效果，不报错。可接受，后续如需要可给 `<slot/>` 包 `<KeepAlive>`。

## 6. 关键文件

契约层：

- [shared/utils/tools/map/](../../shared/utils/tools/map/) —— 22 个工具的契约（`camera` / `annotation` / `visualization` / `compute` / `tianditu` / `draw` 六个域文件 + `index.ts` 汇总 `MAP_TOOLS`）
- [shared/utils/tools/index.ts](../../shared/utils/tools/index.ts) —— `TOOLS` / `getTool` / `ToolOutput<N>`，与工作区无关
- [shared/utils/workspace.ts](../../shared/utils/workspace.ts) —— `Workspace` 类型与 `WORKSPACES` 常量

服务端：

- [server/utils/mcp/mcp-tool.ts](../../server/utils/mcp/mcp-tool.ts) —— `mcpToolFrom(name)`，契约 → `defineMcpTool` 描述性字段
- [server/utils/mcp/tools.ts](../../server/utils/mcp/tools.ts) —— mcp-toolkit → AI SDK 桥接，按契约的 `workspaces` 过滤
- [server/utils/mcp/tianditu.ts](../../server/utils/mcp/tianditu.ts) —— `useTianditu()` 客户端单例 + `toPoiResults()`
- [server/utils/chat-prompts.ts](../../server/utils/chat-prompts.ts) —— `copilotSystemPrompt` / `WORKSPACE_BRIEF.map`
- [server/utils/workspace-context.ts](../../server/utils/workspace-context.ts) —— 按工作区 zod 校验并分发客户端上下文快照
- [server/utils/drawn-features.ts](../../server/utils/drawn-features.ts) —— `summarizeDrawnFeatures()`，手绘要素 → system prompt 摘要
- [server/mcp/tools/](../../server/mcp/tools/) —— 22 个 handler，每个文件只剩它独有的计算
- [server/mcp/index.ts](../../server/mcp/index.ts) —— `/mcp` 鉴权中间件
- [server/api/chats/[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) —— 接入 `getToolsForWorkspace(chat.workspace)`

客户端：

- [app/utils/tool-applicators.ts](../../app/utils/tool-applicators.ts) —— `ToolApplicator<TState, TCtx>` 与 `createDefine()`
- [app/utils/map-tool-applicators.ts](../../app/utils/map-tool-applicators.ts) —— 工具 → 「对地图做什么」（`reduce` / `effect` / `replayOnLoad`），派发器的 `handled` 由此派生
- [app/composables/useToolDispatch.ts](../../app/composables/useToolDispatch.ts) —— 泛型派发器（消息纯归约 + 副作用 fire-once + `seen` 单变量水合 / 重置 + 错误输出守卫）
- [app/composables/useMapToolDispatch.ts](../../app/composables/useMapToolDispatch.ts) —— map 的薄封装，注入地图状态与相机 / 导出 / 绘制实例
- [app/composables/useMapWorkspace.ts](../../app/composables/useMapWorkspace.ts) —— 单个 `useState` 承载全部地图状态
- [app/composables/useWorkspaceContext.ts](../../app/composables/useWorkspaceContext.ts) —— 按工作区产出上传给服务端的上下文快照（手绘要素从这里走）
- [app/composables/useDrawnFeatures.ts](../../app/composables/useDrawnFeatures.ts) —— 手绘要素独立 `useState`（刻意不进纯归约状态，见 8.2）+ `usePendingDrawColor()` 挂起颜色
- [app/pages/workspace/map.vue](../../app/pages/workspace/map.vue) —— `map-id` + 声明式渲染 + `<MapboxDrawControl>`（`drawThemeStyles` + `@create` 落色）
- [app/components/CopilotPanel.vue](../../app/components/CopilotPanel.vue) —— 调用 `useMapToolDispatch` 的作用域
- [app/components/chat/message/MessageContent.vue](../../app/components/chat/message/MessageContent.vue) —— 工具状态文案（读契约的 `status`）
- [app/utils/quick-chats.ts](../../app/utils/quick-chats.ts) —— Copilot 侧栏快捷提示，写成带动机的真实场景（常触发多工具串联），整体仍覆盖全部工具与关键参数路径

`@movk/mapbox` 包（源码在 `/Users/yixuanmiao/Projects/movk-mapbox`）：

- `src/runtime/utils/tianditu-client.ts` —— `createTianditu({ tk })` 工厂与 `TiandituError`
- `src/runtime/utils/tianditu-{request,search,geocoder,administrative,route}.ts` —— 天地图 HTTP 调用与响应解析（WKT / XML）
- `src/runtime/utils/coordinate.ts` —— `transformPoint` / `transformGeoJSON`
- `src/runtime/types/tianditu.ts` —— `Poi` / `SearchResult` / `RouteResult` 等公共类型
- `src/runtime/composables/useMapboxDraw.ts` —— 跨树绘制上下文（见 3.3、8.1）
- `src/runtime/utils/draw-theme.ts` —— `drawThemeStyles()`，`coalesce(user_color, 主题色)` 的完整 styles（见 8.2）

## 7. 踩坑记录（真实 bug 根因，供以后排查参考）

排查过程中走过若干次错误诊断，记录下来避免以后重蹈。贯穿全篇的教训只有一条：**先看真实数据（实际传入的 options、接口的真实响应），再动包源码、视觉配置或坐标系假设**。

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

### 7.3 `@movk/mapbox` 包本身的一个真实缺陷（已修复并已回收收益）

`convert-coordinate` 最初想直接复用 `@movk/mapbox/utils/coordinate` 的 `transformPoint`，但该包 `package.json` 的 `./utils/*` 导出目标是不带扩展名的路径（`./dist/runtime/utils/*`）。Vite（客户端）容忍这种写法，但 Nitro（服务端）解析时报 `ENOENT`。当时改用直接依赖 `gcoord`（`transformPoint` 底层就是包了一层 `gcoord.transform`）绕开。

**修复**：把导出目标改成 `"./dist/runtime/utils/*.js"`（本包 `nuxt-module-build` 产出的 runtime utils 实际扩展名是 `.js` 不是 `.mjs`——`package.json` 已有 `"type": "module"`，`.js` 本身就是 ESM）。Node 的 exports 通配符允许目标带静态后缀，`*` 只匹配请求路径里"不含扩展名的那一段"，已用最小复现验证：自建一个只含 `./utils/*` 导出的假包，`import('@pkg/utils/foo')` 能正确解析到 `dist/.../foo.js`。

**收益已回收**：`convert-coordinate` 现已改回 `transformPoint`，`gcoord` 从 movk-studio 的 `package.json` 移除。

> 类型的解析路径与运行时不同：`import type { Poi } from '@movk/mapbox/runtime/types'` 会报 `TS2307`，需要写全 `'@movk/mapbox/runtime/types/index.js'`（`./runtime/*` 的导出目标没有 `types` 条件，TS 不会补 `/index.d.ts`）。

### 7.4 跨会话地图状态泄漏：命令式累加改「消息纯归约」

分发器早期用命令式增量（`addMarker`/`removeMarker` 直接改共享 `useState`）+ `dispatched` 去重 + `hydrated` 一次性水合。`CopilotPanel` 是 layout 常驻组件、`useMapToolDispatch` 只 setup 一次，切换会话时不重跑：旧会话的 marker / 图层 / 底图不会被清除，新会话的输出叠加其上（相机还逐个重放动画）；新建对话、编辑 / 重生成 / 删除消息同理残留。根因是「状态靠副作用累加」，每条失效路径都得单独补重置。

**修复**：把地图状态改为**当前消息的纯归约**——`markers`/`geojsonLayers`/`bufferCircles`/`basemap` = `reduce(全部 output-available 工具输出)`，每次消息变化整体重算并 `setState`。任意消息变化都自动收敛，无需为切换 / 编辑 / 重生成各写一处重置。相机 / 动作是副作用（非状态）无法归约，保留 fire-once-on-new + `watch(chatId)` 重置去重追踪。**教训：能表达成「状态 = f(输入)」的就不要用副作用累加维护——派生优于累加，一处逻辑覆盖全部失效路径。**

### 7.5 天地图检索接口的两个真实坑：路径版本 + key 类型

实现 `geocode-place`/`search-poi` 时用真实 `NUXT_PUBLIC_MAPBOX_TIANDITU_TOKEN` 实测发现的两个问题，均已用请求验证，不是猜测：

1. **接口路径**：天地图官方文档（`lbs.tianditu.gov.cn/server/search.html`）展示的请求路径是 `http://api.tianditu.gov.cn/search`（无版本号），实测直接返回 `404`（`您请求的资源不存在`）。正确路径是 `https://api.tianditu.gov.cn/v2/search`——官方文档滞后于实际接口版本，不能直接照抄示例 URL，要先拿真实 key 验证一次。
2. **key 类型不匹配**：换成 `v2/search` 后返回 `{"code":301012,"msg":"权限类型错误","resolve":"Key权限类型为:浏览器端，请使用浏览器访问！"}`。天地图的 key 分**浏览器端**（按 `Referer` 头校验，专供前端直接调用，如瓦片加载）和**服务端**（按 IP 白名单校验，供后端调用）两种类型，现有 `NUXT_PUBLIC_MAPBOX_TIANDITU_TOKEN` 是浏览器端类型。用不同 `Referer` 值重试（包括不带 `Referer`）报错完全不变，证明这不是"缺个头就能过"的问题，而是 key 类型本身的硬限制——服务端调用检索接口必须用另一个专门申请的服务端类型 key。

**处理**：新增私有配置 `runtimeConfig.tiandituApiToken`（[nuxt.config.ts](../../nuxt.config.ts)，来自 `NUXT_TIANDITU_API_TOKEN`，与现有 `mapbox.tiandituToken` 分开、不做 `public` 暴露），5 个天地图工具的 handler 都读这个变量。用户已申请到服务端类型 key，包侧 5 个函数已用它实测通过（见 7.6）。

### 7.6 三个天地图接口的响应格式都与官方文档有出入（逆地理编码 / 行政区划 / 路线）

> 以下解析细节现已全部下沉到 `@movk/mapbox` 包内（`tianditu-geocoder.ts` / `tianditu-administrative.ts` / `tianditu-route.ts`），studio 侧不再感知。保留在此作为「天地图接口本身」的事实记录。

1. **逆地理编码 `/geocoder`**：端点**无 `/v2`**（与检索的 `/v2/search` 不同，容易想当然加上）。文档字段拼写是 `road_distince`/`address_distince`（打字错误），真实响应是 `road_distance`/`address_distance`；`status` 是字符串 `"0"` 不是数字；直辖市 `city` 为空串（用 `province` 兜底）。
2. **行政区划 `/v2/administrative`**：`boundary` 是 **WKT `MULTIPOLYGON` 字符串**（不是 GeoJSON、不是点数组），真实省市常含多个不相连的环（如上海 6 个多边形，含崇明/长兴/横沙/洋山等岛屿飞地）。`center` 用 `lng`/`lat`（不是 `lon`）。
3. **路线规划 `/drive`**：**响应是 XML，不是 JSON**（文档只有请求示例、「规划结果」标题下完全空白，未给任何响应字段表）。整条路线折线取根节点外层的 `<routelatlon>`（分号分隔的 lng,lat；已验证连续密集，不用拼 `<simple>` 分段）；`<distance>` 公里、`<duration>` 秒；转向摘要取 `<simple>` 段内的 `<strguide>`（`<routes>` 段也有 strguide，两段都取会重复）。

**共同教训**：天地图这套 Web 服务的文档质量普遍偏低（路径版本滞后、字段拼写错、响应格式漏写、JSON/XML 不统一），**每个接口接入前都必须用真实 tk 打一次真实请求、按实际响应写解析**，不能信文档示例。

### 7.7 `<MapboxDrawControl>` 必须包 `<ClientOnly>`：绘制注册表是进程级全局

接入绘制控件后，dev 期每打一次 `/workspace/map` 的 SSR 请求，服务端就多出一条 `map "workspace-map" already has a <MapboxDrawControl>; the latest one takes over` 警告，且**计数随请求单调递增**（连打 3 次请求，警告从 3 条涨到 6 条）。

**根因**：包的 `DrawControl.vue` 在 **`setup` 阶段**（不是 `onMounted`）调用 `registerDraw(drawContext)`，而 `draw-registry.ts` 的注册表是模块级 `shallowReactive(Map)`——在 Node 侧即**进程级全局，跨请求共享**。注销挂在 `onUnmounted`，服务端根本不执行。于是每个 SSR 请求都往同一张全局表里塞一个新的绘制上下文，只增不减：既是内存泄漏，也让并发请求互相覆盖对方的上下文。

客户端没有这个问题（注册表随页面加载重建），但这个分发链路本来就只驱动纯客户端的 mapbox 实例，SSR 期执行毫无意义——与 7.2 是同一类错误的不同表现。

**修复**：`map.vue` 里把 `<MapboxDrawControl>` 包进 `<ClientOnly>`。验证方式是连打若干次 SSR 请求后警告数不再增长。

> 教训与 7.2 相同：**任何只驱动浏览器实例的东西，都要挡住 SSR 执行路径**。7.2 挡的是 `watchEffect`，这里挡的是组件的 `setup`。包侧更彻底的修法是把 `registerDraw` 挪进 `onMounted`（或加 `import.meta.client` 守卫），可作为后续 issue 提给 `@movk/mapbox`。

### 7.8 一条被写进文档又被推翻的错误结论：天地图坐标不需要 GCJ02→WGS84 转换

本文档 4.8 节曾记录「解析出的坐标数组与 GeoJSON 同构后复用 `transformGeoJSON` 做 GCJ02→WGS84」。**这步转换本身是错的**，它给每个天地图返回的坐标引入了数百米的系统性偏移。

天地图使用 CGCS2000，与 WGS84 在民用精度下兼容，**坐标应原样透传**。`@movk/mapbox@1.1.0` 已从天地图代码路径移除 `gcoord`，类型注释里逐个字段写明「天地图坐标系 CGCS2000 与 WGS84 兼容，坐标原样透传」。

之所以会写错，是因为「国内地图服务 = 火星坐标」是个太顺手的先验——高德/腾讯/百度确实如此，天地图作为官方测绘服务恰恰不是。**验收方式**：对同一地名，转换版与透传版坐标差在数百米量级；把 marker 落在影像底图上目视比对，透传版才贴合实际位置。凡是「需要坐标系转换」的判断，都必须落到一次真实底图比对上，不能靠对服务商的印象推断。

## 8. Tier 3 绘制类（已落地）

> Tier 2 的四个进阶可视化工具（`toggle-3d-buildings` / `set-terrain` / `add-heatmap` / `add-cluster`）已落地，见 4.2 与 4.2.1，均为 `@movk/mapbox` 已有声明式组件的纯增量接入，未改包。
>
> 天地图接入类工具（6 个，见 4.3）同样已全部落地。包侧统一用纯 fetch 函数 + `createTianditu` 工厂、不做 `composables/useTiandituSearch.ts` 封装（唯一消费方是服务端 MCP 工具，不需要 Vue composable 这层；未来出现浏览器端直接调用场景再补）。
>
> 绘制类曾是唯一需要扩展包（源码在 `/Users/yixuanmiao/Projects/movk-mapbox`）的一类。包侧改造见 8.1，studio 侧接入见 8.2，两侧均已完成。
>
> 包的 `search()` 还有 5 种未被暴露为工具的 queryType（`inView`/`polygon`/`category`/`statistics` 等）。有意不暴露：LLM 靠 description 选工具，把 queryType 概念抛给它会显著降低选择准确率，且 `inView`/`polygon` 需要客户端回传当前视野 bounds，现有架构不支持。按真实高频场景增量补窄工具即可（`search-poi-in-area` 即由 `district` queryType 包装而来）。

### 8.1 包侧改造

`draw-registry.ts` / `draw-context.ts` / `useMapboxDraw` 重写 / `DrawControl` 改造均已落地，单测覆盖注册注销、跨树写操作的模型回写、就绪前排队、未注册降级。**实现与本节原先的构想有四处偏差，均由实测推翻**，接入时按实际形态写：

| 原构想 | 实际实现 | 原因 |
| --- | --- | --- |
| 注册表存 `Map<string, ShallowRef<MapboxDraw>>` | 存 `shallowReactive(Map<string, MapboxDrawContext>)` | 跨树门面的 `draw` 字段是 `computed(() => getDrawContext(id)?.draw.value)`，普通 `Map` 不触发重算 |
| `useMapboxDraw(options?)` 仍返回 ref，复用 `resolve.ts` 的 `useContextResolver` | 返回 `MapboxDrawContext`（破坏性），跨树是延迟查表门面，未复用 `useContextResolver` | 裸 ref 让调用方自行 watch 就绪、且绕过模型同步；上下文对象把「等就绪 + 回写 v-model」收进包内 |
| `DrawControl` 挂载时按 `ctx.id` 无条件注册 | 仅当 `getMapContext(ctx.id) === ctx`（地图显式设了 `map-id`）才注册 | 未设 `map-id` 的地图不进 map 注册表、其自动 id 外部无从知晓；且 `useId()` 计数器按 app 实例重置，无条件注册会误报 id 冲突 |
| 未提及未注册时的行为 | 写操作 warn 空操作；读操作静默 `undefined`；`whenReady()` reject | 读操作常在 `computed` 里反复求值，告警会刷屏；`whenReady()` 悬挂即 5 记录过的坑 |

### 8.2 studio 侧接入（已完成）

1. **`map.vue` 挂控件**：`<MapboxDrawControl v-model:features :options="DRAW_OPTIONS">` 放进已有的 `map-id="workspace-map"` 地图内，并**包一层 `<ClientOnly>`**（否则 SSR 期就注册进进程级绘制注册表，逐请求泄漏，见 7.7）。控件按钮常驻显示——用户点按钮画和 AI 调 `draw-shape` 切模式共用同一个 draw 实例，模式切换后按钮自动同步高亮。
2. **手绘要素不进纯归约状态**。这是本次接入唯一的架构陷阱：`MapWorkspaceState` 是「当前消息的纯归约」（见 4.4 与 7.4），每次消息变化整体重算。用户手绘的要素是**交互产物、不是任何工具输出的函数**，塞进去会在下一条消息到达时被重算清空。故由 `v-model:features` 绑 [useDrawnFeatures.ts](../../app/composables/useDrawnFeatures.ts) 这个**独立 `useState`**，与工具归约状态并列而非嵌套。两条有意为之的后果：不落库（刷新即丢，手绘是画布不是会话产物）、不随 `chatId` 重置（切换会话时用户画的东西保留）。切走 map 工作区时控件卸载，但 useState 里的数组还在，切回来时包的 `onMounted` 有 `instance.set(...)` 回填逻辑，studio 侧无需处理。
3. **契约与 handler**：`draw-shape({ shape, color? })` 与 `clear-drawing()`，handler 均为 echo（真正的副作用在客户端）。契约独立成第六个域文件 [draw.ts](../../shared/utils/tools/map/draw.ts)。
4. **applicator 只写 `effect`、不写 `reduce`、不 `replayOnLoad`**：`draw-shape` 调 `changeMode`，`clear-drawing` 调 `deleteAll()`。`mapbox-gl-draw` 画完一个要素会自动退回 `simple_select`，不需要包侧或 studio 侧额外处理。不 `replayOnLoad` 是因为刷新页面不该让地图重新进入绘制态，也不该重放一次清除。
5. **prompt 补一条选型规则**：已知几何走 `add-geojson`，只有「让我手动画」这类交互式请求才用 `draw-*`；清手绘用 `clear-drawing`，清工具添加的标注用 `remove-marker`，两者不可混用。

#### 实现中与上述原计划的三处偏差

| 原计划 | 实际实现 | 原因 |
| --- | --- | --- |
| `shape: 'point' \| 'line' \| 'polygon'` | 追加 `rectangle` / `circle` | 包导出 `movkDrawModes` 提供这两个自定义模式，框选矩形、拉一个圆是 GIS 手绘高频动作，且与 `buffer-circle`（AI 指定圆心半径）形成「交互式 vs 指令式」互补。`ellipse` / `sector` 有意不暴露：场景窄，会稀释 LLM 对 `shape` 枚举的选择准确率 |
| 未提读取能力 | 手绘要素经 `sendMessage` body 注入 system prompt | **「读取手绘要素」做不成 MCP 工具**：handler 在服务端跑，读不到浏览器里的 draw 实例。做成 AI SDK 的 client-side tool（`onToolCall` + `addToolResult`）则要改桥接层、`useChat` 与 `onEnd` 落库路径，且 tool-result part 的持久化在当前架构下有缺口。上下文注入给 LLM 的信息完全相同，复杂度低一个数量级 |
| 未提 | 圆 / 椭圆 / 扇形只注入 `properties`，不注入环坐标 | `draw_circle` 用 `steps: 64` 生成 **65 个顶点**（约 500 token）。把它塞给 LLM 正是 4.3 记的「几何绝不回流 LLM」反模式。这三个模式恰好在 `properties` 里写了 `center` / `radiusInM`（扇形另有 `bearing1` / `bearing2`），[summarizeDrawnFeatures](../../server/utils/drawn-features.ts) 直接读属性 |

#### 手绘颜色（`draw-shape` 的 `color`）

契约只暴露一个 `color`，与 `add-marker` / `add-geojson` / `buffer-circle` 同范式，不暴露完整 paint。链路三段，包侧能力已齐备、未改包：

1. **样式表**：`DRAW_OPTIONS` 传 `styles: drawThemeStyles({ color: DRAW_COLOR })`（`@movk/mapbox/utils/draw-theme`）。它生成完整 11 层 styles，每层取色为 `['coalesce', ['get', 'user_color'], 主题色]`——要素级颜色覆盖主题色。`styles` 与 `modes` 一样是**整体替换**，`drawThemeStyles()` 给的正是完整一套。
2. **`userProperties: true`**：mapbox-gl-draw 渲染时给用户属性统一加 `user_` 前缀，不开这个开关用户属性根本不会进入内部 source，`user_color` 永远取不到。
3. **落色时机**：颜色写不进「还没画出来的要素」，所以 `draw-shape` 的 effect 只把 `color` 挂进 [usePendingDrawColor](../../app/composables/useDrawnFeatures.ts)，由 [map.vue](../../app/pages/workspace/map.vue) 的 `@create` 回调对新要素 `setFeatureProperty(id, 'color', color)` 后清空。

**颜色是一次性的**：只染这次 `draw-shape` 之后画出的要素。做成持久画笔会让用户随后自己点控件按钮画的图形被上一轮 AI 指定的颜色染上，语义不对。`clear-drawing` 一并清挂起颜色。

#### 手绘要素 → LLM 的上下文注入链路

`CopilotPanel` 的 `prepareSendMessagesRequest` 把 [useWorkspaceContext](../../app/composables/useWorkspaceContext.ts) 的快照塞进 body 的 `workspaceContext`（`DefaultChatTransport` 只构造一次，回调闭包读 ref，每次发送拿到的都是当前值）→ `[id].post.ts` 交给 [summarizeWorkspaceContext](../../server/utils/workspace-context.ts)，它按工作区做 zod 边界校验后分发给 `summarizeDrawnFeatures()` → 拼进 `copilotSystemPrompt(workspace, contextBrief)`。

> 这里原本是 `CopilotPanel` 里一处硬编码的 `workspace === 'map' && drawnFeatures.length` 分支。落地 form 工作区时（form 也要注入当前表单结构与已填值）收敛成了单一通道——否则每加一个工作区就要在请求体里堆一个 `if`。

摘要规则：圆 / 椭圆 / 扇形描述其参数；其余几何顶点数 ≤ 30 时给完整坐标（精度 6 位），超出只给顶点数与包围盒。于是 LLM 拿到线的坐标可直接调 `measure-distance`，拿到多边形坐标可调 `add-geojson` 转成正式图层，拿到圆的 `radiusInM` 直接口述——闭环成立，且没有一个大几何穿过 tool-call JSON。

system prompt 不落库，所以 LLM 每轮看到的都是**当前**手绘快照，历史轮次不残留旧快照；`regenerate()` 走同一条 transport 路径，行为一致。

#### 两处依赖细节

- `movkDrawModes` 经包的官方别名导入：`import { movkDrawModes } from '#mapbox/draw-modes'`（模块在 `setup` 里注册 `nuxt.options.alias['#mapbox'] = resolve('./runtime')`）。它同时也被 `addImports` 登记为自动导入，但显式 import 与既有的 `heatmapPaint` 写法一致，更易追溯。
- `DRAW_OPTIONS.modes` 必须合并 `MapboxDraw.modes`——`mapbox-gl-draw` 的 `options.modes` 是**整体替换**而非合并，只传 `movkDrawModes` 会丢掉全部内置模式。为此 studio 需直接 `import MapboxDraw from '@mapbox/mapbox-gl-draw'`，而该包不带类型声明，须补 `@types/mapbox__mapbox-gl-draw` 到 devDependencies（包侧同样这么做），否则 `pnpm typecheck` 报 `TS7016`。

### 8.3 包侧发布流程

包内实现 → `playgrounds/play` 验证 → `pnpm build` → bump version → `pnpm release`（`before:init` 跑 lint+typecheck+test）+ `npm publish` → studio 侧 `pnpm up @movk/mapbox` 后接入对应工具（契约加一条 + 新增 `server/mcp/tools/*.ts` + applicator 加一条）。发版前包侧改动可先用 pkg.pr.new 的预览构建（`package.json` 指向 `https://pkg.pr.new/@movk/mapbox@<commit>`）在 studio 里跑通，定版后再切回版本号——绘制这轮即如此，现已发布 1.2.0 并切回 `^1.2.0`。`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 需同步登记新版本（当前是 `@movk/mapbox@1.2.0`），否则新发的包会被发布时长阈值挡住。
