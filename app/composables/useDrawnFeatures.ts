import type { Feature } from 'geojson'

/**
 * 用户手绘要素，由 <MapboxDrawControl> 的 v-model:features 双向绑定。
 *
 * 与 useMapWorkspace 并列而非嵌套：后者是「当前全部消息的纯归约」，每次消息变化整体重算；
 * 手绘要素是交互产物、不是任何工具输出的函数，若并入其中会在下一条消息到达时被清空。
 *
 * 两条有意为之的后果：
 * - 不落库，刷新即丢。手绘是画布，不是会话产物。
 * - 不随 chatId 重置。切换会话时用户画的东西保留。
 */
export function useDrawnFeatures() {
  return useState<Feature[]>('map-drawn-features', () => [])
}

/**
 * draw-shape 指定的待用颜色：写进下一个画出的要素的 user_color 后即清空。
 * 一次性而非持久画笔——用户自己点控件按钮画的要素不该被上一次 AI 指定的颜色染上。
 */
export function usePendingDrawColor() {
  return useState<string | undefined>('map-pending-draw-color', () => undefined)
}
