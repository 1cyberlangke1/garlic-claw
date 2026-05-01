import { describe, expect, it, beforeEach, vi } from 'vitest'
import { resolveChatModelSelection } from '@/modules/chat/modules/chat-model-selection'

vi.mock('@/modules/ai-settings/api/ai', () => ({
  getAiDefaultSelection: vi.fn(),
  listAiModels: vi.fn(),
  listAiProviders: vi.fn(),
}))

import * as aiApi from '@/modules/ai-settings/api/ai'

describe('resolveChatModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aiApi.listAiProviders).mockResolvedValue([
      createProvider('anthropic', 'claude-3-5-sonnet-20241022'),
      createProvider('nvidia', 'openai/gpt-oss-20b'),
    ])
    vi.mocked(aiApi.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'anthropic') {
        return [createModel(providerId, 'claude-3-5-sonnet-20241022')]
      }
      if (providerId === 'nvidia') {
        return [createModel(providerId, 'openai/gpt-oss-20b')]
      }
      return []
    })
    vi.mocked(aiApi.getAiDefaultSelection).mockResolvedValue({
      providerId: 'nvidia',
      modelId: 'openai/gpt-oss-20b',
      source: 'default',
    })
  })

  it('prefers the latest assistant selection when that model still exists', async () => {
    await expect(resolveChatModelSelection({
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
    })).resolves.toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
    })

    expect(aiApi.getAiDefaultSelection).not.toHaveBeenCalled()
  })

  it('prefers the persisted backend default selection over the first available provider', async () => {
    await expect(resolveChatModelSelection({})).resolves.toEqual({
      providerId: 'nvidia',
      modelId: 'openai/gpt-oss-20b',
    })
  })

  it('falls back to the local provider list when the backend default selection is unavailable', async () => {
    vi.mocked(aiApi.getAiDefaultSelection).mockResolvedValue({
      providerId: 'missing-provider',
      modelId: 'missing-model',
      source: 'default',
    })

    await expect(resolveChatModelSelection({})).resolves.toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
    })
  })

  it('falls back to the local provider list when reading backend default selection fails', async () => {
    vi.mocked(aiApi.getAiDefaultSelection).mockRejectedValue(new Error('network failed'))

    await expect(resolveChatModelSelection({})).resolves.toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
    })
  })
})

function createProvider(id: string, defaultModel?: string) {
  return {
    id,
    name: id,
    driver: id,
    defaultModel,
    modelCount: defaultModel ? 1 : 0,
    available: true,
  }
}

function createModel(providerId: string, id: string) {
  return {
    id,
    providerId,
    name: id,
    contextLength: 128_000,
    capabilities: {
      reasoning: false,
      toolCall: true,
      input: {
        text: true,
        image: false,
      },
      output: {
        text: true,
        image: false,
      },
    },
    api: {
      id,
      url: 'https://example.com/v1',
      npm: '@ai-sdk/openai',
    },
  }
}
