import type { Ref } from 'vue'
import { listAiModels, listAiProviders } from '@/features/ai-settings/api/ai'
import type { ChatMessage } from '@/features/chat/store/chat-store.types'

interface ConversationProviderSummary {
  id: string
  available: boolean
  defaultModel?: string
}

export function findLatestAssistantSelection(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.model) {
      return {
        providerId: message.provider ?? null,
        modelId: message.model,
      }
    }
  }

  return {
    providerId: null,
    modelId: null,
  }
}

export async function ensureChatModelSelection(params: {
  selectedProvider: Ref<string | null>
  selectedModel: Ref<string | null>
  messages: ChatMessage[]
}) {
  if (params.selectedProvider.value && params.selectedModel.value) {
    return
  }

  const resolved = await resolveChatModelSelection(
    findLatestAssistantSelection(params.messages),
  )
  if (!resolved) {
    return
  }

  params.selectedProvider.value = resolved.providerId
  params.selectedModel.value = resolved.modelId
}

export async function resolveChatModelSelection(preferred: {
  providerId?: string | null
  modelId?: string | null
}): Promise<{ providerId: string; modelId: string } | null> {
  const providers = await listAvailableProvidersSafely()

  if (preferred.providerId && preferred.modelId) {
    const direct = providers.find((provider) => provider.id === preferred.providerId)
    if (direct) {
      const models = await listProviderModelsSafely(direct.id)
      if (models.some((model) => model.id === preferred.modelId)) {
        return {
          providerId: preferred.providerId,
          modelId: preferred.modelId,
        }
      }
    }
  }

  if (preferred.modelId) {
    const matchedProviders = await findProvidersByModelId(providers, preferred.modelId)
    if (matchedProviders.length === 1) {
      return {
        providerId: matchedProviders[0].id,
        modelId: preferred.modelId,
      }
    }
  }

  for (const provider of providers) {
    if (provider.defaultModel) {
      return {
        providerId: provider.id,
        modelId: provider.defaultModel,
      }
    }

    const models = await listProviderModelsSafely(provider.id)
    if (models[0]) {
      return {
        providerId: provider.id,
        modelId: models[0].id,
      }
    }
  }

  return null
}

async function findProvidersByModelId(
  providers: ConversationProviderSummary[],
  modelId: string,
): Promise<ConversationProviderSummary[]> {
  const results = await Promise.all(
    providers.map(async (provider) => {
      if (provider.defaultModel === modelId) {
        return provider
      }

      const models = await listProviderModelsSafely(provider.id)
      return models.some((model) => model.id === modelId) ? provider : null
    }),
  )

  return results.filter(
    (provider): provider is ConversationProviderSummary => provider !== null,
  )
}

async function listAvailableProvidersSafely(): Promise<ConversationProviderSummary[]> {
  try {
    return (await listAiProviders()).filter((provider) => provider.available)
  } catch {
    return []
  }
}

async function listProviderModelsSafely(providerId: string) {
  try {
    return await listAiModels(providerId)
  } catch {
    return []
  }
}
