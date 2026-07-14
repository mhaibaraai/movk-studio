import type { Options } from 'prettier'
import { defu } from 'defu'

export interface SimplePrettier {
  format: (source: string, options?: Options) => Promise<string>
}

/** 与 eslint 的 stylistic 规则对齐，格式化产物才像是这个项目里写出来的代码 */
const DEFAULT_OPTIONS: Options = {
  parser: 'vue',
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 100
}

/**
 * 提供 $prettier，用于格式化运行时生成的代码（form 工作区的代码页签与导出文件）。
 *
 * 客户端走 prettier/standalone + 按需动态导入的插件：只有真正用到格式化时才拉这块代码，
 * 不进主 bundle，也不像 movk-nuxt-docs 那样在 worker 里从 CDN 取——应用不该有运行时 CDN 依赖。
 */
export default defineNuxtPlugin(() => {
  const prettier: SimplePrettier = {
    async format(source, options) {
      const merged = defu(options, DEFAULT_OPTIONS)

      if (import.meta.server) {
        const { format } = await import('prettier')
        return format(source, merged)
      }

      // vue 解析器由 html 插件提供，其中的 <script lang="ts"> 再交给 typescript + estree
      const [standalone, estree, typescript, html] = await Promise.all([
        import('prettier/standalone'),
        import('prettier/plugins/estree'),
        import('prettier/plugins/typescript'),
        import('prettier/plugins/html')
      ])

      return standalone.format(source, { ...merged, plugins: [estree, typescript, html] })
    }
  }

  return {
    provide: { prettier }
  }
})
