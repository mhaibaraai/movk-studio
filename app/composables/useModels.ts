import { MODELS } from '#shared/utils/models'

export function useModels() {
  const model = useCookie<string>('model', { default: () => MODELS[0]?.value ?? '' })

  return {
    models: MODELS,
    model
  }
}
