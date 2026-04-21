import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatStoreModule } from '@/features/chat/modules/chat-store.module'
import type { Conversation } from '@garlic-claw/shared'
import type { ChatMessage } from '@/features/chat/store/chat-store.types'

vi.mock('@/features/chat/modules/chat-conversation.data', () => ({
  compactConversationContextRecord: vi.fn(),
  createConversationRecord: vi.fn(),
  deleteConversationMessageRecord: vi.fn(),
  deleteConversationRecord: vi.fn(),
  loadPendingRuntimePermissionsRecord: vi.fn(),
  loadConversationList: vi.fn(),
  loadConversationMessages: vi.fn(),
  loadConversationTodoRecord: vi.fn(),
  replyRuntimePermissionRecord: vi.fn(),
  stopConversationMessageRecord: vi.fn(),
  updateConversationMessageRecord: vi.fn(),
}))

vi.mock('@/features/chat/modules/chat-stream.module', () => ({
  abortChatStream: vi.fn(),
  discardPendingMessageUpdates: vi.fn(),
  dispatchRetryMessage: vi.fn(),
  dispatchSendMessage: vi.fn(),
  scheduleChatRecovery: vi.fn(),
  scheduleChatRecoveryWithState: vi.fn(),
  stopChatRecovery: vi.fn(),
  syncChatStreamingState: vi.fn(),
}))

vi.mock('@/features/chat/modules/chat-model-selection', () => ({
  ensureChatModelSelection: vi.fn(),
}))

import * as chatConversationData from '@/features/chat/modules/chat-conversation.data'
import * as chatStreamModule from '@/features/chat/modules/chat-stream.module'
import * as chatModelSelection from '@/features/chat/modules/chat-model-selection'

describe('createChatStoreModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockResolvedValue([])
    vi.mocked(chatConversationData.replyRuntimePermissionRecord).mockResolvedValue({
      requestId: 'permission-1',
      resolution: 'approved',
    })
  })

  it('clears the current chat state when the selected conversation is no longer returned by the server', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-2',
        title: '新的会话',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:00:00.000Z',
        _count: { messages: 0 },
      },
    ] satisfies Conversation[])

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.selectedProvider.value = 'smoke-ui-provider'
    store.selectedModel.value = 'smoke-ui-model'
    store.messages.value = [
      {
        role: 'user',
        content: 'smoke-ui chat message',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.loadConversations()

    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-2',
      }),
    ])
    expect(store.currentConversationId.value).toBeNull()
    expect(store.selectedProvider.value).toBeNull()
    expect(store.selectedModel.value).toBeNull()
    expect(store.todoItems.value).toEqual([])
    expect(store.messages.value).toEqual([])
    expect(chatStreamModule.abortChatStream).toHaveBeenCalledTimes(1)
    expect(chatStreamModule.stopChatRecovery).toHaveBeenCalledTimes(1)
    expect(chatStreamModule.syncChatStreamingState).toHaveBeenCalledTimes(1)
  })

  it('refreshes conversation-related state after a streamed send finishes', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '更新后的标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:05:00.000Z',
        _count: { messages: 2 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '已同步最新消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([
      {
        content: '更新会话摘要',
        priority: 'high',
        status: 'in_progress',
      },
    ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()
    vi.mocked(chatStreamModule.dispatchSendMessage).mockImplementation(
      async (_state, _input, params) => {
        await params?.refreshConversationSummary?.()
        await params?.refreshConversationState?.()
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    await store.sendMessage({
      content: '你好',
    })

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(2)
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledWith('conversation-1')
    expect(chatConversationData.loadConversationTodoRecord).toHaveBeenCalledWith('conversation-1')
    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        title: '更新后的标题',
      }),
    ])
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        content: '已同步最新消息',
      }),
    ])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '更新会话摘要',
      }),
    ])
  })

  it('refreshes conversation-related state after a streamed retry finishes', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '重试后标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:06:00.000Z',
        _count: { messages: 2 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '重试后的最终回复',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([])
    vi.mocked(chatStreamModule.dispatchRetryMessage).mockImplementation(
      async (_state, _messageId, params) => {
        await params?.refreshConversationSummary?.()
        await params?.refreshConversationState?.()
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    await store.retryMessage('assistant-1')

    expect(chatStreamModule.dispatchRetryMessage).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(2)
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledWith('conversation-1')
    expect(chatConversationData.loadConversationTodoRecord).toHaveBeenCalledWith('conversation-1')
    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        title: '重试后标题',
      }),
    ])
  })

  it('refreshes conversation-related state after updating, deleting, and stopping messages', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '服务端最终消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([
      {
        content: '停止当前生成',
        priority: 'medium',
        status: 'pending',
      },
    ])
    vi.mocked(chatConversationData.updateConversationMessageRecord).mockResolvedValue({
      id: 'assistant-1',
      role: 'assistant',
      content: '本地更新消息',
      status: 'completed',
      parts: [],
      toolCalls: [],
      toolResults: [],
      error: null,
      provider: null,
      model: null,
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockResolvedValue({
      message: 'Generation stopped',
    })

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '旧消息',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.updateMessage('assistant-1', { content: '修改后' })
    await store.deleteMessage('assistant-1')
    await store.stopStreaming()

    expect(chatConversationData.updateConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      { content: '修改后' },
    )
    expect(chatConversationData.deleteConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
    )
    expect(chatConversationData.stopConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
    )
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(3)
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledTimes(3)
    expect(chatConversationData.loadConversationTodoRecord).toHaveBeenCalledTimes(3)
    expect(chatStreamModule.abortChatStream).toHaveBeenCalledTimes(1)
    expect(chatStreamModule.discardPendingMessageUpdates).toHaveBeenCalledTimes(1)
    expect(chatStreamModule.stopChatRecovery).toHaveBeenCalledTimes(1)
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        content: '服务端最终消息',
      }),
    ])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '停止当前生成',
      }),
    ])
  })

  it('does not write an old conversation update into the newly selected conversation', async () => {
    let resolveUpdate: ((value: ChatMessage) => void) | null = null
    let resolveDelete: (() => void) | null = null
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
      {
        id: 'conversation-2',
        title: '会话二',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:11:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.updateConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveUpdate = resolve
      }),
    )
    vi.mocked(chatConversationData.deleteConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveDelete = () => resolve(undefined)
      }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'assistant-a',
        role: 'assistant',
        content: '会话一旧消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const updateTask = store.updateMessage('assistant-a', { content: '修改后' })
    store.currentConversationId.value = 'conversation-2'
    store.messages.value = [
      {
        id: 'assistant-b',
        role: 'assistant',
        content: '会话二当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    resolveUpdate?.({
      id: 'assistant-a',
      role: 'assistant',
      content: '会话一修改后',
      status: 'completed',
      parts: [],
      toolCalls: [],
      toolResults: [],
      error: null,
      provider: null,
      model: null,
    })
    await updateTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-b',
        content: '会话二当前消息',
      }),
    ])

    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'assistant-a',
        role: 'assistant',
        content: '会话一消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    const deleteTask = store.deleteMessage('assistant-a')
    store.currentConversationId.value = 'conversation-2'
    store.messages.value = [
      {
        id: 'assistant-b',
        role: 'assistant',
        content: '会话二当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    resolveDelete?.()
    await deleteTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-b',
        content: '会话二当前消息',
      }),
    ])
  })

  it('does not write a stopped old conversation back into the newly selected conversation', async () => {
    let resolveStop: (() => void) | null = null
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
      {
        id: 'conversation-2',
        title: '会话二',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:11:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveStop = () => resolve({ message: 'Generation stopped' })
      }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-a'
    store.messages.value = [
      {
        id: 'assistant-a',
        role: 'assistant',
        content: '会话一流式消息',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const stopTask = store.stopStreaming()
    store.currentConversationId.value = 'conversation-2'
    store.messages.value = [
      {
        id: 'assistant-b',
        role: 'assistant',
        content: '会话二当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    resolveStop?.()
    await stopTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-b',
        content: '会话二当前消息',
      }),
    ])
  })

  it('keeps the latest conversation list when concurrent refreshes return out of order', async () => {
    let resolveFirst: ((value: Conversation[]) => void) | null = null
    let resolveSecond: ((value: Conversation[]) => void) | null = null
    vi.mocked(chatConversationData.loadConversationList)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve
      }))

    const store = createChatStoreModule()

    const firstLoad = store.loadConversations()
    const secondLoad = store.loadConversations()

    resolveSecond?.([
      {
        id: 'conversation-2',
        title: '新的标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
    ])
    await secondLoad

    resolveFirst?.([
      {
        id: 'conversation-1',
        title: '旧的标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:01:00.000Z',
        _count: { messages: 1 },
      },
    ])
    await firstLoad

    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-2',
        title: '新的标题',
      }),
    ])
  })

  it('ignores an old conversation list refresh after the user switches to another conversation', async () => {
    let resolveList: ((value: Conversation[]) => void) | null = null
    vi.mocked(chatConversationData.loadConversationList).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-conversation-2',
        role: 'assistant',
        content: '会话二详情',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    const refreshTask = store.loadConversations()
    const selectTask = store.selectConversation('conversation-2')

    resolveList?.([
      {
        id: 'conversation-1',
        title: '旧列表结果',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:01:00.000Z',
        _count: { messages: 1 },
      },
    ])

    await Promise.all([refreshTask, selectTask])

    expect(store.currentConversationId.value).toBe('conversation-2')
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-conversation-2',
        content: '会话二详情',
      }),
    ])
    expect(store.conversations.value).toEqual([])
  })

  it('keeps the latest conversation detail when concurrent refreshes return out of order', async () => {
    let resolveFirstDetail: ((value: ChatMessage[]) => void) | null = null
    let resolveSecondDetail: ((value: ChatMessage[]) => void) | null = null

    vi.mocked(chatConversationData.loadConversationMessages)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstDetail = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondDetail = resolve
      }))
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    const firstSelect = store.selectConversation('conversation-1')
    const secondSelect = store.selectConversation('conversation-1')

    resolveSecondDetail?.([
      {
        id: 'assistant-new',
        role: 'assistant',
        content: '新的详情',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    await secondSelect

    resolveFirstDetail?.([
      {
        id: 'assistant-old',
        role: 'assistant',
        content: '旧的详情',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    await firstSelect

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-new',
        content: '新的详情',
        status: 'completed',
      }),
    ])
  })

  it('routes recovery polling through the same guarded conversation detail loader', async () => {
    let resolveFirstDetail: ((value: ChatMessage[]) => void) | null = null
    let resolveSecondDetail: ((value: ChatMessage[]) => void) | null = null

    vi.mocked(chatConversationData.loadConversationMessages)
      .mockResolvedValueOnce([
        {
          id: 'assistant-initial',
          role: 'assistant',
          content: '初始详情',
          status: 'completed',
          parts: [],
          toolCalls: [],
          toolResults: [],
          error: null,
          provider: null,
          model: null,
        },
      ])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstDetail = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondDetail = resolve
      }))
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    await store.selectConversation('conversation-1')

    const recoveryLoadConversationDetail =
      vi.mocked(chatStreamModule.scheduleChatRecoveryWithState).mock.calls[0]?.[1]
    expect(recoveryLoadConversationDetail).toBeTypeOf('function')

    const firstRefresh = recoveryLoadConversationDetail?.('conversation-1')
    const secondRefresh = recoveryLoadConversationDetail?.('conversation-1')

    resolveSecondDetail?.([
      {
        id: 'assistant-new',
        role: 'assistant',
        content: '恢复后的新详情',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    await secondRefresh

    resolveFirstDetail?.([
      {
        id: 'assistant-old',
        role: 'assistant',
        content: '恢复后的旧详情',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    await firstRefresh

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-new',
        content: '恢复后的新详情',
        status: 'completed',
      }),
    ])
  })

  it('clears model selection when deleting the current conversation', async () => {
    vi.mocked(chatConversationData.deleteConversationRecord).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.selectedProvider.value = 'provider-a'
    store.selectedModel.value = 'model-a'
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.deleteConversation('conversation-1')

    expect(store.currentConversationId.value).toBeNull()
    expect(store.selectedProvider.value).toBeNull()
    expect(store.selectedModel.value).toBeNull()
    expect(store.todoItems.value).toEqual([])
    expect(store.messages.value).toEqual([])
  })

  it('runs manual context compaction and refreshes the current conversation state', async () => {
    vi.mocked(chatConversationData.compactConversationContextRecord).mockResolvedValue({
      compacted: true,
      coveredMessageCount: 2,
    })
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '压缩后的会话',
        createdAt: '2026-04-19T10:00:00.000Z',
        updatedAt: '2026-04-19T10:05:00.000Z',
        _count: { messages: 2 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'summary-1',
        role: 'assistant',
        content: '压缩后的历史摘要',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: 'openai',
        model: 'gpt-5.4',
      },
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([
      {
        content: '检查压缩结果',
        priority: 'medium',
        status: 'pending',
      },
    ])

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.selectedProvider.value = 'openai'
    store.selectedModel.value = 'gpt-5.4'

    await expect(store.compactContext()).resolves.toEqual({
      compacted: true,
      coveredMessageCount: 2,
    })

    expect(chatConversationData.compactConversationContextRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: 'gpt-5.4',
        providerId: 'openai',
      },
    )
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledWith('conversation-1')
    expect(chatConversationData.loadConversationTodoRecord).toHaveBeenCalledWith('conversation-1')
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'summary-1',
        content: '压缩后的历史摘要',
      }),
    ])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '检查压缩结果',
      }),
    ])
  })

  it('loads pending runtime permissions for the selected conversation', async () => {
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([])
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockResolvedValue([
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute', 'network.access'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '执行 curl 请求',
        metadata: {
          command: 'curl https://example.com',
        },
      },
    ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()

    await store.selectConversation('conversation-1')

    expect(chatConversationData.loadPendingRuntimePermissionsRecord).toHaveBeenCalledWith(
      'conversation-1',
    )
    expect(store.pendingRuntimePermissions.value).toEqual([
      expect.objectContaining({
        id: 'permission-1',
        resolving: false,
        toolName: 'bash',
      }),
    ])
  })

  it('replies to a runtime permission request and removes it from the pending list', async () => {
    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.pendingRuntimePermissions.value = [
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '执行 pwd',
        resolving: false,
      },
    ]

    await store.replyRuntimePermission('permission-1', 'always')

    expect(chatConversationData.replyRuntimePermissionRecord).toHaveBeenCalledWith(
      'conversation-1',
      'permission-1',
      'always',
    )
    expect(store.pendingRuntimePermissions.value).toEqual([])
  })
})
