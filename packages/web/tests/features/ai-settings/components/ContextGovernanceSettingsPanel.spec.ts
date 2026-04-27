import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ContextGovernanceSettingsPanel from '@/features/ai-settings/components/ContextGovernanceSettingsPanel.vue'

const SchemaConfigFormStub = defineComponent({
  name: 'SchemaConfigForm',
  props: {
    saving: {
      type: Boolean,
      required: true,
    },
    showHeader: {
      type: Boolean,
      required: true,
    },
    snapshot: {
      type: Object,
      required: false,
      default: null,
    },
  },
  emits: ['save'],
  template: '<button data-test="schema-save" @click="$emit(\'save\', snapshot?.values ?? {})">save</button>',
})

const ModelQuickInputStub = defineComponent({
  name: 'ModelQuickInput',
  props: {
    disabled: {
      type: Boolean,
      required: false,
      default: false,
    },
    model: {
      type: String,
      required: false,
      default: null,
    },
    placeholder: {
      type: String,
      required: false,
      default: '',
    },
    provider: {
      type: String,
      required: false,
      default: null,
    },
  },
  emits: ['change'],
  template: '<button data-test="model-change" @click="$emit(\'change\', { providerId: \'openai\', modelId: \'gpt-4.1-mini\' })">change</button>',
})

describe('ContextGovernanceSettingsPanel', () => {
  it('merges the selected compression model into the saved context governance config', async () => {
    const wrapper = mount(ContextGovernanceSettingsPanel, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              contextCompaction: {
                type: 'object',
                items: {
                  enabled: {
                    type: 'bool',
                  },
                },
              },
            },
          },
          values: {
            contextCompaction: {
              enabled: true,
            },
          },
        },
      },
      global: {
        stubs: {
          ModelQuickInput: ModelQuickInputStub,
          SchemaConfigForm: SchemaConfigFormStub,
        },
      },
    })

    await wrapper.get('[data-test="model-change"]').trigger('click')
    await wrapper.get('[data-test="schema-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          contextCompaction: {
            compressionModel: {
              modelId: 'gpt-4.1-mini',
              providerId: 'openai',
            },
            enabled: true,
          },
        },
      ],
    ])
  })

  it('removes the saved compression model when the user clears it', async () => {
    const wrapper = mount(ContextGovernanceSettingsPanel, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              contextCompaction: {
                type: 'object',
                items: {
                  enabled: {
                    type: 'bool',
                  },
                },
              },
            },
          },
          values: {
            contextCompaction: {
              compressionModel: {
                modelId: 'gpt-4.1-mini',
                providerId: 'openai',
              },
              enabled: true,
            },
          },
        },
      },
      global: {
        stubs: {
          ModelQuickInput: ModelQuickInputStub,
          SchemaConfigForm: SchemaConfigFormStub,
        },
      },
    })

    await wrapper.get('.clear-button').trigger('click')
    await wrapper.get('[data-test="schema-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          contextCompaction: {
            enabled: true,
          },
        },
      ],
    ])
  })
})
