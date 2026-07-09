const EARTH_RADIUS_M = 6371008.8

function haversineMeters([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export default defineMcpTool({
  ...mcpToolFrom('measure-distance'),
  handler: (input) => {
    const points = input.coordinates as [number, number][]
    let meters = 0
    for (let i = 1; i < points.length; i++) {
      meters += haversineMeters(points[i - 1]!, points[i]!)
    }
    const kilometers = meters / 1000
    const text = kilometers >= 1
      ? `${kilometers.toFixed(2)} 公里`
      : `${Math.round(meters)} 米`
    return { meters: Math.round(meters), kilometers: Number(kilometers.toFixed(3)), text }
  }
})
