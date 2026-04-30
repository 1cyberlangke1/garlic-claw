import { computed, getCurrentScope, markRaw, onScopeDispose, ref, shallowRef, triggerRef } from "vue";
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
  INTERNAL_CONFIG_CHANGED_EVENT,
  type InternalConfigChangedDetail,
} from "@/features/ai-settings/internal-config-change";
import type {
  ChatMessage,
  ChatPendingRuntimePermission,
  ChatSendInput,
} from "@/features/chat/store/chat-store.types";
import { isValidConversationRouteId } from "@/utils/uuid";

let removeGlobalInternalConfigChangedListener: (() => void) | null = null;

interface QueuedChatSendRequest {
  id: string;
  conversationId: string;
  input: ChatSendInput;
}

export interface QueuedChatSendPreviewEntry {
  id: string;
  preview: string;
}

export function createChatStoreModule() {
  const conversations = shallowRef<Conversation[]>([]);
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
  const queuedSendRequestsByConversation = shallowRef<Record<string, QueuedChatSendRequest[]>>({});
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
  let pendingContextWindowRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  const DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE = 200;
  const retryableMessageId = computed(() =>
    getRetryableMessageId(messages.value),
  );
  const currentQueuedSendRequests = computed(() =>
    currentConversationId.value
      ? queuedSendRequestsByConversation.value[currentConversationId.value] ?? []
      : [],
  );
  const queuedSendCount = computed(() => currentQueuedSendRequests.value.length);
  const queuedSendPreviewEntries = computed<QueuedChatSendPreviewEntry[]>(() =>
    currentQueuedSendRequests.value
      .slice(-3)
      .reverse()
      .map((entry) => ({
        id: entry.id,
        preview: createQueuedSendPreview(entry.input),
      })),
  );
  let drainingQueuedSendRequests = false;
  let queuedSendSequence = 0;

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

  function clearCurrentConversationState() {
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

  function resolveValidConversationId(conversationId: string | null) {
    if (!conversationId) {
      return null;
    }
    if (isValidConversationRouteId(conversationId)) {
      return conversationId;
    }
    clearCurrentConversationState();
    return null;
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

  function handleInternalConfigChanged(rawEvent: Event) {
    if (!(rawEvent instanceof CustomEvent)) {
      return;
    }
    const event = rawEvent as CustomEvent<InternalConfigChangedDetail>;
    if (
      event.detail.scope !== "context-governance" &&
      event.detail.scope !== "provider-models"
    ) {
      return;
    }
    if (!currentConversationId.value || streaming.value) {
      return;
    }
    scheduleContextWindowRefresh(currentConversationId.value);
  }

  if (typeof window !== "undefined") {
    removeGlobalInternalConfigChangedListener?.();
    window.addEventListener(INTERNAL_CONFIG_CHANGED_EVENT, handleInternalConfigChanged);
    removeGlobalInternalConfigChangedListener = () => {
      window.removeEventListener(
        INTERNAL_CONFIG_CHANGED_EVENT,
        handleInternalConfigChanged,
      );
      if (removeGlobalInternalConfigChangedListener) {
        removeGlobalInternalConfigChangedListener = null;
      }
    };
    if (getCurrentScope()) {
      onScopeDispose(() => {
        clearPendingContextWindowRefreshTimer();
        removeGlobalInternalConfigChangedListener?.();
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

  function scheduleContextWindowRefresh(conversationId: string) {
    clearPendingContextWindowRefreshTimer();
    pendingContextWindowRefreshTimer = setTimeout(() => {
      pendingContextWindowRefreshTimer = null;
      if (currentConversationId.value !== conversationId || streaming.value) {
        return;
      }
      void tryLoadConversationContextWindow(conversationId);
    }, 300);
  }

  function clearPendingContextWindowRefreshTimer() {
    if (!pendingContextWindowRefreshTimer) {
      return;
    }
    clearTimeout(pendingContextWindowRefreshTimer);
    pendingContextWindowRefreshTimer = null;
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
      resolveValidConversationId(currentConversationId.value) &&
      !nextConversations.some(
        (conversation) => conversation.id === currentConversationId.value,
      )
    ) {
      clearCurrentConversationState();
    }
    const validConversationIds = new Set(nextConversations.map((conversation) => conversation.id));
    queuedSendRequestsByConversation.value = Object.fromEntries(
      Object.entries(queuedSendRequestsByConversation.value).filter(([conversationId]) =>
        validConversationIds.has(conversationId),
      ),
    );
  }

  async function createConversation(title?: string) {
    conversationListRequestId += 1;
    const conversation = await createConversationRecord(title);
    conversations.value.unshift(conversation);
    triggerRef(conversations);
    return conversation;
  }

  async function selectConversation(id: string) {
    if (!isValidConversationRouteId(id)) {
      clearCurrentConversationState();
      return;
    }
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
    deleteQueuedSendRequests(id);
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

    appendQueuedSendRequest(conversationId, {
      conversationId,
      id: `queued-send-${++queuedSendSequence}`,
      input: {
        ...input,
        model: input.model ?? selectedModel.value,
        provider: input.provider ?? selectedProvider.value,
      },
    });
    await drainQueuedSendRequests();
  }

  function popQueuedSendRequestTail() {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return null;
    }
    const requests = readQueuedSendRequests(conversationId);
    const popped = requests.at(-1) ?? null;
    if (!popped) {
      return null;
    }
    writeQueuedSendRequests(conversationId, requests.slice(0, -1));
    return popped.input;
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
    const activeMessage = messages.value.find((entry) => entry.id === messageId);

    abortChatStream(streamState);
    discardPendingMessageUpdates(streamState);
    stopChatRecovery(streamState);
    if (activeMessage?.role === "assistant") {
      await stopConversationMessageRecord(
        conversationId,
        messageId,
      );
    }
    if (currentConversationId.value === conversationId) {
      applyStoppedStreamingMessage(messageId);
      await refreshConversationTailState(conversationId);
      syncChatStreamingState(streamState);
      await drainQueuedSendRequests();
    }
  }

  async function loadConversationDetail(conversationId: string) {
    if (!resolveValidConversationId(conversationId)) {
      return;
    }
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
    if (!resolveValidConversationId(conversationId)) {
      return;
    }
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
    if (!resolveValidConversationId(conversationId)) {
      return;
    }
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
    if (!resolveValidConversationId(conversationId)) {
      return;
    }
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
        const conversationId = currentConversationId.value;
        if (!conversationId) {
          return;
        }
        const nextQueuedRequests = readQueuedSendRequests(conversationId);
        const nextRequest = nextQueuedRequests[0];
        if (!nextRequest) {
          return;
        }
        writeQueuedSendRequests(conversationId, nextQueuedRequests.slice(1));
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
    queuedSendPreviewEntries,
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
    popQueuedSendRequestTail,
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

  function appendQueuedSendRequest(conversationId: string, request: QueuedChatSendRequest) {
    writeQueuedSendRequests(conversationId, [
      ...readQueuedSendRequests(conversationId),
      request,
    ]);
  }

  function deleteQueuedSendRequests(conversationId: string) {
    const nextQueuedByConversation = { ...queuedSendRequestsByConversation.value };
    delete nextQueuedByConversation[conversationId];
    queuedSendRequestsByConversation.value = nextQueuedByConversation;
  }

  function readQueuedSendRequests(conversationId: string): QueuedChatSendRequest[] {
    return queuedSendRequestsByConversation.value[conversationId] ?? [];
  }

  function writeQueuedSendRequests(conversationId: string, requests: QueuedChatSendRequest[]) {
    if (requests.length === 0) {
      deleteQueuedSendRequests(conversationId);
      return;
    }
    queuedSendRequestsByConversation.value = {
      ...queuedSendRequestsByConversation.value,
      [conversationId]: requests,
    };
  }
}

function createQueuedSendPreview(input: ChatSendInput): string {
  const text = (input.content ?? "").trim() || readQueuedSendTextFromParts(input.parts);
  const imageCount = countQueuedSendImages(input.parts);
  if (text && imageCount > 0) {
    return `${truncateQueuedSendText(text, 24)} + ${imageCount}图`;
  }
  if (text) {
    return truncateQueuedSendText(text, 28);
  }
  if (imageCount > 0) {
    return `${imageCount} 张图片`;
  }
  return "空消息";
}

function readQueuedSendTextFromParts(parts: ChatMessagePart[] | undefined): string {
  if (!parts?.length) {
    return "";
  }
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

function countQueuedSendImages(parts: ChatMessagePart[] | undefined): number {
  return parts?.filter((part) => part.type === "image").length ?? 0;
}

function truncateQueuedSendText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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
