import type { LanguageModel } from 'ai'
import type { AlibabaLanguageModelChatOptions } from '@ai-sdk/alibaba'
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

/**
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/alibaba
 */
export const PROVIDER_OPTIONS = {
  anthropic: {
    thinking: {
      type: 'adaptive',
      display: 'summarized',
      budgetTokens: 2048
    },
    effort: 'low'
  },
  openai: {
    reasoningEffort: 'low',
    reasoningSummary: 'detailed'
  },
  google: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingLevel: 'low'
    }
  },
  zai: {
    thinking: { type: 'enabled' }
  },
  deepseek: {
    thinking: { type: 'enabled' }
  },
  alibaba: {
    enableThinking: true
  } satisfies AlibabaLanguageModelChatOptions
}
