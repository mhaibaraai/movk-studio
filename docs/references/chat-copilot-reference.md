# Chat 参考资料：nuxt-ui chat 模板 与 nuxt/ui Chat.vue

> 面向 movk-studio「GIS Copilot」对话面板的实现参考。整理两个成熟实现的架构、组件与关键模式，并给出落地对照与迁移建议。

## 1. 概述与定位

本项目正在 `feat/copilot-panel-ui` 分支上搭建 GIS Copilot 面板（[CopilotPanel.vue](../../app/components/CopilotPanel.vue) + [index.vue](../../app/pages/index.vue)），目前只搬来了侧边栏 UI 骨架，尚未接入 AI SDK 传输层、工具调用与消息渲染。为便于后续落地，整理两个参考实现：

| 来源 | 路径 | 定位 | 复杂度 |
| --- | --- | --- | --- |
| 来源一 · chat 模板 | `/Users/yixuanmiao/MOVK/chat` | 官方 Nuxt AI Chatbot 完整应用 | 高（含持久化、鉴权、上传、工具） |
| 来源二 · Chat.vue | `/Users/yixuanmiao/MOVK/ui/docs/app/components/chat/Chat.vue` | nuxt/ui 官网自身的 "Ask AI" 侧边栏 | 低（单文件、无持久化） |

**为何两个都参考**：来源二给出了「侧边栏问答」的最小完整形态，与 Copilot 面板的 UI 载体一致，可直接照搬；来源一给出了传输、工具调用卡片、文件上传、历史持久化等完整能力，可按需裁剪补充。

一句话结论：

> Copilot 面板 = 来源二的 UI 形态（`USidebar` + `UChatMessages` + `UChatPrompt`）+ 来源一的传输 / 工具 / 上传能力（按 GIS 场景裁剪）。

## 2. 公共技术栈

两个来源共享同一套底层依赖，理解这套 API 是复用的前提。

### AI SDK

- `useChat`（来自 `@ai-sdk/vue`）：聊天状态机，返回 `messages`、`status`、`error`、`sendMessage`、`regenerate`、`stop`。
- `DefaultChatTransport`（来自 `ai`）：定义后端端点与请求体，`api` 指定路由，`body` 可为对象或函数（函数形式可在每次请求时动态注入上下文）。
- UIMessage part 模型：一条消息由 `parts` 数组组成，类型包括 `text`、`reasoning`、`tool-*`（工具调用）、`file`、`source-url`。渲染时按 part 类型分发。

### Nuxt UI `UChat*` 组件族

| 组件 | 作用 |
| --- | --- |
| `UChatMessages` | 消息列表容器，含 `should-auto-scroll`、`status`、`compact`，插槽 `#indicator`/`#content`/`#files`/`#actions` |
| `UChatPrompt` | 输入框，`v-model` 绑定文本，插槽 `#header`/`#footer` |
| `UChatPromptSubmit` | 提交/停止/重生成按钮，依据 `status` 自动切换形态 |
| `UChatReasoning` | 折叠展示推理（reasoning）part |
| `UChatTool` | 工具调用的行内提示（图标 + 文案 + 折叠内容） |
| `UChatShimmer` | 加载中的骨架文案（如 "Thinking..."） |

### part 判定与工具函数

- 来自 `ai`：`isTextUIPart`、`isReasoningUIPart`、`isToolUIPart`、`isFileUIPart`、`getToolName`。
- 来自 `@nuxt/ui/utils/ai`：`isPartStreaming`、`isToolStreaming`、`getTextFromMessage`。

## 3. 来源一 · chat 模板拆解

### 目录分层

```text
app/
  pages/            index.vue（新建会话）、chat/[id].vue（会话详情）
  components/chat/
    message/        MessageContent.vue、MessageActions.vue、MessageEdit.vue
    tool/           Weather.vue、Chart.vue、Sources.vue
    Files.vue、FilePreview.vue、FileUploadButton.vue、ChatTitle.vue、ChatVisibility.vue …
  composables/      useChats.ts、useChatActions.ts、useFileUpload.ts、useModels.ts
  utils/            ai.ts（getMergedParts）、tool.ts、url.ts
server/
  api/              chats.get/post.ts、chats/[id].*、chats/[id]/{title,messages,votes,visibility}、upload/*
  db/               schema.ts + Drizzle 迁移（SQLite / 生产 Turso）
shared/utils/       models.ts、file.ts、tools/{weather,chart}.ts
```

### 传输与会话生命周期

[pages/chat/[id].vue](../../../chat/app/pages/chat/[id].vue) 是核心，`useChat` 配置要点：

```ts
const { messages, status, error, sendMessage, regenerate, stop } = useChat({
  id: data.value?.id,
  messages: data.value?.messages,          // 服务端预取的历史消息
  transport: new DefaultChatTransport({
    api: `/api/chats/${data.value?.id}`,
    headers: { [headerName]: csrf },        // CSRF 头
    body: { model: model.value }            // 当前模型
  }),
  onError(error) {
    // 后端错误可能是 JSON 字符串，尝试解析出 message 字段
    let message = error.message
    if (typeof message === 'string' && message[0] === '{') {
      try { message = JSON.parse(message).message || message } catch {}
    }
    toast.add({ description: message, color: 'error', duration: 0 })
  }
})
```

其它生命周期模式：

- **标题刷新**：标题在首条消息服务端生成，流内无信号，因此 `watch(status)` 在 `streaming` 时 `refreshNuxtData('chats')` 并从缓存回填标题。
- **消息编辑**：`saveEdit` 先 `DELETE /messages`（`type: 'edit'`）再 `sendMessage({ text, messageId })`。
- **重生成**：`regenerateMessage` 先 `DELETE /messages`（`type: 'regenerate'`）再 `regenerate({ messageId })`。
- **投票**：`vote` 采用乐观更新，失败时用快照 `snapshot` 回滚。

### 首页新建会话

[pages/index.vue](../../../chat/app/pages/index.vue) 用一次性 `chatId = crypto.randomUUID()`，`createChat` 组装 `parts`（text + 上传文件）后 `POST /api/chats`，再 `navigateTo(/chat/:id)`。`quickChats` 快捷指令直接调用 `createChat`。

### 布局与历史

[layouts/default.vue](../../../chat/app/layouts/default.vue)：`UDashboardGroup` + `UDashboardSidebar`（可折叠、可拉伸），历史列表由 `useChats` 分组，右键操作由 `useChatActions` 提供。

- [useChats.ts](../../../chat/app/composables/useChats.ts)：用 `date-fns` 把会话按 Today / Yesterday / Last week / Last month / 月份 分组。
- [useChatActions.ts](../../../chat/app/composables/useChatActions.ts)：用 `useOverlay` 创建重命名 / 删除模态，操作后同步更新 `useNuxtData('chats')` 缓存。

### 消息渲染

[MessageContent.vue](../../../chat/app/components/chat/message/MessageContent.vue) 是 part 分发中枢：

```vue
<template v-for="(part, index) in getMergedParts(message.parts)" :key="...">
  <UChatReasoning v-if="isReasoningUIPart(part)" ... />

  <template v-else-if="isToolUIPart(part)">
    <ChatToolChart   v-if="getToolName(part) === 'chart'" ... />
    <ChatToolWeather v-else-if="getToolName(part) === 'weather'" ... />
    <UChatTool v-else-if="getToolName(part) === 'web_search' || 'google_search'" ...>
      <ChatToolSources :sources="getSources(part)" />
    </UChatTool>
  </template>

  <template v-else-if="isTextUIPart(part)">
    <ChatComark v-if="message.role === 'assistant'" :markdown="part.text" :streaming="..." />
    <ChatMessageEdit v-else-if="editing" ... />
    <p v-else class="whitespace-pre-wrap">{{ part.text }}</p>
  </template>
</template>
```

- [utils/ai.ts](../../../chat/app/utils/ai.ts) 的 `getMergedParts`：合并相邻 `text` part、把 `source-url` 内联进前一段文本，避免碎片化渲染。
- [MessageActions.vue](../../../chat/app/components/chat/message/MessageActions.vue)：assistant 消息提供 复制 / 投票 / 重生成；user 消息提供 时间戳 / 编辑（有文件时隐藏编辑）。复制用 `@vueuse/core` 的 `useClipboard` + `getTextFromMessage`。

### 工具调用 UI

工具调用有两种呈现：

1. **富卡片**：[tool/Weather.vue](../../../chat/app/components/chat/tool/Weather.vue) 按 `invocation.state`（`input-available` / `output-available` / `output-error`）切换加载 / 结果 / 错误三态，用渐变背景卡片渲染结构化输出。`Chart.vue` 同理渲染图表。
2. **行内折叠**：`web_search` / `google_search` 用 `UChatTool` 展示「Searching / Searched the web」并折叠来源列表 `ChatToolSources`。

### 文件上传

[useFileUpload.ts](../../../chat/app/composables/useFileUpload.ts) 的 `useFileUploadWithStatus`：

- 基于 Nuxt UI `useFileUpload`（拖拽 dropzone）+ `useUpload`（`PUT /api/upload/:chatId`）。
- 每个文件维护状态机 `uploading → uploaded / error`，`uploadedFiles` 计算出可发送的 `{ type: 'file', mediaType, url }`。
- `removeFile` 会 `revokeObjectURL` 并 `DELETE` 已上传的 Blob；未登录直接拦截。

### 模型选择与横切能力

- `useModels` + [shared/utils/models.ts](../../../chat/shared/utils/models.ts)：模型列表 + `useCookie` 持久化选择。
- 横切能力：鉴权（`nuxt-auth-utils` / GitHub OAuth）、CSRF（`nuxt-csurf` 的 `useCsrf`）、会话可见性（public/private）、Comark 流式 Markdown + Shiki 高亮。

## 4. 来源二 · nuxt/ui Chat.vue 拆解

单文件 [Chat.vue](../../../ui/docs/app/components/chat/Chat.vue)，是「侧边栏问答」的最小完整实现。

### 侧边栏形态

```vue
<USidebar v-model:open="open" side="right" title="Ask AI" rail
          :style="{ '--sidebar-width': '24rem' }"
          :ui="{ footer: 'p-0', actions: 'gap-0.5' }">
  <template #actions> … 重置主题 / 清空消息按钮 </template>
  <template #close>   … 关闭按钮（带 meta+i 快捷键提示） </template>

  <UTheme :ui="{ prose: { p: {...}, h1: {...}, code: {...} } }">
    <UChatMessages v-if="chatMessages.length" compact ... />
    <div v-else> … UPageLinks 渲染 suggestions 空态 </div>
  </UTheme>

  <template #footer>
    <UChatPrompt ref="promptRef" v-model="input" variant="naked" size="sm" ... />
  </template>
</USidebar>
```

关键点：`side="right" rail` 右侧轨道栏、`--sidebar-width` 控制宽度、`UTheme` 局部覆盖 prose 排版让 Markdown 在窄栏内更紧凑、`compact` 让消息列表更密。

### 单实例 useChat 与动态上下文

```ts
const { messages: chatMessages, status, error, sendMessage, regenerate, stop } = useAIChat({
  messages: messages.value,
  transport: new DefaultChatTransport({
    api: '/api/ai',
    body: () => ({ theme, framework: framework.value, currentPage: ... })  // 函数形式：每次请求注入上下文
  }),
  onError: (error) => { /* 同来源一：解析 JSON message + toast */ },
  onFinish: () => { processThemeToolCalls(); /* 回写共享 messages */ }
})
```

`body` 用函数形式，把当前主题、框架、页面路径随每条消息发给后端 —— 这正是 Copilot「把当前应用状态作为上下文」的范式。

### 外部消息同步

Chat.vue 同时用一个本地 `useChat()` composable（跨组件共享的 `messages`）和 AI 实例的 `chatMessages`，两者双向同步：

- `watch(messages)`：外部（如搜索 → 对话流）写入时同步进 AI 实例，若末条是 user 则自动 `regenerate()`。
- `onFinish` 用 `_skipSync` 标志把 AI 结果回写共享 `messages`，避免 watch 循环。

这是 movk-studio 需要的核心模式：**其它模块（地图操作、搜索）可以往对话里注入消息并触发回复**。

### 工具文案 / 图标映射

`getToolMessage(state, toolName, input)` 用一个对象字典把工具名 + 状态映射成人类可读文案（如 `Searching components for "x"` / `Applied theme changes`），`getToolIcon` 映射图标，外层用 `useMemoize` 缓存。副作用工具 `applyTheme` / `resetTheme` 在 `processThemeToolCalls` 里被解析并真正执行到页面上（`_themeApplied` Set 去重）。

### 交互细节

- 空态：`UPageLinks` 按分类渲染 `suggestions`，点击即 `askQuestion`（填入 input 并提交）。
- 快捷键：`defineShortcuts({ meta_i })` 开关侧栏，并处理与搜索面板的互斥。
- 重聚焦：侧栏为 offcanvas，`watch(open)` 在重新打开时 `promptRef.textareaRef.focus()`。

## 5. 两来源对照表

| 维度 | 来源一 chat 模板 | 来源二 Chat.vue | movk-studio 现状 |
| --- | --- | --- | --- |
| UI 载体 | `UDashboardPanel` 全屏 | `USidebar side="right"` | `USidebar side="right"`（同来源二） |
| 传输层 | `DefaultChatTransport` → `/api/chats/:id` | `DefaultChatTransport` → `/api/ai` | 空 `useChat({})`，未配置传输 |
| 动态上下文 | `body: { model }` | `body: () => ({ theme, framework, currentPage })` | 无 |
| 持久化 | Drizzle/SQLite + 历史侧栏 | 无（内存） | 无 |
| 工具调用 | weather / chart 富卡片 + web_search 折叠 | 文案映射 + applyTheme 副作用 | 已移植但整段注释 |
| 文件上传 | `useFileUploadWithStatus` + Blob | 无 | 组件已移植，逻辑注释 |
| 鉴权 | GitHub OAuth + CSRF | 无 | `useUserSession`（FileUploadButton 已用） |
| 消息编辑 | 编辑 / 重生成 / 投票 | 仅重生成 | 无 |
| 空态 / 建议 | 首页 `quickChats` | `UPageLinks` suggestions | `QUICK_CHATS`（按工作区分组，点击即 `send`） |
| 快捷键 | `meta_o` 新建 / `meta_k` 搜索 | `meta_i` 开关侧栏 | 无 |

## 6. movk-studio Copilot 落地对照

> 本节原是「现状盘点 + 分阶段迁移建议」。阶段一至四均已落地，故改写为**落地结果**。两来源的拆解（3、4 节）仍是原样保留的上游研究记录。

### 落地结果

| 文件 | 状态 |
| --- | --- |
| [CopilotPanel.vue](../../app/components/CopilotPanel.vue) | ✅ 真实 `useChat` + `DefaultChatTransport`，`prepareSendMessagesRequest` 注入 `model` / `workspaceContext`；空会话渲染 `QUICK_CHATS` pill；投票、重生成、编辑已接线 |
| [index.vue](../../app/pages/index.vue) | 已退化为占位首页——Copilot 不占主路由，常驻 [default.vue](../../app/layouts/default.vue) 的侧栏（见 8 的决策二） |
| [chat/message/MessageContent.vue](../../app/components/chat/message/MessageContent.vue) | ✅ part 分发已启用（text + reasoning + tool）；工具气泡的文案与图标读**工具契约**的 `status` / `icon`，不再有本地映射表 |
| [chat/message/MessageActions.vue](../../app/components/chat/message/MessageActions.vue) + [MessageEdit.vue](../../app/components/chat/message/MessageEdit.vue) + [MessageIndicator.vue](../../app/components/chat/message/MessageIndicator.vue) | ✅ 复制 / 重生成 / 投票 / 编辑重发 |
| [chat/Comark.ts](../../app/components/chat/Comark.ts) | ✅ 已移植，Shiki 语言集已配置 |
| [chat/SourceLink.vue](../../app/components/chat/SourceLink.vue) | ✅ 已移植 |
| [chat/FileUploadButton.vue](../../app/components/chat/FileUploadButton.vue) | ⚠️ 组件已移植、文案已汉化，但**尚未接线**（无 `useFileUploadWithStatus`、无后端），当前无引用点 |
| [ModelSelect.vue](../../app/components/ModelSelect.vue) + [useModels.ts](../../app/composables/useModels.ts) + [shared/utils/models.ts](../../shared/utils/models.ts) | ✅ 已移植，模型改为 Qwen / GLM / Deepseek，含自定义图标 |

工具调用一节（原阶段三）没有照搬模板的 weather / chart 富卡片路线，而是走了**契约驱动**：工具「长什么样」只在 `shared/utils/tools/` 定义一次，聊天流里统一渲染为带图标的状态气泡，画布副作用由 `useToolDispatch` 的纯归约 + fire-once 分发承担（对应来源二 `processThemeToolCalls` 的 `Set` 去重，但泛化到了工作区）。详见 [mcp-toolkit-map-tools-reference.md](./mcp-toolkit-map-tools-reference.md) 的 4.1 与 4.4。

### 未采纳 / 待接入

| 项 | 状态 |
| --- | --- |
| `getMergedParts`（相邻 part 合并） | **未采纳**。本项目 [app/utils/chat.ts](../../app/utils/chat.ts) 只有 `groupByDate`；工具气泡天然分段，暂无碎片化渲染问题。接入来源功能（`source-url` 内联）时再考虑 |
| 富卡片工具 UI（Weather / Chart 三态） | 未采纳，见上：统一状态气泡已足够 |
| 文件上传 | 组件就绪，后端与 `useFileUploadWithStatus` 待补 |
| 历史侧栏按日期分组（`useChats`） | 已落地为 [app/utils/chat.ts](../../app/utils/chat.ts) 的 `groupByDate` |

## 7. 关键代码片段附录

以下片段均可复用，标注了来源文件。

**useChat 传输配置**（[chat/pages/chat/[id].vue](../../../chat/app/pages/chat/[id].vue) / [Chat.vue](../../../ui/docs/app/components/chat/Chat.vue)）

```ts
const { messages, status, error, sendMessage, regenerate, stop } = useChat({
  messages: initialMessages,
  transport: new DefaultChatTransport({
    api: '/api/copilot',
    body: () => ({ context: currentMapState.value })  // 动态上下文
  }),
  onError: (e) => {
    let message = e.message
    if (typeof message === 'string' && message[0] === '{') {
      try { message = JSON.parse(message).message || message } catch {}
    }
    toast.add({ description: message, color: 'error', duration: 0 })
  }
})
```

**part 分发骨架**（[chat/.../MessageContent.vue](../../../chat/app/components/chat/message/MessageContent.vue)）

```vue
<template v-for="(part, index) in getMergedParts(message.parts)" :key="...">
  <UChatReasoning v-if="isReasoningUIPart(part)" :text="part.text" :streaming="isPartStreaming(part)" />
  <MyGisTool v-else-if="isToolUIPart(part)" :name="getToolName(part)" :part="part" />
  <ChatComark v-else-if="isTextUIPart(part) && message.role === 'assistant'"
              :markdown="part.text" :streaming="isPartStreaming(part)" />
</template>
```

**工具文案映射 + 缓存**（[Chat.vue](../../../ui/docs/app/components/chat/Chat.vue)）

```ts
function getToolMessage(state, toolName, input) {
  const verb = state === 'output-available' ? '已' : '正在'
  return {
    flyTo:   `${verb}定位到 ${input.location}`,
    addLayer: `${verb}叠加图层 ${input.layer}`
  }[toolName] || `${verb}执行 ${toolName}`
}
const getCached = useMemoize((s, n, i) => getToolMessage(s, n, JSON.parse(i)))
```

**相邻 part 合并**（[chat/utils/ai.ts](../../../chat/app/utils/ai.ts)）

```ts
export function getMergedParts(parts) {
  const result = []
  for (const part of parts) {
    const prev = result[result.length - 1]
    if (part.type === 'source-url' && prev && isTextUIPart(prev)) {
      result[result.length - 1] = { type: 'text', text: prev.text + sourceToInlineMdc(part.url) }
    } else if (isTextUIPart(part) && prev && isTextUIPart(prev)) {
      result[result.length - 1] = { type: 'text', text: prev.text + part.text }
    } else {
      result.push(part)
    }
  }
  return result
}
```

## 8. 路由与工作区架构建议

movk-studio 与 chat 模板的关键差异：有两个正交的、都「想占路由」的概念，而模板只有一个。

| 概念 | chat 模板 | movk-studio | 归属 |
| --- | --- | --- | --- |
| 主内容 | 对话本身（`chat/[id].vue` 即页面） | 工作区（地图 / 表单 / 数据） | `<NuxtPage>`（占主路由） |
| Copilot | —— | 右侧常驻面板 | `layout`（不占路由） |

判断准则：**谁在 layout 谁就不占主路由，谁是 page 谁才占。** Copilot 面板常驻右栏、切工作区不销毁，因此归 layout；工作区是可切换的主视图，因此归路由。

### 决策一 · 工作区 → 用路由

地图 / 表单 / 数据是异构的独立主视图（非同一视图的 tab），需要深链接、刷新保留、前进后退与按模块懒加载。

- 路由结构：`/map`、`/form`、`/data`（或 `/studio/map`）。
- 地图实例不想在切走再切回时销毁 → `<NuxtPage>` 外包 `<keep-alive>`，或把地图实例状态提到 composable / pinia，路由只切视图。

### 决策二 · Copilot 对话 → 不占主路由

模板的 `chat/[id].vue` 让对话成为页面主体，会与工作区抢主路由，**不直接适用**。对话按需求分三档，逐级升级：

| 档位 | 做法 | 适用 |
| --- | --- | --- |
| 会话级（推荐起步） | 不进路由，跨组件共享 `useChat` composable 的内存状态；刷新即清空 | 「让 AI 操作当前模块」，暂无历史需求 |
| 单会话可分享 | id 放 query：`/map?chat=xxx`，不抢主路由 | 需要刷新保留 / 分享链接 |
| 完整历史 | query 或独立并列的 `/chat` 全屏视图，**不建 `chat/[id]` 顶层路由** | 左栏「新建对话 / 搜索」是真功能、多会话持久化 |

### 决策三 · 会话作用域

推荐 **每工作区一个内存会话**：切到地图是地图的对话上下文，切到表单是表单的。配合来源二的动态 `body` 注入当前模块状态，天然契合「操作当前模块」的定位。

### 目录 / 路由结构（已落地）

```text
app/
  layouts/
    default.vue          # UDashboardGroup：左侧栏 + <slot/>(工作区) + 右侧 CopilotPanel(常驻)
  pages/
    index.vue            # 占位首页（global 工作区，不重定向）
    workspace/
      map.vue            # 工作区：地图
      form.vue           # 工作区：表单
      data.vue           # 工作区：数据（占位，尚无画布与工具）
  components/
    CopilotPanel.vue     # 右侧常驻面板，读取「当前工作区」上下文
  composables/
    useCopilot.ts        # 共享 useChat 实例；chatId 由 URL 派生，按工作区隔离会话
    useWorkspaceContext.ts   # 按工作区产出供 Copilot 注入的上下文快照
```

工作区标识由 [shared/utils/workspace.ts](../../shared/utils/workspace.ts) 的 `WORKSPACES` 定义：`global` / `map` / `form` / `data`——`global` 即首页的无工作区会话，另外三个各对应一条 `/workspace/<name>` 路由（`workspacePath()` 是 `useCopilot` 里「path → workspace」推导的逆函数）。

> 起步计划里的 `useWorkspace.ts`（工作区标识 + 上下文快照二合一）最终**未按此拆分**：标识从路由直接派生（`useCopilot`），快照独立成 `useWorkspaceContext.ts`。

### 实施步骤

1. **拆工作区为页面** ✅：工作区已是路由 `/workspace/{map,form,data}`；`index.vue` 保留为占位首页而非重定向（`global` 会话仍可用）。
2. **Copilot 提到 layout** ✅：[CopilotPanel.vue](../../app/components/CopilotPanel.vue) 常驻 [layouts/default.vue](../../app/layouts/default.vue)，工作区内容走 `<slot/>`。**未加 `keep-alive`**——切走工作区会卸载画布，代价见 map 文档 5 与 form 文档 7.2。
3. **上下文注入** ✅：[useWorkspaceContext.ts](../../app/composables/useWorkspaceContext.ts) 产出快照，经 `prepareSendMessagesRequest` 的 body `workspaceContext` 上传（见 9.7）。
4. **建 `useCopilot`** ✅：封装共享 `useChat` + `DefaultChatTransport`，chatId 从 URL 派生（见 9.3）。
5. **绑定快捷指令** ✅：快捷提示已抽到 [app/utils/quick-chats.ts](../../app/utils/quick-chats.ts)，由 CopilotPanel 按工作区取用并接到 `send()`。
6. **会话持久化** ✅：已落 Turso（`chats` / `messages` / `votes` 表），chatId 走 query 参（`?chat=`），全程未引入 `chat/[id]` 顶层路由。

## 9. Copilot chatId 逻辑设计（三工作区 · 新建 / 回显 / 历史）

> 已定型决策：会话 **按工作区隔离** + chatId **放工作区路由的 query 参**（`/workspace/map?chat=<uuid>`）。本节已按实际实现同步（标注 ✅ 的为已落地）。

### 9.0 已修复的三个 Bug ✅

原 [CopilotPanel.vue](../../app/components/CopilotPanel.vue) 常驻 [layout](../../app/layouts/default.vue)、工作区已是路由 `/workspace/{map,form,data}`，但 chatId 逻辑有三处会坏，现已随重写全部修复：

| 问题 | 原现状 | 已采用修正 |
| --- | --- | --- |
| chatId 只生成一次 | `const chatId = crypto.randomUUID()` 在 setup 顶层 | 由 [useCopilot](../../app/composables/useCopilot.ts) 从 URL 派生，草稿回落每工作区预生成 id |
| 跳到不存在的路由 | `navigateTo('/chat/${id}')` → 404 且替换工作区 | `persistToUrl()` 用 `router.replace({ query: { chat: id } })` 保留工作区 |
| useChat 空实例 | `useChat({})` 无 transport、无消息列表 | 配 `DefaultChatTransport` + 补回 `UChatMessages` |

### 9.1 数据模型改动 ✅

`chats` 表加一列标记归属工作区，历史 / 搜索才能按工作区过滤。见 [schema.ts](../../server/db/schema.ts)：

```ts
// chats 追加；default 'map' 为迁移安全（存量行回填），应用侧始终显式传入
workspace: text('workspace', { enum: ['map', 'form', 'data'] }).notNull().default('map')
```

追加索引 `index('chats_workspace_idx').on(table.userId, table.workspace)`；迁移已生成 `0002_dusty_maximus.sql`。

### 9.2 服务端端点 ✅

写路径拆为两个接口：建壳与流式各管一段（对齐 chat 模版的两文件形态）。

| 端点 | 文件 | 作用 |
| --- | --- | --- |
| `POST /api/chats` | [chats.post.ts](../../server/api/chats.post.ts) | 建会话壳：按 workspace 建会话（`id + workspace + 空标题`），幂等，已存在则校验归属后返回；防占用他人会话 id |
| `POST /api/chats/:id` | [chats/[id].post.ts](../../server/api/chats/[id].post.ts) | 仅流式：会话须已存在（否则 404）+ 存 user 消息 + 生成标题 + `streamText` 流式 + `onEnd` 存 assistant；含 IDOR 纵深防御（见 9.8） |
| `GET /api/chats/:id` | [chats/[id].get.ts](../../server/api/chats/[id].get.ts) | 加载单会话 + 消息，用于回显 |
| `GET /api/chats?workspace=` | [chats.get.ts](../../server/api/chats.get.ts) | 按工作区列出会话，用于左栏历史 / 搜索 |

草稿首发先 `POST /api/chats` 建壳、再 `POST /api/chats/:id` 流式；消息落库统一由流式接口负责，前端无需协调消息 id。

> 运行前置：`model` 走 `@ai-sdk/gateway`，需 `AI_GATEWAY_API_KEY`；schema 变更需 `pnpm db:migrate`。

### 9.3 useCopilot（chatId 路由状态） ✅

关键技巧：**chatId 由 query 派生，草稿态回落到每工作区一个预生成 id**，让「草稿 → 落库」只改 URL、不触发会话切换。实际实现见 [useCopilot.ts](../../app/composables/useCopilot.ts)：

```ts
const workspace = computed<Workspace>(() => {
  const seg = route.path.split('/')[2] ?? ''
  return (WORKSPACES as readonly string[]).includes(seg) ? seg as Workspace : 'map'
})

const draftIds = useState<Record<Workspace, string>>('copilot-draft-ids', () => ({
  map: crypto.randomUUID(), form: crypto.randomUUID(), data: crypto.randomUUID()
}))

const chatId = computed(() => (route.query.chat as string) || draftIds.value[workspace.value])
const isDraft = computed(() => !route.query.chat)

function newChat() {
  draftIds.value = { ...draftIds.value, [workspace.value]: crypto.randomUUID() } // 不可变更新
  router.replace({ path: route.path, query: {} })
}
// 传入会话所属 workspace 时跳到对应工作区路由；同工作区内切会话仍走 replace
function openChat(id: string, target?: Workspace) {
  const path = target ? workspacePath(target) : route.path
  const to = { path, query: { chat: id } }
  if (path === route.path) router.replace(to)
  else router.push(to)
}
function persistToUrl() { router.replace({ path: route.path, query: { chat: chatId.value } }) }
```

**为什么 `openChat` 要认 workspace**：`GET /api/chats?workspace=global` 对 `global` **不过滤**，所以 home（`/`）的左栏列的是全部工作区的会话。若只改 query 不改 path，点开一条 map 会话会停在 `/?chat=<id>`——Copilot 面板加载了消息，主视图却还是 home，客户端 `workspace` 仍算 `global`（工具派发直接 return），而服务端按 DB 里的 `chat.workspace` 给的是 map 工具集，两侧不一致。会话所属工作区来自 `chats.workspace` 列，经 [default.vue](../../app/layouts/default.vue) 的列表项透传给 `openChat`；[useChatActions](../../app/composables/useChatActions.ts) 的乐观缓存项同样必须带上 `workspace`，否则新建会话在 refetch 落地前被点击会拿不到目标路由。左栏列表项的图标取 `WORKSPACE_ICONS[chat.workspace]`，home 一眼可辨会话归属。

> 未建 `useWorkspace`：目前工作区页面还没有真实地图/表单状态可注入，`body` 只发 `{ model, workspace }`；待有实际模块状态时再引入 context 快照（见 9.7）。

### 9.4 单实例 useChat（实现选型） ✅

**偏离原设计**：原计划用 `:key="chatId"` 的 `CopilotPanel + CopilotConversation` 双组件让每次会话干净挂载。但 USidebar 的 prompt 在 `#footer` 槽、消息在默认槽，keyed 子组件会跨槽被拆开。故改用 **单 `useChat` 实例 + `watch(chatId)` 切换**（即来源二 docs Chat.vue 的成熟模式），全部逻辑收在 [CopilotPanel.vue](../../app/components/CopilotPanel.vue) 一个组件里：

```ts
// 单实例：每次发送按当前 chatId/workspace/model 动态构造请求
const transport = new DefaultChatTransport<UIMessage>({
  prepareSendMessagesRequest: ({ messages }) => ({
    api: `/api/chats/${chatId.value}`,
    headers: { [headerName]: csrf },
    body: { messages, model: model.value }  // workspace 已随建壳落库，流式无需再传
  })
})

const { messages, status, error, sendMessage, regenerate, stop } = useChat({ transport, onError })

// 会话切换：草稿清空，历史拉取并回显
watch(chatId, async (id, prev) => {
  if (id === prev) return
  if (isDraft.value) { messages.value = []; return }
  const chat = await $fetch<{ messages?: UIMessage[] }>(`/api/chats/${id}`)
  messages.value = chat.messages ?? []
  if (messages.value.at(-1)?.role === 'user') regenerate()
}, { immediate: true })
```

关键点：`prepareSendMessagesRequest` 让固定的 transport 在每次请求时读当前 `chatId.value`，无需 remount 即可切换目标 URL；会话切换靠直接给 `messages.value`（`ShallowRef` 可写）赋值。

### 9.5 四条核心流程 ✅

**A. 新建对话**（左栏「新建对话」/ 面板头部 + 号）

```text
newChat() → 换新 draftId + 清空 query
  → chatId 变 → watch(chatId) 命中 isDraft → messages.value = []
  → 空态显示快捷指令
```

**B. 草稿发送首条 → 回显 + 流式**（即时回显）

```text
send(text) → isDraft 时先 POST /api/chats  body={ id, workspace }（建会话壳，幂等）
  → persistToUrl()：?chat=<id> 固化进 URL（chatId 不变 → watch 早退、不重载）
  → sendMessage({ text })
    → prepareSendMessagesRequest → POST /api/chats/${chatId}  body={ messages, model }
        服务端：会话已存在 → 存 user → 生成标题 → streamText → onEnd 存 assistant
  → useChat 本地立即渲染 user（乐观回显）+ 流式渲染 assistant
```

**C. 打开历史会话 → 回显**

```text
搜索选中 openChat(id) / 刷新带 ?chat=id → chatId 变
  → watch(chatId)：GET /api/chats/:id → messages.value = 历史消息
  → 末条为 user 时自动 regenerate；否则等待继续输入，走同一端点追加
```

**D. 切换工作区 → 会话隔离**

```text
点左栏「表单」→ 路由 /workspace/form（path 变、?chat 丢弃）
  → useCopilot 重派生 workspace='form'，chatId 回落 form 草稿
  → watch(chatId) 清空/加载 → 面板显示表单工作区会话
```

历史列表按 `workspace` 过滤：[layout](../../app/layouts/default.vue) 用 `GET /api/chats?workspace=` 喂 `UDashboardSearch`，「新建对话 / 搜索」都作用于当前工作区。

### 9.6 回显 UI ✅

[CopilotPanel.vue](../../app/components/CopilotPanel.vue) 在 `UTheme` 内用 `UChatMessages` 渲染，`#content` 复用已精简的 [MessageContent.vue](../../app/components/chat/message/MessageContent.vue)（只留 reasoning / tool 占位 / text 分发，去掉了未移植的 edit 分支）：

```vue
<UChatMessages v-if="messages.length" :messages="messages" :status="status" should-auto-scroll compact class="px-0 gap-2">
  <template #content="{ message }">
    <ChatMessageContent :message="message" />
  </template>
</UChatMessages>
```

part 直接遍历 `message.parts` 渲染，**未接入**来源二的 `getMergedParts` 合并（见 6 的「未采纳 / 待接入」）。

### 9.7 增强项（按需）

- **消费工作区上下文** ✅：已落地为 [useWorkspaceContext.ts](../../app/composables/useWorkspaceContext.ts)——按工作区产出快照，经 `prepareSendMessagesRequest` 的 body `workspaceContext` 上传，[[id].post.ts](../../server/api/chats/%5Bid%5D.post.ts) 交给 [workspace-context.ts](../../server/utils/workspace-context.ts) zod 校验后注入 system prompt。
- **消息编辑 / 投票** ✅：已接线（[MessageActions.vue](../../app/components/chat/message/MessageActions.vue) / [MessageEdit.vue](../../app/components/chat/message/MessageEdit.vue) + `votes` 端点）。
- **记住每工作区最后打开的会话**：把「工作区 → 最近 chatId」存 `useState` / cookie，切回时自动带上 `?chat=`。
- **标题生成后刷新历史**：首发后服务端已生成标题，前端可在 `status` 转 `streaming` 时 `refreshNuxtData('copilot-chats')` 刷新左栏。
- **文件上传**：组件已移植 `FileUploadButton`，后端与 `useFileUploadWithStatus` 待补。

### 9.8 安全：IDOR 纵深防御 ✅

写路径信任客户端传入的 chatId / messageId，两个接口各做校验：

- **会话级（建壳）**：[chats.post.ts](../../server/api/chats.post.ts) 按 id 查 chat，存在且 `userId` 非当前用户 → `403`，防占用他人会话 id。
- **会话级（流式）**：[chats/[id].post.ts](../../server/api/chats/[id].post.ts) 要求会话已存在，不存在 → `404`，`userId` 非当前用户 → `403`。
- **消息级（流式）**：落库前查 `lastMessage.id` 是否已属于其它会话 → `403`；`onConflictDoUpdate` 加 `setWhere: eq(messages.chatId, id)`，即使 PK 冲突也只允许更新本会话行，防跨会话覆写。
