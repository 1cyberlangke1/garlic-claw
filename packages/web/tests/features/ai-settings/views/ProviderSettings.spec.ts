import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiModelConfig } from '@garlic-claw/shared'

const selectedModels = ref<AiModelConfig[]>([])
const selectedProviderId = ref('provider-a')
const selectedProvider = computed(() => ({ id: 'provider-a', name: 'Provider A' }))
const updateContextLength = vi.fn()

vi.mock('@/modules/ai-settings/composables/use-provider-settings', () => ({
  useProviderSettings: () => ({
    loadingProviders: ref(false),
    savingVision: ref(false),
    savingHostModelRoutingConfig: ref(false),
    savingRuntimeToolsConfig: ref(false),
    savingSubagentConfig: ref(false),
    savingContextGovernanceConfig: ref(false),
    discoveringModels: ref(false),
    testingConnection: ref(false),
    error: ref(''),
    catalog: ref([]),
    defaultSelection: ref({ providerId: 'provider-a', modelId: 'model-a', source: 'default' }),
    providers: ref([{ id: 'provider-a', name: 'Provider A', driver: 'openai', defaultModel: 'model-a', modelCount: 1, available: true }]),
    selectedProviderId,
    selectedProvider,
    selectedModels,
    visionConfig: ref({ enabled: false }),
    hostModelRoutingConfig: ref({ fallbackChatModels: [], utilityModelRoles: {} }),
    runtimeToolsConfigSnapshot: ref(null),
    subagentConfigSnapshot: ref(null),
    contextGovernanceConfigSnapshot: ref(null),
    visionOptions: ref([]),
    hostModelRoutingOptions: ref([]),
    showProviderDialog: ref(false),
    showDiscoveryDialog: ref(false),
    editingProvider: ref(null),
    discoveredModels: ref([]),
    connectionResult: ref(null),
    selectProvider: vi.fn(),
    openCreateDialog: vi.fn(),
    openEditDialog: vi.fn(),
    saveProvider: vi.fn(),
    deleteSelectedProvider: vi.fn(),
    addModel: vi.fn(),
    openDiscoveryDialog: vi.fn(),
    importDiscoveredModels: vi.fn(),
    deleteModel: vi.fn(),
    setDefaultModel: vi.fn(),
    updateCapabilities: vi.fn(),
    updateContextLength,
    testProviderConnection: vi.fn(),
    saveVisionConfig: vi.fn(),
    saveHostModelRoutingConfig: vi.fn(),
    saveRuntimeToolsConfig: vi.fn(),
    saveSubagentConfig: vi.fn(),
    saveContextGovernanceConfig: vi.fn(),
  }),
}))

import ProviderSettings from '@/modules/ai-settings/views/ProviderSettings.vue'

const ConsolePageStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', {}, [slots.header?.(), slots.default?.()])
  },
})

const IconStub = defineComponent({
  setup() {
    return () => h('span')
  },
})

const ElButtonStub = defineComponent({
  emits: ['click'],
  props: { type: { type: String, default: 'button' } },
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      type: props.type,
      onClick: (event: Event) => emit('click', event),
    }, slots.default?.())
  },
})

const ElCheckboxStub = defineComponent({
  emits: ['change'],
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { attrs, emit, slots }) {
    return () => h('label', {}, [
      h('input', {
        ...attrs,
        checked: props.modelValue,
        type: 'checkbox',
        onChange: (event: Event) => emit('change', (event.target as HTMLInputElement).checked),
      }),
      slots.default?.(),
    ])
  },
})

const ElInputStub = defineComponent({
  emits: ['blur', 'input', 'update:modelValue'],
  props: {
    modelValue: { type: [String, Number], default: undefined },
    type: { type: String, default: 'text' },
  },
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      type: props.type,
      value: props.modelValue ?? '',
      onBlur: () => emit('blur'),
      onInput: (event: Event) => {
        const value = (event.target as HTMLInputElement).value
        emit('input', value)
        emit('update:modelValue', value)
      },
    })
  },
})

function createModel(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
  return {
    id: 'model-a',
    providerId: 'provider-a',
    name: 'Model A',
    contextLength: 128_000,
    capabilities: {
      reasoning: false,
      toolCall: false,
      input: { text: true, image: false },
      output: { text: true, image: false },
    },
    api: {
      id: 'model-a',
      url: 'https://example.com/v1/chat/completions',
    },
    ...overrides,
  }
}

describe('ProviderSettings', () => {
  beforeEach(() => {
    updateContextLength.mockReset()
    selectedProviderId.value = 'provider-a'
    selectedModels.value = [createModel()]
  })

  it('does not auto-save context length while the user is still typing', async () => {
    const wrapper = mount(ProviderSettings, {
      global: {
        stubs: {
          ConsolePage: ConsolePageStub,
          Icon: IconStub,
          ElButton: ElButtonStub,
          ElCheckbox: ElCheckboxStub,
          ElInput: ElInputStub,
          AiModelDiscoveryDialog: true,
          AiProviderEditorDialog: true,
          ContextGovernanceSettingsPanel: true,
          HostModelRoutingPanel: true,
          RuntimeToolsSettingsPanel: true,
          SubagentSettingsPanel: true,
          VisionFallbackPanel: true,
        },
      },
    })

    const input = wrapper.get('[data-test="context-length-input-model-a"]')
    await input.setValue('65536')

    expect(updateContextLength).not.toHaveBeenCalled()

    selectedModels.value = [createModel()]
    await nextTick()

    expect((wrapper.get('[data-test="context-length-input-model-a"]').element as HTMLInputElement).value).toBe('65536')
    expect(updateContextLength).not.toHaveBeenCalled()

    await input.trigger('blur')

    expect(updateContextLength).toHaveBeenCalledTimes(1)
    expect(updateContextLength).toHaveBeenCalledWith({
      modelId: 'model-a',
      contextLength: 65536,
    })
  })
})
