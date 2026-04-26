import { computed, getCurrentScope, markRaw, onScopeDispose, ref, shallowRef } from "vue";
import type {
  ChatMessagePart,
  Conversation,
  ConversationContextWindowPreview,
  ConversationTodoItem,
  RuntimePermissionRequest,
  RuntimePermissionDecision,
} from "@garlic-claw/shared";
import {
  abortChatStream,
  discardPendingMessageUpdates,
  dispatchRetryMessage,
  dispatchSendMessage,
  scheduleChatRecoveryWithState,
  stopChatRecovery,
  syncChatStreamingState,
  type ChatStreamState,
} from "@/features/chat/modules/chat-stream.module";
import {
  createConversationRecord,
  deleteConversationMessageRecord,
  deleteConversationRecord,
  loadPendingRuntimePermissionsRecord,
  loadConversationContextWindowRecord,
  loadConversationList,
  loadConversationMessages,
  loadConversationTodoRecord,
  replyRuntimePermissionRecord,
  stopConversationMessageRecord,
  updateConversationMessageRecord,
} from "@/features/chat/modules/chat-conversation.data";
import { ensureChatModelSelection } from "@/features/chat/modules/chat-model-selection";
import {
  getRetryableMessageId,
  removeMessage,
  replaceMessage,
  replaceOrAppendMessage,
} from "@/features/chat/store/chat-store.runtime";
import {
  PLUGIN_CONFIG_CHANGED_EVENT,
  type PluginConfigChangedDetail,
} from "@/features/plugins/plugin-config-change";
import type {
  ChatMessage,
  ChatPendingRuntimePermission,
  ChatSendInput,
} from "@/features/chat/store/chat-store.types";

interface QueuedChatSendRequest {
  conversationId: string;
  input: ChatSendInput;
}

export function createChatStoreModule() {
  const conversations = ref<Conversation[]>([]);
  const currentConversationId = ref<string | null>(null);
  const contextWindowPreview = ref<ConversationContextWindowPreview | null>(null);
  const messages = shallowRef<ChatMessage[]>([]);
  const pendingRuntimePermissions = shallowRef<ChatPendingRuntimePermission[]>([]);
  const todoItems = ref<ConversationTodoItem[]>([]);
  const loading = ref(false);
  const streaming = ref(false);
  const currentStreamingMessageId = ref<string | null>(null);
  const streamController = ref<AbortController | null>(null);
  const recoveryTimer = ref<number | null>(null);
  const selectedProvider = ref<string | null>(null);
  const selectedModel = ref<string | null>(null);
  const queuedSendRequests = shallowRef<QueuedChatSendRequest[]>([]);
  const streamState = {
    currentConversationId,
    contextWindowPreview,
    messages,
    pendingRuntimePermissions,
    selectedProvider,
    selectedModel,
    streamController,
    recoveryTimer,
    currentStreamingMessageId,
    todoItems,
    streaming,
  } as ChatStreamState;
  let conversationListRequestId = 0;
  let conversationDetailRequestId = 0;
  let conversationContextWindowRequestId = 0;
  let conversationRuntimePermissionRequestId = 0;
  let conversationTodoRequestId = 0;

  const DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE = 200;
  const CONTEXT_COMPACTION_PLUGIN_NAME = "builtin.context-compaction";

  const retryableMessageId = computed(() =>
    getRetryableMessageId(messages.value),
  );
  const queuedSendCount = computed(() => queuedSendRequests.value.length);
  let drainingQueuedSendRequests = false;

  function createPendingRuntimePermissionEntry(
    entry: RuntimePermissionRequest,
    resolving = false,
  ): ChatPendingRuntimePermission {
    return {
      id: entry.id,
      conversationId: entry.conversationId,
      ...(entry.messageId ? { messageId: entry.messageId } : {}),
      backendKind: entry.backendKind,
      toolName: entry.toolName,
      operations: entry.operations,
      createdAt: entry.createdAt,
      summary: entry.summary,
      ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      resolving,
    };
  }

  function replaceMessages(nextMessages: ChatMessage[]) {
    messages.value = markRaw(sliceConversationMessages(nextMessages));
  }

  function sliceConversationMessages(nextMessages: ChatMessage[]) {
    const windowSize = Math.max(
      1,
      contextWindowPreview.value?.frontendMessageWindowSize ??
        DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE,
    );
    return nextMessages.length > windowSize
      ? nextMessages.slice(-windowSize)
      : nextMessages;
  }

  function handlePluginConfigChanged(rawEvent: Event) {
    if (!(rawEvent instanceof CustomEvent)) {
      return;
    }
    const event = rawEvent as CustomEvent<PluginConfigChangedDetail>;
    if (event.detail.pluginName !== CONTEXT_COMPACTION_PLUGIN_NAME) {
      return;
    }
    if (!currentConversationId.value || streaming.value) {
      return;
    }
    void tryLoadConversationContextWindow(currentConversationId.value);
  }

  if (typeof window !== "undefined") {
    window.addEventListener(PLUGIN_CONFIG_CHANGED_EVENT, handlePluginConfigChanged);
    if (getCurrentScope()) {
      onScopeDispose(() => {
        window.removeEventListener(
          PLUGIN_CONFIG_CHANGED_EVENT,
          handlePluginConfigChanged,
        );
      });
    }
  }

  function invalidateConversationRequests() {
    conversationListRequestId += 1;
    conversationDetailRequestId += 1;
    conversationContextWindowRequestId += 1;
    conversationRuntimePermissionRequestId += 1;
    conversationTodoRequestId += 1;
  }

  async function refreshConversationSummary(
    conversationId: string | null = currentConversationId.value,
  ) {
    if (!conversationId) {
      return;
    }

    await loadConversations();
  }

  async function refreshConversationMessageDerivedState(
    conversationId: string | null = currentConversationId.value,
  ) {
    if (!conversationId) {
      return;
    }

    await loadConversations();
    if (currentConversationId.value !== conversationId) {
      return;
    }

    await tryLoadConversationContextWindow(conversationId);
  }

  async function refreshConversationStreamState(
    conversationId: string | null = currentConversationId.value,
    input: {
      summaryRefreshed: boolean;
      permissionStateChanged: boolean;
    },
  ) {
    if (!conversationId) {
      return;
    }

    if (!input.summaryRefreshed) {
      await loadConversations();
      if (currentConversationId.value !== conversationId) {
        return;
      }
    }

    await tryLoadConversationContextWindow(conversationId);
    if (currentConversationId.value !== conversationId) {
      return;
    }

    await Promise.all(
      input.permissionStateChanged
        ? [loadConversationRuntimePermissions(conversationId)]
        : [],
    );
  }

  async function refreshConversationTailState(
    conversationId: string | null = currentConversationId.value,
  ) {
    if (!conversationId) {
      return;
    }

    await tryLoadConversationContextWindow(conversationId);
    if (currentConversationId.value !== conversationId) {
      return;
    }

    await loadConversationRuntimePermissions(conversationId);
  }

  async function loadConversationWindowSnapshot(conversationId: string) {
    await tryLoadConversationContextWindow(conversationId);
    if (currentConversationId.value !== conversationId) {
      return;
    }
    await loadConversationDetail(conversationId);
  }

  async function loadConversations() {
    const requestId = ++conversationListRequestId;
    const nextConversations = await loadConversationList();
    if (requestId !== conversationListRequestId) {
      return;
    }
    conversations.value = nextConversations;

    if (
      currentConversationId.value &&
      !nextConversations.some(
        (conversation) => conversation.id === currentConversationId.value,
      )
    ) {
      abortChatStream(streamState);
      discardPendingMessageUpdates(streamState);
      stopChatRecovery(streamState);
      currentConversationId.value = null;
      contextWindowPreview.value = null;
      selectedProvider.value = null;
      selectedModel.value = null;
      pendingRuntimePermissions.value = [];
      todoItems.value = [];
      replaceMessages([]);
      syncChatStreamingState(streamState);
    }
    queuedSendRequests.value = queuedSendRequests.value.filter((entry) =>
      nextConversations.some((conversation) => conversation.id === entry.conversationId),
    );
  }

  async function createConversation(title?: string) {
    const conversation = await createConversationRecord(title);
    conversations.value.unshift(conversation);
    return conversation;
  }

  async function selectConversation(id: string) {
    abortChatStream(streamState);
    discardPendingMessageUpdates(streamState);
    stopChatRecovery(streamState);
    invalidateConversationRequests();
    currentConversationId.value = id;
    contextWindowPreview.value = null;
    selectedProvider.value = null;
    selectedModel.value = null;
    pendingRuntimePermissions.value = [];
    todoItems.value = [];
    loading.value = true;
    try {
      await Promise.all([
        loadConversationDetail(id),
        loadConversationRuntimePermissions(id),
        loadConversationTodo(id),
      ]);
      await ensureModelSelection(messages.value);
      await tryLoadConversationContextWindow(id);
      scheduleChatRecoveryWithState(streamState, loadConversationWindowSnapshot);
      await drainQueuedSendRequests();
    } finally {
      loading.value = false;
    }
  }

  async function deleteConversation(id: string) {
    if (currentConversationId.value === id) {
      abortChatStream(streamState);
      discardPendingMessageUpdates(streamState);
      stopChatRecovery(streamState);
    }

    invalidateConversationRequests();
    await deleteConversationRecord(id);
    conversations.value = conversations.value.filter(
      (conversation) => conversation.id !== id,
    );
    if (currentConversationId.value === id) {
      currentConversationId.value = null;
      contextWindowPreview.value = null;
      selectedProvider.value = null;
      selectedModel.value = null;
      pendingRuntimePermissions.value = [];
      todoItems.value = [];
      replaceMessages([]);
      syncChatStreamingState(streamState);
    }
    queuedSendRequests.value = queuedSendRequests.value.filter(
      (entry) => entry.conversationId !== id,
    );
  }

  function setModelSelection(selection: {
    provider: string | null;
    model: string | null;
  }) {
    selectedProvider.value = selection.provider;
    selectedModel.value = selection.model;
    if (currentConversationId.value && !streaming.value) {
      void tryLoadConversationContextWindow(currentConversationId.value);
    }
  }

  async function ensureModelSelection(existingMessages: ChatMessage[] = []) {
    await ensureChatModelSelection({
      selectedProvider,
      selectedModel,
      messages: existingMessages,
    });
  }

  async function sendMessage(input: ChatSendInput) {
    await ensureModelSelection(messages.value);
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    queuedSendRequests.value = [
      ...queuedSendRequests.value,
      {
        conversationId,
        input: {
          ...input,
          model: input.model ?? selectedModel.value,
          provider: input.provider ?? selectedProvider.value,
        },
      },
    ];
    await drainQueuedSendRequests();
  }

  async function retryMessage(messageId: string) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    await dispatchRetryMessage(streamState, messageId, {
      loadConversationDetail: loadConversationWindowSnapshot,
      refreshConversationSummary: () =>
        refreshConversationSummary(conversationId),
      refreshConversationState: (input) =>
        refreshConversationStreamState(conversationId, input),
    });
  }

  async function updateMessage(
    messageId: string,
    payload: { content?: string; parts?: ChatMessagePart[] },
  ) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    const message = messages.value.find((entry) => entry.id === messageId);
    if (message && shouldResendEditedTerminalUserMessage(messages.value, message)) {
      const resendInput = buildEditedUserResendInput(message, payload);
      if (resendInput.content || resendInput.parts?.length) {
        await deleteConversationMessageRecord(
          conversationId,
          messageId,
        );
        if (currentConversationId.value === conversationId) {
          replaceMessages(removeMessage(messages.value, messageId));
          syncChatStreamingState(streamState);
        }
        await sendMessage(resendInput);
        return;
      }
    }

    const updated = await updateConversationMessageRecord(
      conversationId,
      messageId,
      payload,
    );
    if (currentConversationId.value === conversationId) {
      replaceMessages(replaceOrAppendMessage(messages.value, updated, messageId));
      syncChatStreamingState(streamState);
    }
    await refreshConversationMessageDerivedState(conversationId);
  }

  async function deleteMessage(messageId: string) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    await deleteConversationMessageRecord(
      conversationId,
      messageId,
    );
    if (currentConversationId.value === conversationId) {
      replaceMessages(removeMessage(messages.value, messageId));
      syncChatStreamingState(streamState);
    }
    await refreshConversationMessageDerivedState(conversationId);
  }

  async function stopStreaming() {
    const conversationId = currentConversationId.value;
    const messageId = currentStreamingMessageId.value;
    if (!conversationId || !messageId) {
      return;
    }

    abortChatStream(streamState);
    discardPendingMessageUpdates(streamState);
    stopChatRecovery(streamState);
    await stopConversationMessageRecord(
      conversationId,
      messageId,
    );
    if (currentConversationId.value === conversationId) {
      applyStoppedStreamingMessage(messageId);
      await refreshConversationTailState(conversationId);
      syncChatStreamingState(streamState);
      await drainQueuedSendRequests();
    }
  }

  async function loadConversationDetail(conversationId: string) {
    const requestId = ++conversationDetailRequestId;
    const nextMessages = await loadConversationMessages(conversationId);
    if (
      requestId !== conversationDetailRequestId ||
      currentConversationId.value !== conversationId
    ) {
      return;
    }

    replaceMessages(nextMessages);
    syncChatStreamingState(streamState);
  }

  async function loadConversationContextWindow(conversationId: string) {
    const requestId = ++conversationContextWindowRequestId;
    const nextPreview = await loadConversationContextWindowRecord(conversationId, {
      modelId: selectedModel.value,
      providerId: selectedProvider.value,
    });
    if (
      requestId !== conversationContextWindowRequestId ||
      currentConversationId.value !== conversationId
    ) {
      return;
    }

    contextWindowPreview.value = nextPreview;
    replaceMessages(messages.value);
  }

  async function tryLoadConversationContextWindow(conversationId: string) {
    try {
      await loadConversationContextWindow(conversationId);
    } catch {
      // 动态窗口预览仅影响前端派生视图，失败时不能阻断真实会话链路。
    }
  }

  async function loadConversationTodo(conversationId: string) {
    const requestId = ++conversationTodoRequestId;
    const nextTodoItems = await loadConversationTodoRecord(conversationId);
    if (
      requestId !== conversationTodoRequestId ||
      currentConversationId.value !== conversationId
    ) {
      return;
    }

    todoItems.value = nextTodoItems;
  }

  async function loadConversationRuntimePermissions(conversationId: string) {
    const requestId = ++conversationRuntimePermissionRequestId;
    const nextPermissions = await loadPendingRuntimePermissionsRecord(conversationId);
    if (
      requestId !== conversationRuntimePermissionRequestId ||
      currentConversationId.value !== conversationId
    ) {
      return;
    }
    pendingRuntimePermissions.value = nextPermissions.map((entry) =>
      createPendingRuntimePermissionEntry(entry),
    );
  }

  async function replyRuntimePermission(requestId: string, decision: RuntimePermissionDecision) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }
    pendingRuntimePermissions.value = pendingRuntimePermissions.value.map((entry) =>
      entry.id === requestId
        ? createPendingRuntimePermissionEntry(entry, true)
        : entry,
    );
    try {
      await replyRuntimePermissionRecord(conversationId, requestId, decision);
      pendingRuntimePermissions.value = pendingRuntimePermissions.value.filter(
        (entry) => entry.id !== requestId,
      );
    } catch (error) {
      pendingRuntimePermissions.value = pendingRuntimePermissions.value.map((entry) =>
        entry.id === requestId
          ? createPendingRuntimePermissionEntry(entry)
          : entry,
      );
      throw error;
    }
  }

  async function drainQueuedSendRequests() {
    if (drainingQueuedSendRequests) {
      return;
    }
    drainingQueuedSendRequests = true;
    try {
      while (!streaming.value) {
        const nextRequest = queuedSendRequests.value[0];
        if (!nextRequest) {
          return;
        }
        if (nextRequest.conversationId !== currentConversationId.value) {
          return;
        }
        queuedSendRequests.value = queuedSendRequests.value.slice(1);
        await dispatchSendMessage(streamState, nextRequest.input, {
          loadConversationDetail: loadConversationWindowSnapshot,
          refreshConversationSummary: () =>
            refreshConversationSummary(nextRequest.conversationId),
          refreshConversationState: (input) =>
            refreshConversationStreamState(nextRequest.conversationId, input),
        });
      }
    } finally {
      drainingQueuedSendRequests = false;
    }
  }

  return {
    conversations,
    currentConversationId,
    contextWindowPreview,
    messages,
    pendingRuntimePermissions,
    todoItems,
    loading,
    streaming,
    currentStreamingMessageId,
    queuedSendCount,
    retryableMessageId,
    selectedProvider,
    selectedModel,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    setModelSelection,
    ensureModelSelection,
    sendMessage,
    retryMessage,
    updateMessage,
    deleteMessage,
    stopStreaming,
    replyRuntimePermission,
  };

  function applyStoppedStreamingMessage(messageId: string) {
    const message = messages.value.find((entry) => entry.id === messageId);
    if (!message) {
      return;
    }

    replaceMessages(replaceMessage(messages.value, messageId, {
      ...message,
      error: null,
      status: "stopped",
    }));
  }
}

function shouldResendEditedTerminalUserMessage(
  allMessages: ChatMessage[],
  message: ChatMessage | undefined,
): boolean {
  if (!message?.id || message.role !== "user") {
    return false;
  }

  for (let index = allMessages.length - 1; index >= 0; index -= 1) {
    const currentMessage = allMessages[index];
    if (currentMessage.role === "display") {
      continue;
    }
    return currentMessage.id === message.id;
  }

  return false;
}

function buildEditedUserResendInput(
  message: ChatMessage,
  payload: { content?: string; parts?: ChatMessagePart[] },
): ChatSendInput {
  return {
    content: payload.content ?? message.content,
    ...(payload.parts ?? message.parts
      ? { parts: payload.parts ?? message.parts }
      : {}),
  };
}
