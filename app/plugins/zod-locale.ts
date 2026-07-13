import { z } from 'zod'

/**
 * zod 的默认错误文案是英文，会原样出现在 AutoForm 的字段错误位。
 *
 * 全局配置而非逐字段传 error：afz.enum 不接受自定义错误文案（它的第二参是 meta 而非 error），
 * 逐字段覆盖覆不全，且 error 混进 enum 的 meta 会被当成 UFormField 的 error prop 常驻显示。
 *
 * 优先级：契约里逐条校验的文案（如「最少 2 个字符」）> customError（必填）> zhCN locale。
 */
export default defineNuxtPlugin(() => {
  z.config({
    ...z.locales.zhCN(),
    // 未填写时 zod 报的是类型错误（「期望 string，实际接收 undefined」），对终端用户毫无意义
    customError: issue => (issue.input === undefined ? '此项为必填' : undefined)
  })
})
