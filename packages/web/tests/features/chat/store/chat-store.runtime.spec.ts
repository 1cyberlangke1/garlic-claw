import { describe, expect, it } from 'vitest'
import type { SSEEvent } from '@garlic-claw/shared'
import { applySseEvent, getRetryableMessageId } from '@/modules/chat/store/chat-store.runtime'
import type { ChatMessage } from '@/modules/chat/store/chat-store.types'

describe('applySseEvent', () => {
  it('overrides the assistant content when a message-patch event arrives', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '原始回复',
        status: 'streaming',
        error: null,
      },
    ]
    const event: SSEEvent = {
      type: 'message-patch',
      messageId: 'assistant-1',
      content: '插件润色后的最终回复',
      parts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '插件润色后的最终回复',
        },
      ],
    }

    expect(applySseEvent(messages, event, { requestKind: 'send' })).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '插件润色后的最终回复',
        parts: [
          {
            type: 'image',
            image: 'https://example.com/final.png',
          },
          {
            type: 'text',
            text: '插件润色后的最终回复',
          },
        ],
        status: 'streaming',
        error: null,
      },
    ])
  })

  it('updates assistant metadata when a message-metadata event arrives', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正式回复',
        status: 'streaming',
        error: null,
      },
    ]
    const event = {
      type: 'message-metadata',
      messageId: 'assistant-1',
      metadata: {
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            title: 'reasoning_content',
            text: '先检查上下文',
            state: 'streaming',
            source: {
              providerId: 'deepseek',
              origin: 'ai-sdk.raw',
              key: 'reasoning_content',
            },
          },
        ],
      },
    } as unknown as SSEEvent

    expect(applySseEvent(messages, event, { requestKind: 'send' })).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正式回复',
        status: 'streaming',
        error: null,
        metadata: {
          customBlocks: [
            {
              id: 'custom-field:reasoning_content',
              kind: 'text',
              title: 'reasoning_content',
              text: '先检查上下文',
              state: 'streaming',
              source: {
                providerId: 'deepseek',
                origin: 'ai-sdk.raw',
                key: 'reasoning_content',
              },
            },
          ],
        },
      },
    ])
  })

  it('ignores todo-updated events inside the message reducer', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正式回复',
        status: 'completed',
        error: null,
      },
    ]
    const event: SSEEvent = {
      type: 'todo-updated',
      conversationId: 'conversation-1',
      todos: [
        {
          content: '同步 todo 面板',
          priority: 'high',
          status: 'in_progress',
        },
      ],
    }

    expect(applySseEvent(messages, event, { requestKind: 'send' })).toEqual(messages)
  })

  it('stores retry state for assistant messages and clears it when the stream resumes', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        status: 'pending',
        error: null,
      },
    ]
    const retryEvent = {
      type: 'retry',
      messageId: 'assistant-1',
      attempt: 1,
      message: 'Provider is overloaded',
      next: 1_777_000_000_000,
    } as unknown as SSEEvent

    const retried = applySseEvent(messages, retryEvent, { requestKind: 'send' })

    expect(retried).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        status: 'pending',
        error: null,
        retryState: {
          attempt: 1,
          message: 'Provider is overloaded',
          next: 1_777_000_000_000,
        },
      },
    ])

    expect(
      applySseEvent(
        retried,
        {
          type: 'text-delta',
          messageId: 'assistant-1',
          text: '恢复输出',
        },
        { requestKind: 'send' },
      ),
    ).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '恢复输出',
        status: 'streaming',
        error: null,
      },
    ])
  })
})

describe('getRetryableMessageId', () => {
  it('skips trailing display messages and returns the latest assistant reply', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正式回复',
        status: 'completed',
        error: null,
      },
      {
        id: 'display-1',
        role: 'display',
        content: '压缩摘要',
        status: 'completed',
        error: null,
      },
    ]

    expect(getRetryableMessageId(messages)).toBe('assistant-1')
  })

  it('does not expose a temporary assistant placeholder as a retry target', () => {
    const messages: ChatMessage[] = [
      {
        id: 'temp-assistant-1',
        role: 'assistant',
        content: '',
        status: 'error',
        error: 'network down',
      },
    ]

    expect(getRetryableMessageId(messages)).toBeNull()
  })
})

describe('retry continuation message-start', () => {
  it('appends the continuation assistant instead of replacing the first retried assistant', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '第一段回复',
        status: 'completed',
        error: null,
      },
    ]

    const continuationEvent = {
      type: 'message-start',
      userMessage: {
        id: 'user-continue-1',
        role: 'user',
        content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
          },
        ]),
        toolCalls: null,
        toolResults: null,
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                role: 'continue',
                synthetic: true,
                trigger: 'after-response',
              },
              owner: 'conversation.context-governance',
              type: 'context-compaction',
              version: '1',
            },
          ],
        }),
        provider: null,
        model: null,
        status: 'completed',
        error: null,
        createdAt: '2026-05-03T14:00:00.000Z',
        updatedAt: '2026-05-03T14:00:00.000Z',
      },
      assistantMessage: {
        id: 'assistant-2',
        role: 'assistant',
        content: '',
        partsJson: null,
        toolCalls: null,
        toolResults: null,
        metadataJson: null,
        provider: 'demo-provider',
        model: 'demo-model',
        status: 'pending',
        error: null,
        createdAt: '2026-05-03T14:00:01.000Z',
        updatedAt: '2026-05-03T14:00:01.000Z',
      },
    } as unknown as SSEEvent

    expect(
      applySseEvent(messages, continuationEvent, {
        requestKind: 'retry',
        targetMessageId: 'assistant-1',
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        content: '第一段回复',
      }),
      expect.objectContaining({
        id: 'user-continue-1',
        role: 'user',
      }),
      expect.objectContaining({
        id: 'assistant-2',
        role: 'assistant',
      }),
    ])
  })
})
