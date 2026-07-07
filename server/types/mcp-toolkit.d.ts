// #nuxt-mcp-toolkit/tools.mjs 的官方类型经 nuxt.d.ts 仅注入 app 配置；server 配置的 exclude 含
// node_modules，导致该虚拟模块 d.ts 被排除，server 侧无法解析。此处为 server 侧补声明。
declare module '#nuxt-mcp-toolkit/tools.mjs' {
  import type { McpToolDefinitionListItem } from '@nuxtjs/mcp-toolkit/server'

  export const tools: McpToolDefinitionListItem[]
}
