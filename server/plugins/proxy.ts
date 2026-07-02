import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici'

export default defineNitroPlugin(() => {
  if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY)
    return

  setGlobalDispatcher(new EnvHttpProxyAgent({
    headersTimeout: 10_000,
    bodyTimeout: 10_000
  }))
})
