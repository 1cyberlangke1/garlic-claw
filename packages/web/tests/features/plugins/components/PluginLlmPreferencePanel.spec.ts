import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import PluginLlmPreferencePanel from '@/modules/plugins/components/PluginLlmPreferencePanel.vue'

const ElSelectStub = defineComponent({
  name: 'ElSelect',
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
    modelValue: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots, attrs }) {
    return () => h('select', {
      ...attrs,
      disabled: props.disabled,
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

describe('PluginLlmPreferencePanel', () => {
  it('emits override preference when provider and model are selected', async () => {
    const wrapper = mount(PluginLlmPreferencePanel, {
      global: {
        stubs: {
          ElOption: ElOptionStub,
          ElSelect: ElSelectStub,
        },
      },
      props: {
        preference: {
          mode: 'inherit',
          modelId: null,
          providerId: null,
        },
        providers: [
          {
            id: 'ds2api',
            name: 'DeepSeek',
            mode: 'protocol',
            driver: 'openai',
            available: true,
            modelCount: 1,
          },
        ],
        options: [
          {
            providerId: 'ds2api',
            modelId: 'deepseek-reasoner',
            label: 'DeepSeek · deepseek-reasoner',
          },
        ],
        saving: false,
      },
    })

    const selects = wrapper.findAll('select')
    await selects[0].setValue('override')
    await wrapper.get('[data-test="plugin-llm-provider"]').setValue('ds2api')
    await wrapper.get('[data-test="plugin-llm-model"]').setValue('deepseek-reasoner')
    await wrapper.get('[data-test="plugin-llm-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [{
        mode: 'override',
        modelId: 'deepseek-reasoner',
        providerId: 'ds2api',
      }],
    ])
  })
})
