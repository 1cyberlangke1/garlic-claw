import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import HostModelRoutingPanel from '@/modules/ai-settings/components/HostModelRoutingPanel.vue'

const ElSelectStub = defineComponent({
  name: 'ElSelect',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots, attrs }) {
    return () => h('select', {
      ...attrs,
      value: props.modelValue,
      onChange: (event: Event) => {
        emit('update:modelValue', (event.target as HTMLSelectElement).value)
      },
    }, slots.default?.())
  },
})

const ElOptionStub = defineComponent({
  name: 'ElOption',
  props: {
    label: {
      type: String,
      default: '',
    },
    value: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => h('option', { value: props.value }, props.label)
  },
})

describe('HostModelRoutingPanel', () => {
  it('只编辑聊天回退链并发出保存事件', async () => {
    const wrapper = mount(HostModelRoutingPanel, {
      global: {
        stubs: {
          ElSelect: ElSelectStub,
          ElOption: ElOptionStub,
        },
      },
      props: {
        saving: false,
        config: {
          fallbackChatModels: [],
          utilityModelRoles: {},
        } as never,
        options: [
          {
            providerId: 'openai',
            modelId: 'gpt-4.1-mini',
            label: 'OpenAI / GPT-4.1 Mini',
          },
          {
            providerId: 'anthropic',
            modelId: 'claude-3-7-sonnet',
            label: 'Anthropic / Claude 3.7 Sonnet',
          },
        ],
      },
    })

    await wrapper.get('[data-test="fallback-model-select"]').setValue(
      'anthropic::claude-3-7-sonnet',
    )
    await wrapper.get('[data-test="fallback-model-add"]').trigger('click')
    await wrapper.get('[data-test="auto-retry-enabled"]').setValue('false')
    await wrapper.get('[data-test="auto-retry-max-retries"]').setValue('4')
    await wrapper.get('[data-test="host-routing-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          chatAutoRetry: {
            backoffFactor: 2,
            enabled: false,
            initialDelayMs: 2000,
            maxDelayMs: 30000,
            maxRetries: 4,
          },
          fallbackChatModels: [
            {
              providerId: 'anthropic',
              modelId: 'claude-3-7-sonnet',
            },
          ],
          utilityModelRoles: {},
        },
      ],
    ])
  })

  it('保存中会禁用保存按钮', () => {
    const wrapper = mount(HostModelRoutingPanel, {
      props: {
        saving: true,
        config: {
          fallbackChatModels: [],
          utilityModelRoles: {},
        } as never,
        options: [],
      },
    })

    expect(wrapper.get('[data-test="host-routing-save"]').attributes('disabled')).toBeDefined()
  })

  it('保存自动重试配置时会保留既有 compressionModel 与 utilityModelRoles', async () => {
    const wrapper = mount(HostModelRoutingPanel, {
      props: {
        saving: false,
        config: {
          chatAutoRetry: {
            backoffFactor: 2,
            enabled: true,
            initialDelayMs: 2000,
            maxDelayMs: 30000,
            maxRetries: 2,
          },
          compressionModel: {
            providerId: 'openai',
            modelId: 'gpt-4.1-mini',
          },
          fallbackChatModels: [],
          utilityModelRoles: {
            conversationTitle: {
              providerId: 'anthropic',
              modelId: 'claude-3-7-sonnet',
            },
          },
        } as never,
        options: [],
      },
    })

    await wrapper.get('[data-test="auto-retry-max-retries"]').setValue('5')
    await wrapper.get('[data-test="host-routing-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          chatAutoRetry: {
            backoffFactor: 2,
            enabled: true,
            initialDelayMs: 2000,
            maxDelayMs: 30000,
            maxRetries: 5,
          },
          compressionModel: {
            providerId: 'openai',
            modelId: 'gpt-4.1-mini',
          },
          fallbackChatModels: [],
          utilityModelRoles: {
            conversationTitle: {
              providerId: 'anthropic',
              modelId: 'claude-3-7-sonnet',
            },
          },
        },
      ],
    ])
  })
})
