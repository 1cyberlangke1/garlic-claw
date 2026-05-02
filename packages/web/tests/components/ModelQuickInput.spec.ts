import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModelQuickInput from '@/shared/components/ModelQuickInput.vue'
import { INTERNAL_CONFIG_CHANGED_EVENT } from '@/modules/ai-settings/internal-config-change'
import * as aiApi from '@/modules/ai-settings/api/ai'

vi.mock('@/modules/ai-settings/api/ai', () => ({
  listAiProviders: vi.fn(),
  listAiModels: vi.fn(),
}))

enableAutoUnmount(afterEach)

function createProvider(id: string, available = true) {
  return {
    id,
    name: id,
    driver: 'openai',
    defaultModel: `${id}-default`,
    baseUrl: 'https://example.com/v1',
    modelCount: 1,
    available,
  }
}

function createModel(providerId: string, id: string) {
  return {
    id,
    providerId,
    name: id,
    capabilities: {
      reasoning: false,
      toolCall: false,
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
      url: 'https://example.com/v1/chat/completions',
      npm: '@example/sdk',
    },
    contextLength: 128 * 1024,
  }
}

describe('ModelQuickInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps suggestions from healthy providers when one provider model list fails', async () => {
    vi.mocked(aiApi.listAiProviders).mockResolvedValue([
      createProvider('broken-provider'),
      createProvider('healthy-provider'),
    ])
    vi.mocked(aiApi.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'broken-provider') {
        throw new Error('provider offline')
      }

      return [createModel('healthy-provider', 'healthy-model')]
    })

    const wrapper = mount(ModelQuickInput, {
      props: {
        placeholder: '选择 provider/model',
      },
    })

    await flushPromises()
    await wrapper.find('input').trigger('focus')
    await flushPromises()

    expect(wrapper.text()).toContain('healthy-provider')
    expect(wrapper.text()).toContain('healthy-model')
  })

  it('falls back to an empty suggestion list when provider loading fails', async () => {
    vi.mocked(aiApi.listAiProviders).mockRejectedValue(new Error('providers unavailable'))

    const wrapper = mount(ModelQuickInput)

    await flushPromises()
    await wrapper.find('input').trigger('focus')
    await flushPromises()

    expect(wrapper.findAll('.suggestion-item')).toHaveLength(0)
  })

  it('reloads suggestions after provider-model config changes', async () => {
    vi.mocked(aiApi.listAiProviders)
      .mockResolvedValueOnce([createProvider('provider-a')])
      .mockResolvedValueOnce([createProvider('provider-b')])
    vi.mocked(aiApi.listAiModels)
      .mockResolvedValueOnce([createModel('provider-a', 'model-a')])
      .mockResolvedValueOnce([createModel('provider-b', 'model-b')])

    const wrapper = mount(ModelQuickInput)

    await flushPromises()
    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'provider-models',
      },
    }))
    await flushPromises()
    await wrapper.find('input').trigger('focus')
    await flushPromises()

    expect(vi.mocked(aiApi.listAiProviders).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(wrapper.text()).toContain('provider-b')
    expect(wrapper.text()).toContain('model-b')
  })

  it('keeps the latest suggestions when config refresh returns before an older request', async () => {
    let resolveInitialProviders: ((value: ReturnType<typeof createProvider>[]) => void) | null = null
    let resolveRefreshProviders: ((value: ReturnType<typeof createProvider>[]) => void) | null = null
    let resolveInitialModels: ((value: ReturnType<typeof createModel>[]) => void) | null = null
    let resolveRefreshModels: ((value: ReturnType<typeof createModel>[]) => void) | null = null

    vi.mocked(aiApi.listAiProviders)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveInitialProviders = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefreshProviders = resolve
      }))
    vi.mocked(aiApi.listAiModels).mockImplementation((providerId: string) => {
      if (providerId === 'provider-a') {
        return new Promise((resolve) => {
          resolveInitialModels = resolve
        })
      }
      return new Promise((resolve) => {
        resolveRefreshModels = resolve
      })
    })

    const wrapper = mount(ModelQuickInput)

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'provider-models',
      },
    }))

    resolveRefreshProviders?.([createProvider('provider-b')])
    await flushPromises()
    resolveRefreshModels?.([createModel('provider-b', 'model-b')])
    await flushPromises()
    resolveInitialProviders?.([createProvider('provider-a')])
    await flushPromises()
    resolveInitialModels?.([createModel('provider-a', 'model-a')])
    await flushPromises()
    await wrapper.find('input').trigger('focus')
    await flushPromises()

    expect(wrapper.text()).toContain('provider-b')
    expect(wrapper.text()).toContain('model-b')
    expect(wrapper.text()).not.toContain('provider-a')
    expect(wrapper.text()).not.toContain('model-a')
  })
})
