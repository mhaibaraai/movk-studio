import type { LanguageModel } from 'ai'
import { createAlibaba } from '@ai-sdk/alibaba'

const ALIBABA_PREFIX = 'alibaba/'

const alibaba = createAlibaba({
  baseURL: process.env.ALIBABA_BASE_URL
})

export function resolveModel(modelId: string): LanguageModel {
  if (modelId.startsWith(ALIBABA_PREFIX)) {
    return alibaba(modelId.slice(ALIBABA_PREFIX.length))
  }

  return modelId
}
