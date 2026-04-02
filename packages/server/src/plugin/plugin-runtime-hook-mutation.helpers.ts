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
  MessageCreatedHookMutateResult,
  MessageCreatedHookPayload,
  MessageReceivedHookPassResult,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPayload,
  MessageReceivedHookShortCircuitResult,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookPayload,
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
    const normalizedAssistant = normalizeAssistantOutput({
      assistantContent: input.result.assistantContent,
      assistantParts: input.result.assistantParts,
    });
    return {
      action: 'short-circuit' as const,
      request: input.request,
      assistantContent: normalizedAssistant.assistantContent,
      assistantParts: normalizedAssistant.assistantParts,
      providerId: input.result.providerId ?? input.request.providerId,
      modelId: input.result.modelId ?? input.request.modelId,
      ...(input.result.reason ? { reason: input.result.reason } : {}),
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
  if ('content' in mutation) {
    nextPayload.message.content = mutation.content ?? null;
  }
  if ('parts' in mutation) {
    const parts = mutation.parts ?? [];
    nextPayload.message.parts = mutation.parts === null
      ? []
      : cloneChatMessageParts(parts);
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
    const normalizedAssistant = normalizeAssistantOutput({
      assistantContent: input.result.assistantContent,
      assistantParts: input.result.assistantParts,
    });
    return {
      action: 'short-circuit' as const,
      payload: input.payload,
      assistantContent: normalizedAssistant.assistantContent,
      assistantParts: normalizedAssistant.assistantParts,
      providerId: input.result.providerId ?? input.payload.providerId,
      modelId: input.result.modelId ?? input.payload.modelId,
      ...(input.result.reason ? { reason: input.result.reason } : {}),
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

  if ('assistantContent' in mutation && typeof mutation.assistantContent === 'string') {
    nextPayload.assistantContent = mutation.assistantContent;
  }
  if ('assistantParts' in mutation) {
    nextPayload.assistantParts = mutation.assistantParts === null
      ? []
      : cloneChatMessageParts(mutation.assistantParts ?? []);
  }

  return nextPayload;
}

export function applyMessageCreatedMutation(
  currentPayload: MessageCreatedHookPayload,
  mutation: MessageCreatedHookMutateResult,
): MessageCreatedHookPayload {
  const nextPayload = cloneMessageCreatedHookPayload(currentPayload);

  if ('content' in mutation) {
    nextPayload.message.content = mutation.content ?? null;
  }
  if ('parts' in mutation) {
    const parts = mutation.parts ?? [];
    nextPayload.message.parts = mutation.parts === null
      ? []
      : cloneChatMessageParts(parts);
  }
  if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
    nextPayload.modelMessages = clonePluginLlmMessages(mutation.modelMessages);
  }
  if ('provider' in mutation) {
    nextPayload.message.provider = mutation.provider ?? null;
  }
  if ('model' in mutation) {
    nextPayload.message.model = mutation.model ?? null;
  }
  if ('status' in mutation) {
    nextPayload.message.status = mutation.status ?? undefined;
  }

  return nextPayload;
}

export function applyMessageUpdatedMutation(
  currentPayload: MessageUpdatedHookPayload,
  mutation: MessageUpdatedHookMutateResult,
): MessageUpdatedHookPayload {
  const nextPayload = cloneMessageUpdatedHookPayload(currentPayload);

  if ('content' in mutation) {
    nextPayload.nextMessage.content = mutation.content ?? null;
  }
  if ('parts' in mutation) {
    const parts = mutation.parts ?? [];
    nextPayload.nextMessage.parts = mutation.parts === null
      ? []
      : cloneChatMessageParts(parts);
  }
  if ('provider' in mutation) {
    nextPayload.nextMessage.provider = mutation.provider ?? null;
  }
  if ('model' in mutation) {
    nextPayload.nextMessage.model = mutation.model ?? null;
  }
  if ('status' in mutation) {
    nextPayload.nextMessage.status = mutation.status ?? undefined;
  }

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
  if ('assistantContent' in mutation && typeof mutation.assistantContent === 'string') {
    nextPayload.assistantContent = mutation.assistantContent;
  }
  if ('assistantParts' in mutation) {
    nextPayload.assistantParts = mutation.assistantParts === null
      ? []
      : cloneChatMessageParts(mutation.assistantParts ?? []);
  }
  if ('toolCalls' in mutation && Array.isArray(mutation.toolCalls)) {
    nextPayload.toolCalls = mutation.toolCalls.map((toolCall) => ({
      ...toolCall,
    }));
  }
  if ('toolResults' in mutation && Array.isArray(mutation.toolResults)) {
    nextPayload.toolResults = mutation.toolResults.map((toolResult) => ({
      ...toolResult,
    }));
  }

  return nextPayload;
}
