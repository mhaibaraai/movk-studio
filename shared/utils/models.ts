import type { AlibabaLanguageModelChatOptions } from '@ai-sdk/alibaba'

export const MODELS = [
  { label: 'GLM 5.2', value: 'alibaba/glm-5.2', icon: 'i-custom-qwen' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5', icon: 'i-simple-icons-anthropic' },
  { label: 'GPT-5 Nano', value: 'openai/gpt-5-nano', icon: 'i-simple-icons-openai' },
  { label: 'Qwen 3.6 Plus', value: 'alibaba/qwen3.6-plus', icon: 'i-custom-qwen' },
  { label: 'GLM 5.2', value: 'zai/glm-5.2', icon: 'i-custom-zai' },
  { label: 'Deepseek V3.2', value: 'deepseek/deepseek-v3.2', icon: 'i-custom-deepseek' }
]

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

type ProviderOptions = Record<string, Record<string, JsonValue>>

export function resolveProviderOptions(modelId: string): ProviderOptions {
  // https://ai-sdk.dev/providers/ai-sdk-providers/alibaba
  if (modelId.startsWith('alibaba/')) {
    return { alibaba: { enableThinking: true } satisfies AlibabaLanguageModelChatOptions as Record<string, JsonValue> }
  }
  if (modelId.startsWith('anthropic/')) {
    return { anthropic: { thinking: { type: 'enabled', budgetTokens: 4096 } } }
  }
  if (modelId.startsWith('openai/')) {
    return { openai: { reasoningEffort: 'low' } }
  }
  if (modelId.startsWith('zai/')) {
    return { zai: { thinking: { type: 'enabled' } } }
  }
  if (modelId.startsWith('deepseek/')) {
    return { deepseek: { thinking: { type: 'enabled' } } }
  }

  return {}
}
