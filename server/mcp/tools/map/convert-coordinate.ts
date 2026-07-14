import { transformPoint } from '@movk/mapbox/utils/coordinate'

export default defineMcpTool({
  ...mcpToolFrom('convert-coordinate'),
  handler: (input) => {
    const [longitude, latitude] = transformPoint(
      [input.longitude, input.latitude],
      input.from,
      input.to,
      { precision: 6 }
    )
    return { longitude, latitude, from: input.from, to: input.to }
  }
})
