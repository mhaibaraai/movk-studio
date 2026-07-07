import type { AlibabaLanguageModelChatOptions } from '@ai-sdk/alibaba'

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
