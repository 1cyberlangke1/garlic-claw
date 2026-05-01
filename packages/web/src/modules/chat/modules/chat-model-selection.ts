import type { Ref } from 'vue'
import {
  getAiDefaultSelection,
  listAiModels,
  listAiProviders,
} from '@/modules/ai-settings/api/ai'
import type { ChatMessage } from '@/modules/chat/store/chat-store.types'
import type { AiDefaultProviderSelection } from '@garlic-claw/shared'

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

  const defaultSelection = await readDefaultSelectionSafely()
  const resolvedDefaultSelection = defaultSelection
    ? await resolveProviderSelection(providers, defaultSelection)
    : null
  if (resolvedDefaultSelection) {
    return resolvedDefaultSelection
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

async function resolveProviderSelection(
  providers: ConversationProviderSummary[],
  selection: Pick<AiDefaultProviderSelection, 'providerId' | 'modelId'>,
): Promise<{ providerId: string; modelId: string } | null> {
  if (!selection.providerId || !selection.modelId) {
    return null
  }

  const provider = providers.find((entry) => entry.id === selection.providerId)
  if (!provider) {
    return null
  }

  const models = await listProviderModelsSafely(provider.id)
  if (!models.some((model) => model.id === selection.modelId)) {
    return null
  }

  return {
    providerId: provider.id,
    modelId: selection.modelId,
  }
}

async function listAvailableProvidersSafely(): Promise<ConversationProviderSummary[]> {
  try {
    return (await listAiProviders()).filter((provider) => provider.available)
  } catch {
    return []
  }
}

async function readDefaultSelectionSafely(): Promise<AiDefaultProviderSelection | null> {
  try {
    return await getAiDefaultSelection()
  } catch {
    return null
  }
}

async function listProviderModelsSafely(providerId: string) {
  try {
    return await listAiModels(providerId)
  } catch {
    return []
  }
}
