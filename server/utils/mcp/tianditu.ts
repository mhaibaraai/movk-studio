import type { Poi } from '#mapbox/types'
import type { TiandituClient } from '@movk/mapbox/utils/tianditu-client'
import { createTianditu } from '@movk/mapbox/utils/tianditu-client'

let client: TiandituClient | undefined

/**
 * 天地图 Web 服务客户端；tk 恒定，进程内构造一次。
 * 需要服务端类型的 key（按 IP 白名单校验），与浏览器端的 mapbox.tiandituToken 不是同一个。
 */
export function useTianditu(): TiandituClient {
  if (client) return client

  const tk = useRuntimeConfig().tiandituApiToken
  if (!tk) {
    throw createError({ statusCode: 500, statusMessage: '天地图服务端 token 未配置（NUXT_TIANDITU_API_TOKEN）' })
  }

  client = createTianditu({ tk })
  return client
}

// search-poi 与 search-poi-in-area 共用的输出形状：id 供客户端 v-for 稳定 key
export function toPoiResults(pois: Poi[]) {
  return {
    results: pois.map(poi => ({
      id: crypto.randomUUID(),
      name: poi.name,
      address: poi.address,
      location: poi.location,
      distance: poi.distance
    })),
    count: pois.length
  }
}
