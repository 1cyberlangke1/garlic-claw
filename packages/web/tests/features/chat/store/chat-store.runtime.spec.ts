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
})
