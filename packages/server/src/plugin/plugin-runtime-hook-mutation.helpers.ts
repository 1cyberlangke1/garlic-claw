import type {
  AutomationAfterRunHookMutateResult,
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookMutateResult,
  AutomationBeforeRunHookPayload,
  ChatAfterModelHookMutateResult,
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelRequest,
  ChatBeforeModelHookShortCircuitResult,
  ChatMessagePart,
  MessageCreatedHookMutateResult,
  MessageCreatedHookPayload,
  MessageReceivedHookPassResult,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPayload,
  MessageReceivedHookShortCircuitResult,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookPayload,
  PluginMessageHookInfo,
  ResponseBeforeSendHookMutateResult,
  ResponseBeforeSendHookPayload,
  SubagentAfterRunHookMutateResult,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookMutateResult,
  SubagentBeforeRunHookPayload,
  ToolAfterCallHookMutateResult,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookMutateResult,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import { toJsonValue } from '../common/utils/json-value';
import {
  cloneAutomationActions,
  cloneAutomationAfterRunPayload,
  cloneAutomationBeforeRunPayload,
  cloneChatAfterModelPayload,
  cloneChatBeforeModelRequest,
  cloneChatMessageParts,
  cloneChatMessages,
  cloneJsonValueArray,
  cloneMessageCreatedHookPayload,
  cloneMessageReceivedHookPayload,
  cloneMessageUpdatedHookPayload,
  clonePluginLlmMessages,
  clonePluginSubagentToolCalls,
  clonePluginSubagentToolResults,
  cloneResponseBeforeSendHookPayload,
  cloneSubagentAfterRunPayload,
  cloneSubagentBeforeRunPayload,
  cloneToolAfterCallHookPayload,
  cloneToolBeforeCallHookPayload,
  normalizeAssistantOutput,
} from './plugin-runtime-clone.helpers';
import {
  isJsonObjectValue,
  normalizePositiveInteger,
} from './plugin-runtime-validation.helpers';

export function applyChatBeforeModelMutation(
  currentRequest: ChatBeforeModelRequest,
  mutation: ChatBeforeModelHookMutateResult,
): ChatBeforeModelRequest {
  const nextRequest = cloneChatBeforeModelRequest(currentRequest);

  if ('providerId' in mutation && typeof mutation.providerId === 'string') {
    nextRequest.providerId = mutation.providerId;
  }
  if ('modelId' in mutation && typeof mutation.modelId === 'string') {
    nextRequest.modelId = mutation.modelId;
  }
  if ('systemPrompt' in mutation && typeof mutation.systemPrompt === 'string') {
    nextRequest.systemPrompt = mutation.systemPrompt;
  }
  if ('messages' in mutation && Array.isArray(mutation.messages)) {
    nextRequest.messages = cloneChatMessages(mutation.messages);
  }
  if ('variant' in mutation) {
    nextRequest.variant = mutation.variant ?? undefined;
  }
  if ('providerOptions' in mutation) {
    nextRequest.providerOptions = mutation.providerOptions === null
      || typeof mutation.providerOptions === 'undefined'
      ? undefined
      : { ...mutation.providerOptions };
  }
  if ('headers' in mutation) {
    nextRequest.headers = mutation.headers === null
      || typeof mutation.headers === 'undefined'
      ? undefined
      : { ...mutation.headers };
  }
  if ('maxOutputTokens' in mutation) {
    nextRequest.maxOutputTokens = mutation.maxOutputTokens ?? undefined;
  }
  if ('toolNames' in mutation && Array.isArray(mutation.toolNames)) {
    const allowedToolNames = new Set(mutation.toolNames);
    nextRequest.availableTools = nextRequest.availableTools.filter(
      (tool: ChatBeforeModelRequest['availableTools'][number]) =>
        allowedToolNames.has(tool.name),
    );
  }

  return nextRequest;
}

export function applyChatBeforeModelHookResult(input: {
  request: ChatBeforeModelRequest;
  result:
    | ChatBeforeModelHookPassResult
    | ChatBeforeModelHookMutateResult
    | ChatBeforeModelHookShortCircuitResult
    | null;
}) {
  if (!input.result || input.result.action === 'pass') {
    return {
      action: 'continue' as const,
      request: input.request,
    };
  }

  if (input.result.action === 'short-circuit') {
    return {
      action: 'short-circuit' as const,
      request: input.request,
      ...buildShortCircuitAssistantSnapshot({
        assistantContent: input.result.assistantContent,
        assistantParts: input.result.assistantParts,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        fallbackProviderId: input.request.providerId,
        fallbackModelId: input.request.modelId,
        reason: input.result.reason,
      }),
    };
  }

  return {
    action: 'continue' as const,
    request: applyChatBeforeModelMutation(input.request, input.result),
  };
}

export function applyMessageReceivedMutation(
  currentPayload: MessageReceivedHookPayload,
  mutation: MessageReceivedHookMutateResult,
): MessageReceivedHookPayload {
  const nextPayload = cloneMessageReceivedHookPayload(currentPayload);

  if ('providerId' in mutation && typeof mutation.providerId === 'string') {
    nextPayload.providerId = mutation.providerId;
  }
  if ('modelId' in mutation && typeof mutation.modelId === 'string') {
    nextPayload.modelId = mutation.modelId;
  }
  if ('content' in mutation || 'parts' in mutation) {
    applyMessageContentMutation(nextPayload.message, mutation);
  }
  if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
    nextPayload.modelMessages = clonePluginLlmMessages(mutation.modelMessages);
  }

  return nextPayload;
}

export function applyMessageReceivedHookResult(input: {
  payload: MessageReceivedHookPayload;
  result:
    | MessageReceivedHookPassResult
    | MessageReceivedHookMutateResult
    | MessageReceivedHookShortCircuitResult
    | null;
}) {
  if (!input.result || input.result.action === 'pass') {
    return {
      action: 'continue' as const,
      payload: input.payload,
    };
  }

  if (input.result.action === 'short-circuit') {
    return {
      action: 'short-circuit' as const,
      payload: input.payload,
      ...buildShortCircuitAssistantSnapshot({
        assistantContent: input.result.assistantContent,
        assistantParts: input.result.assistantParts,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        fallbackProviderId: input.payload.providerId,
        fallbackModelId: input.payload.modelId,
        reason: input.result.reason,
      }),
    };
  }

  return {
    action: 'continue' as const,
    payload: applyMessageReceivedMutation(input.payload, input.result),
  };
}

export function applyChatAfterModelMutation(
  currentPayload: ChatAfterModelHookPayload,
  mutation: ChatAfterModelHookMutateResult,
): ChatAfterModelHookPayload {
  const nextPayload = cloneChatAfterModelPayload(currentPayload);
  applyAssistantOutputMutation(nextPayload, mutation);
  return nextPayload;
}

export function applyMessageCreatedMutation(
  currentPayload: MessageCreatedHookPayload,
  mutation: MessageCreatedHookMutateResult,
): MessageCreatedHookPayload {
  const nextPayload = cloneMessageCreatedHookPayload(currentPayload);

  applyMessageContentMutation(nextPayload.message, mutation);
  if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
    nextPayload.modelMessages = clonePluginLlmMessages(mutation.modelMessages);
  }
  applyMessageMetadataMutation(nextPayload.message, mutation);

  return nextPayload;
}

export function applyMessageUpdatedMutation(
  currentPayload: MessageUpdatedHookPayload,
  mutation: MessageUpdatedHookMutateResult,
): MessageUpdatedHookPayload {
  const nextPayload = cloneMessageUpdatedHookPayload(currentPayload);

  applyMessageContentMutation(nextPayload.nextMessage, mutation);
  applyMessageMetadataMutation(nextPayload.nextMessage, mutation);

  return nextPayload;
}

export function applyAutomationBeforeRunMutation(
  currentPayload: AutomationBeforeRunHookPayload,
  mutation: AutomationBeforeRunHookMutateResult,
): AutomationBeforeRunHookPayload {
  const nextPayload = cloneAutomationBeforeRunPayload(currentPayload);

  if ('actions' in mutation && Array.isArray(mutation.actions)) {
    nextPayload.actions = cloneAutomationActions(mutation.actions);
  }

  return nextPayload;
}

export function applyAutomationAfterRunMutation(
  currentPayload: AutomationAfterRunHookPayload,
  mutation: AutomationAfterRunHookMutateResult,
): AutomationAfterRunHookPayload {
  const nextPayload = cloneAutomationAfterRunPayload(currentPayload);

  if ('status' in mutation && typeof mutation.status === 'string') {
    nextPayload.status = mutation.status;
  }
  if ('results' in mutation && Array.isArray(mutation.results)) {
    nextPayload.results = cloneJsonValueArray(mutation.results);
  }

  return nextPayload;
}

export function applySubagentBeforeRunMutation(
  currentPayload: SubagentBeforeRunHookPayload,
  mutation: SubagentBeforeRunHookMutateResult,
): SubagentBeforeRunHookPayload {
  const nextPayload = cloneSubagentBeforeRunPayload(currentPayload);

  if ('providerId' in mutation) {
    nextPayload.request.providerId = mutation.providerId ?? undefined;
  }
  if ('modelId' in mutation) {
    nextPayload.request.modelId = mutation.modelId ?? undefined;
  }
  if ('system' in mutation) {
    nextPayload.request.system = mutation.system ?? undefined;
  }
  if ('messages' in mutation && Array.isArray(mutation.messages)) {
    nextPayload.request.messages = clonePluginLlmMessages(mutation.messages);
  }
  if ('toolNames' in mutation) {
    nextPayload.request.toolNames = mutation.toolNames === null
      ? undefined
      : [...(mutation.toolNames ?? [])];
  }
  if ('variant' in mutation) {
    nextPayload.request.variant = mutation.variant ?? undefined;
  }
  if ('providerOptions' in mutation) {
    nextPayload.request.providerOptions = mutation.providerOptions === null
      ? undefined
      : mutation.providerOptions
        ? { ...mutation.providerOptions }
        : undefined;
  }
  if ('headers' in mutation) {
    nextPayload.request.headers = mutation.headers === null
      ? undefined
      : mutation.headers
        ? { ...mutation.headers }
        : undefined;
  }
  if ('maxOutputTokens' in mutation) {
    nextPayload.request.maxOutputTokens = mutation.maxOutputTokens ?? undefined;
  }
  if ('maxSteps' in mutation && typeof mutation.maxSteps === 'number') {
    nextPayload.request.maxSteps = normalizePositiveInteger(mutation.maxSteps, 1);
  }

  return nextPayload;
}

export function applySubagentAfterRunMutation(
  currentPayload: SubagentAfterRunHookPayload,
  mutation: SubagentAfterRunHookMutateResult,
): SubagentAfterRunHookPayload {
  const nextPayload = cloneSubagentAfterRunPayload(currentPayload);

  if ('providerId' in mutation && typeof mutation.providerId === 'string') {
    nextPayload.result.providerId = mutation.providerId;
  }
  if ('modelId' in mutation && typeof mutation.modelId === 'string') {
    nextPayload.result.modelId = mutation.modelId;
  }
  if ('text' in mutation && typeof mutation.text === 'string') {
    nextPayload.result.text = mutation.text;
    nextPayload.result.message = {
      role: 'assistant',
      content: mutation.text,
    };
  }
  if ('finishReason' in mutation) {
    nextPayload.result.finishReason = mutation.finishReason ?? null;
  }
  if ('toolCalls' in mutation && Array.isArray(mutation.toolCalls)) {
    nextPayload.result.toolCalls = clonePluginSubagentToolCalls(mutation.toolCalls);
  }
  if ('toolResults' in mutation && Array.isArray(mutation.toolResults)) {
    nextPayload.result.toolResults = clonePluginSubagentToolResults(mutation.toolResults);
  }

  return nextPayload;
}

export function applyToolBeforeCallMutation(
  currentPayload: ToolBeforeCallHookPayload,
  mutation: ToolBeforeCallHookMutateResult,
): ToolBeforeCallHookPayload {
  const nextPayload = cloneToolBeforeCallHookPayload(currentPayload);

  if ('params' in mutation && typeof mutation.params !== 'undefined' && isJsonObjectValue(mutation.params)) {
    nextPayload.params = {
      ...mutation.params,
    };
  }

  return nextPayload;
}

export function applyToolAfterCallMutation(
  currentPayload: ToolAfterCallHookPayload,
  mutation: ToolAfterCallHookMutateResult,
): ToolAfterCallHookPayload {
  const nextPayload = cloneToolAfterCallHookPayload(currentPayload);

  if ('output' in mutation && typeof mutation.output !== 'undefined') {
    nextPayload.output = toJsonValue(mutation.output);
  }

  return nextPayload;
}

export function applyResponseBeforeSendMutation(
  currentPayload: ResponseBeforeSendHookPayload,
  mutation: ResponseBeforeSendHookMutateResult,
): ResponseBeforeSendHookPayload {
  const nextPayload = cloneResponseBeforeSendHookPayload(currentPayload);

  if ('providerId' in mutation && typeof mutation.providerId === 'string') {
    nextPayload.providerId = mutation.providerId;
  }
  if ('modelId' in mutation && typeof mutation.modelId === 'string') {
    nextPayload.modelId = mutation.modelId;
  }
  applyAssistantOutputMutation(nextPayload, mutation);
  if ('toolCalls' in mutation && Array.isArray(mutation.toolCalls)) {
    nextPayload.toolCalls = cloneObjectArray(mutation.toolCalls);
  }
  if ('toolResults' in mutation && Array.isArray(mutation.toolResults)) {
    nextPayload.toolResults = cloneObjectArray(mutation.toolResults);
  }

  return nextPayload;
}

function buildShortCircuitAssistantSnapshot(input: {
  assistantContent: string;
  assistantParts?: ChatMessagePart[] | null;
  providerId?: string | null;
  modelId?: string | null;
  fallbackProviderId: string;
  fallbackModelId: string;
  reason?: string;
}) {
  const normalizedAssistant = normalizeAssistantOutput({
    assistantContent: input.assistantContent,
    assistantParts: input.assistantParts,
  });

  return {
    assistantContent: normalizedAssistant.assistantContent,
    assistantParts: normalizedAssistant.assistantParts,
    providerId: input.providerId ?? input.fallbackProviderId,
    modelId: input.modelId ?? input.fallbackModelId,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function applyMessageContentMutation(
  message: Pick<PluginMessageHookInfo, 'content' | 'parts'>,
  mutation: {
    content?: string | null;
    parts?: ChatMessagePart[] | null;
  },
): void {
  if ('content' in mutation) {
    message.content = mutation.content ?? null;
  }
  if ('parts' in mutation) {
    message.parts = mutation.parts === null
      ? []
      : cloneChatMessageParts(mutation.parts ?? []);
  }
}

function applyMessageMetadataMutation(
  message: Pick<PluginMessageHookInfo, 'provider' | 'model' | 'status'>,
  mutation: {
    provider?: string | null;
    model?: string | null;
    status?: PluginMessageHookInfo['status'] | null;
  },
): void {
  if ('provider' in mutation) {
    message.provider = mutation.provider ?? null;
  }
  if ('model' in mutation) {
    message.model = mutation.model ?? null;
  }
  if ('status' in mutation) {
    message.status = mutation.status ?? undefined;
  }
}

function applyAssistantOutputMutation(
  payload: {
    assistantContent: string;
    assistantParts: ChatMessagePart[];
  },
  mutation: {
    assistantContent?: string;
    assistantParts?: ChatMessagePart[] | null;
  },
): void {
  if ('assistantContent' in mutation && typeof mutation.assistantContent === 'string') {
    payload.assistantContent = mutation.assistantContent;
  }
  if ('assistantParts' in mutation) {
    payload.assistantParts = mutation.assistantParts === null
      ? []
      : cloneChatMessageParts(mutation.assistantParts ?? []);
  }
}

function cloneObjectArray<T extends object>(values: readonly T[]): T[] {
  return values.map((value) => ({
    ...value,
  }));
}
