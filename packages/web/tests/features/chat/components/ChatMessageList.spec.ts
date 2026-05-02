import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatMessageList from '@/modules/chat/components/ChatMessageList.vue'

describe('ChatMessageList', () => {
  it('renders vision fallback chips and collapsible transcription details only when present', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: '请看图',
            status: 'completed',
            error: null,
            metadata: {
              visionFallback: {
                state: 'completed',
                entries: [
                  {
                    text: '图片里是一只趴着的橘猫。',
                    source: 'generated',
                  },
                ],
              },
            },
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '这是一只橘猫。',
            provider: 'openai',
            model: 'gpt-4.1',
            status: 'completed',
            error: null,
            metadata: {
              visionFallback: {
                state: 'completed',
                entries: [
                  {
                    text: '图片里是一只趴着的橘猫。',
                    source: 'generated',
                  },
                ],
              },
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            provider: 'openai',
            model: 'gpt-4.1',
            status: 'pending',
            error: null,
            metadata: {
              visionFallback: {
                state: 'transcribing',
                entries: [],
              },
            },
          },
          {
            id: 'assistant-3',
            role: 'assistant',
            content: '纯文本回复',
            provider: 'openai',
            model: 'gpt-4.1',
            status: 'completed',
            error: null,
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('图像转述')
    expect(wrapper.text()).toContain('图像转述中')
    expect(wrapper.text()).toContain('查看图像转述')
    expect(wrapper.text()).toContain('图片里是一只趴着的橘猫。')
    expect(wrapper.find('[data-message-id="assistant-1"] .message-role-avatar-image').attributes('src')).toBe('/api/personas/persona.writer/avatar')
    expect(wrapper.find('[data-message-id="user-1"] .message-role-avatar-image').exists()).toBe(false)

    const plainAssistant = wrapper.find('[data-message-id="assistant-3"]')
    expect(plainAssistant.text()).not.toContain('图像转述')
  })

  it('renders assistant custom blocks above the message content and keeps them collapsed by default', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '正式回复',
            provider: 'deepseek',
            model: 'deepseek-reasoner',
            status: 'completed',
            error: null,
            metadata: {
              customBlocks: [
                {
                  id: 'custom-field:reasoning_content',
                  kind: 'text',
                  title: 'Reasoning Content',
                  text: '先检查上下文',
                  state: 'done',
                  source: {
                    providerId: 'deepseek',
                    origin: 'ai-sdk.raw',
                    key: 'reasoning_content',
                  },
                },
              ],
            } as never,
          },
        ],
      },
    })

    const assistant = wrapper.find('[data-message-id="assistant-1"]')
    const details = assistant.find('details.message-custom-block')
    const summary = assistant.find('.message-custom-block-summary')
    const content = assistant.find('.message-content')

    expect(details.exists()).toBe(true)
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(summary.text()).toContain('Reasoning Content')
    expect(summary.text()).toContain('文本')
    expect(assistant.text()).toContain('先检查上下文')
    expect(assistant.html().indexOf('message-custom-blocks')).toBeLessThan(
      assistant.html().indexOf('message-content'),
    )
    expect(content.text()).toContain('正式回复')
  })

  it('renders display-only context compaction summary with dedicated styling', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'display-summary',
            role: 'display',
            content: '压缩后的历史摘要',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  type: 'context-compaction',
                  owner: 'conversation.context-governance',
                  version: '1',
                  data: {
                    role: 'summary',
                    trigger: 'manual',
                    coveredCount: 3,
                    providerId: 'openai',
                    modelId: 'gpt-5.4',
                    beforePreview: {
                      estimatedTokens: 1200,
                    },
                    afterPreview: {
                      estimatedTokens: 420,
                    },
                  },
                },
              ],
            } as never,
          },
        ],
      },
    })

    const displayMessage = wrapper.find('[data-message-id="display-summary"]')
    const details = displayMessage.find('details.message-annotation-context-compaction')
    const summary = displayMessage.find('.message-annotation-summary')

    expect(details.exists()).toBe(true)
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(summary.text()).toContain('上下文压缩')
    expect(summary.text()).toContain('覆盖 3 条消息')
    expect(displayMessage.text()).toContain('摘要')
    expect(displayMessage.text()).toContain('仅展示，不进入 LLM 上下文')
    expect(displayMessage.text()).toContain('压缩后的历史摘要')
    expect(displayMessage.classes()).toContain('display')
    expect(displayMessage.find('.message-context-visibility.excluded').exists()).toBe(true)
    expect(displayMessage.find('.message-role-avatar-image').exists()).toBe(false)
    expect(displayMessage.find('.retry-text').exists()).toBe(false)
    expect(displayMessage.html().indexOf('message-annotation-context-compaction')).toBeLessThan(
      displayMessage.html().indexOf('message-content'),
    )
  })

  it('renders persisted display command and result messages with distinct variants', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'display-command',
            role: 'display',
            content: '/compact',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    variant: 'command',
                  },
                  owner: 'conversation.display-message',
                  type: 'display-message',
                  version: '1',
                },
              ],
            } as never,
          },
          {
            id: 'display-result',
            role: 'display',
            content: '已压缩上下文，覆盖 2 条历史消息。',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    variant: 'result',
                  },
                  owner: 'conversation.display-message',
                  type: 'display-message',
                  version: '1',
                },
              ],
            } as never,
          },
        ],
      },
    })

    const commandMessage = wrapper.find('[data-message-id="display-command"]')
    const resultMessage = wrapper.find('[data-message-id="display-result"]')

    expect(commandMessage.text()).toContain('命令')
    expect(commandMessage.classes()).toContain('display-command')
    expect(commandMessage.text()).toContain('/compact')
    expect(resultMessage.text()).toContain('展示')
    expect(resultMessage.classes()).toContain('display-result')
    expect(resultMessage.text()).toContain('已压缩上下文，覆盖 2 条历史消息。')
  })

  it('grays out messages excluded from the current LLM context window without deleting them', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        contextWindowPreview: {
          contextLength: 256,
          enabled: true,
          estimatedTokens: 120,
          excludedMessageIds: ['assistant-1'],
          frontendMessageWindowSize: 200,
          includedMessageIds: ['assistant-2'],
          keepRecentMessages: 2,
          slidingWindowUsagePercent: 50,
          strategy: 'sliding',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '这条消息已经脱离上下文窗口。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '这条消息仍在当前上下文窗口内。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
          },
        ],
      },
    })

    const excludedMessage = wrapper.find('[data-message-id="assistant-1"]')
    const includedMessage = wrapper.find('[data-message-id="assistant-2"]')

    expect(excludedMessage.classes()).toContain('excluded-from-context')
    expect(excludedMessage.text()).toContain('已脱离当前 LLM 上下文')
    expect(excludedMessage.text()).toContain('这条消息已经脱离上下文窗口。')
    expect(includedMessage.classes()).not.toContain('excluded-from-context')
  })

  it('renders tool calls and tool results as collapsed timeline blocks before the assistant reply', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-tools',
            role: 'assistant',
            content: '最终答复在工具后面。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
            toolCalls: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'spawn_subagent',
                input: {
                  name: '资料核对员',
                  prompt: '检查引用来源',
                },
                inputPreview: '{"name":"资料核对员","prompt":"检查引用来源"}',
              },
            ],
            toolResults: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'spawn_subagent',
                output: {
                  conversationId: 'subagent-conversation-1',
                  status: 'completed',
                },
                outputPreview: '{"conversationId":"subagent-conversation-1","status":"completed"}',
              },
            ],
          },
        ],
      },
    })

    const assistant = wrapper.find('[data-message-id="assistant-tools"]')
    const toolEntries = assistant.findAll('details.tool-entry')
    const summaryText = toolEntries.map((entry) => entry.find('summary').text())

    expect(toolEntries).toHaveLength(2)
    expect((toolEntries[0].element as HTMLDetailsElement).open).toBe(false)
    expect((toolEntries[1].element as HTMLDetailsElement).open).toBe(false)
    expect(summaryText[0]).toContain('调用')
    expect(summaryText[0]).toContain('spawn_subagent')
    expect(summaryText[1]).toContain('结果')
    expect(summaryText[1]).toContain('spawn_subagent')
    expect(assistant.text()).toContain('最终答复在工具后面。')
    expect(assistant.html().indexOf('tool-timeline')).toBeLessThan(
      assistant.html().indexOf('message-content'),
    )

    toolEntries[0].element.setAttribute('open', '')
    toolEntries[1].element.setAttribute('open', '')

    expect(assistant.text()).toContain('资料核对员')
    expect(assistant.text()).toContain('conversationId')
    expect(assistant.text()).toContain('subagent-conversation-1')
  })

  it('renders assistant usage details behind an info toggle and includes total and cached tokens when provided', async () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-usage-1',
            role: 'assistant',
            content: '第一条回复',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    cachedInputTokens: 64,
                    inputTokens: 320,
                    modelId: 'gpt-5.4',
                    outputTokens: 120,
                    providerId: 'openai',
                    source: 'provider',
                    totalTokens: 440,
                  },
                  owner: 'conversation.model-usage',
                  type: 'model-usage',
                  version: '1',
                },
              ],
            } as never,
          },
          {
            id: 'assistant-usage-2',
            role: 'assistant',
            content: '第二条回复',
            provider: 'openai',
            model: 'gpt-5.4-mini',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    inputTokens: 180,
                    modelId: 'gpt-5.4-mini',
                    outputTokens: 40,
                    providerId: 'openai',
                    source: 'provider',
                    totalTokens: 220,
                  },
                  owner: 'conversation.model-usage',
                  type: 'model-usage',
                  version: '1',
                },
              ],
            } as never,
          },
          {
            id: 'assistant-usage-3',
            role: 'assistant',
            content: '第三条回复',
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    inputTokens: 42,
                    modelId: 'deepseek-v4-flash',
                    outputTokens: 21,
                    providerId: 'ds2api',
                    source: 'provider',
                    totalTokens: 63,
                  },
                  owner: 'conversation.model-usage',
                  type: 'model-usage',
                  version: '1',
                },
              ],
            } as never,
          },
        ],
      },
    })

    const firstAssistant = wrapper.find('[data-message-id="assistant-usage-1"]')
    const secondAssistant = wrapper.find('[data-message-id="assistant-usage-2"]')
    const thirdAssistant = wrapper.find('[data-message-id="assistant-usage-3"]')

    expect(firstAssistant.find('.usage-info-toggle').text()).toBe('[i]')
    expect(firstAssistant.text()).not.toContain('输入 token')
    expect(thirdAssistant.find('.usage-info-toggle').text()).toBe('[i]')

    await firstAssistant.find('.usage-info-toggle').trigger('click')

    expect(firstAssistant.text()).toContain('输入 token')
    expect(firstAssistant.text()).toContain('320')
    expect(firstAssistant.text()).toContain('总 token')
    expect(firstAssistant.text()).toContain('440')
    expect(firstAssistant.text()).toContain('输出 token')
    expect(firstAssistant.text()).toContain('120')
    expect(firstAssistant.text()).toContain('缓存 token')
    expect(firstAssistant.text()).toContain('64')

    await secondAssistant.find('.usage-info-toggle').trigger('click')

    expect(secondAssistant.text()).toContain('输入 token')
    expect(secondAssistant.text()).toContain('180')
    expect(secondAssistant.text()).toContain('总 token')
    expect(secondAssistant.text()).toContain('220')
    expect(secondAssistant.text()).toContain('输出 token')
    expect(secondAssistant.text()).toContain('40')
    expect(secondAssistant.text()).not.toContain('缓存 token')

    await thirdAssistant.find('.usage-info-toggle').trigger('click')

    expect(thirdAssistant.text()).toContain('输入 token')
    expect(thirdAssistant.text()).toContain('42')
    expect(thirdAssistant.text()).toContain('总 token')
    expect(thirdAssistant.text()).toContain('63')
    expect(thirdAssistant.text()).toContain('输出 token')
    expect(thirdAssistant.text()).toContain('21')
  })
})
