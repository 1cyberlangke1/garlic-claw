import type {
  AutomationAfterRunHookMutateResult,
  AutomationAfterRunHookPassResult,
  AutomationBeforeRunHookMutateResult,
  AutomationBeforeRunHookPassResult,
  AutomationBeforeRunHookShortCircuitResult,
  ChatAfterModelHookMutateResult,
  ChatAfterModelHookPassResult,
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookShortCircuitResult,
  MessageCreatedHookMutateResult,
  MessageCreatedHookResult,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPassResult,
  MessageReceivedHookShortCircuitResult,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookResult,
  ResponseBeforeSendHookMutateResult,
  ResponseBeforeSendHookPassResult,
  SubagentAfterRunHookMutateResult,
  SubagentAfterRunHookPassResult,
  SubagentBeforeRunHookMutateResult,
  SubagentBeforeRunHookPassResult,
  SubagentBeforeRunHookShortCircuitResult,
  ToolAfterCallHookMutateResult,
  ToolAfterCallHookPassResult,
  ToolBeforeCallHookMutateResult,
  ToolBeforeCallHookPassResult,
  ToolBeforeCallHookShortCircuitResult,
} from './types/plugin';
import type { JsonObject, JsonValue } from './types/json';
import {
  isJsonObjectValue,
  isStringRecord,
} from './types/json';
import {
  isActionConfigArray,
  isChatMessagePartArray,
  isChatMessageStatus,
  isPluginLlmMessageArray,
  isPluginSubagentToolCallArray,
  isPluginSubagentToolResultArray,
  isStringArray,
} from './plugin-runtime-validation.helpers';

export function readHookResultObject(
  result: JsonValue | null | undefined,
  hookName: string,
): JsonObject | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error(`${hookName} Hook 返回值必须是对象`);
  }

  return result;
}

export function castValidatedHookResult<T>(result: JsonObject): T {
  return result as T;
}

type NormalizedChatBeforeModelHookResult =
  | ChatBeforeModelHookPassResult
  | ChatBeforeModelHookMutateResult
  | ChatBeforeModelHookShortCircuitResult;

type NormalizedMessageReceivedHookResult =
  | MessageReceivedHookPassResult
  | MessageReceivedHookMutateResult
  | MessageReceivedHookShortCircuitResult;

type NormalizedChatAfterModelHookResult =
  | ChatAfterModelHookPassResult
  | ChatAfterModelHookMutateResult;

type NormalizedMessageCreatedHookResult =
  | MessageCreatedHookResult
  | MessageCreatedHookMutateResult;

type NormalizedMessageUpdatedHookResult =
  | MessageUpdatedHookResult
  | MessageUpdatedHookMutateResult;

type NormalizedAutomationBeforeRunHookResult =
  | AutomationBeforeRunHookPassResult
  | AutomationBeforeRunHookMutateResult
  | AutomationBeforeRunHookShortCircuitResult;

type NormalizedAutomationAfterRunHookResult =
  | AutomationAfterRunHookPassResult
  | AutomationAfterRunHookMutateResult;

type NormalizedToolBeforeCallHookResult =
  | ToolBeforeCallHookPassResult
  | ToolBeforeCallHookMutateResult
  | ToolBeforeCallHookShortCircuitResult;

type NormalizedToolAfterCallHookResult =
  | ToolAfterCallHookPassResult
  | ToolAfterCallHookMutateResult;

type NormalizedResponseBeforeSendHookResult =
  | ResponseBeforeSendHookPassResult
  | ResponseBeforeSendHookMutateResult;

type NormalizedSubagentBeforeRunHookResult =
  | SubagentBeforeRunHookPassResult
  | SubagentBeforeRunHookMutateResult
  | SubagentBeforeRunHookShortCircuitResult;

type NormalizedSubagentAfterRunHookResult =
  | SubagentAfterRunHookPassResult
  | SubagentAfterRunHookMutateResult;

export function normalizeChatBeforeModelHookResult(
  result: JsonValue | null | undefined,
): NormalizedChatBeforeModelHookResult | null {
  const objectResult = readHookResultObject(result, 'chat:before-model');
  if (!objectResult) {
    return null;
  }

  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }

  if (objectResult.action === 'mutate') {
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
    }
    if ('systemPrompt' in objectResult && typeof objectResult.systemPrompt !== 'string') {
      throw new Error('chat:before-model Hook 的 systemPrompt 必须是字符串');
    }
    if ('messages' in objectResult && !Array.isArray(objectResult.messages)) {
      throw new Error('chat:before-model Hook 的 messages 必须是数组');
    }
    if ('toolNames' in objectResult && !isStringArray(objectResult.toolNames)) {
      throw new Error('chat:before-model Hook 的 toolNames 必须是字符串数组');
    }
    if (
      'variant' in objectResult
      && objectResult.variant !== null
      && typeof objectResult.variant !== 'string'
    ) {
      throw new Error('chat:before-model Hook 的 variant 必须是字符串或 null');
    }
    if (
      'providerOptions' in objectResult
      && objectResult.providerOptions !== null
      && !isJsonObjectValue(objectResult.providerOptions)
    ) {
      throw new Error('chat:before-model Hook 的 providerOptions 必须是对象或 null');
    }
    if (
      'headers' in objectResult
      && objectResult.headers !== null
      && !isStringRecord(objectResult.headers)
    ) {
      throw new Error('chat:before-model Hook 的 headers 必须是字符串对象或 null');
    }
    if (
      'maxOutputTokens' in objectResult
      && objectResult.maxOutputTokens !== null
      && typeof objectResult.maxOutputTokens !== 'number'
    ) {
      throw new Error('chat:before-model Hook 的 maxOutputTokens 必须是数字或 null');
    }

    return castValidatedHookResult<ChatBeforeModelHookMutateResult>(objectResult);
  }

  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.assistantContent !== 'string') {
      throw new Error('chat:before-model Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('chat:before-model Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
    }
    if ('reason' in objectResult && typeof objectResult.reason !== 'string') {
      throw new Error('chat:before-model Hook 的 reason 必须是字符串');
    }

    return castValidatedHookResult<ChatBeforeModelHookShortCircuitResult>(objectResult);
  }

  throw new Error('chat:before-model Hook 返回了未知 action');
}

export function normalizeMessageReceivedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageReceivedHookResult | null {
  const objectResult = readHookResultObject(result, 'message:received');
  if (!objectResult) {
    return null;
  }

  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('message:received Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('message:received Hook 的 modelId 必须是字符串');
    }
    if (
      'content' in objectResult
      && objectResult.content !== null
      && typeof objectResult.content !== 'string'
    ) {
      throw new Error('message:received Hook 的 content 必须是字符串或 null');
    }
    if (
      'parts' in objectResult
      && objectResult.parts !== null
      && !isChatMessagePartArray(objectResult.parts)
    ) {
      throw new Error('message:received Hook 的 parts 必须是消息 part 数组或 null');
    }
    if (
      'modelMessages' in objectResult
      && !isPluginLlmMessageArray(objectResult.modelMessages)
    ) {
      throw new Error('message:received Hook 的 modelMessages 必须是统一消息数组');
    }

    return castValidatedHookResult<MessageReceivedHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.assistantContent !== 'string') {
      throw new Error('message:received Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('message:received Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('message:received Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('message:received Hook 的 modelId 必须是字符串');
    }
    if ('reason' in objectResult && typeof objectResult.reason !== 'string') {
      throw new Error('message:received Hook 的 reason 必须是字符串');
    }

    return castValidatedHookResult<MessageReceivedHookShortCircuitResult>(objectResult);
  }

  throw new Error('message:received Hook 返回了未知 action');
}

export function normalizeChatAfterModelHookResult(
  result: JsonValue | null | undefined,
): NormalizedChatAfterModelHookResult | null {
  const objectResult = readHookResultObject(result, 'chat:after-model');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'assistantContent' in objectResult
      && objectResult.assistantContent !== null
      && typeof objectResult.assistantContent !== 'string'
    ) {
      throw new Error('chat:after-model Hook 的 assistantContent 必须是字符串或 null');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('chat:after-model Hook 的 assistantParts 必须是消息 part 数组或 null');
    }

    return castValidatedHookResult<ChatAfterModelHookMutateResult>(objectResult);
  }

  throw new Error('chat:after-model Hook 返回了未知 action');
}

export function normalizeMessageCreatedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageCreatedHookResult | null {
  const objectResult = readHookResultObject(result, 'message:created');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'content' in objectResult
      && objectResult.content !== null
      && typeof objectResult.content !== 'string'
    ) {
      throw new Error('message:created Hook 的 content 必须是字符串或 null');
    }
    if (
      'parts' in objectResult
      && objectResult.parts !== null
      && !isChatMessagePartArray(objectResult.parts)
    ) {
      throw new Error('message:created Hook 的 parts 必须是消息 part 数组或 null');
    }
    if (
      'modelMessages' in objectResult
      && !isPluginLlmMessageArray(objectResult.modelMessages)
    ) {
      throw new Error('message:created Hook 的 modelMessages 必须是统一消息数组');
    }
    if (
      'provider' in objectResult
      && objectResult.provider !== null
      && typeof objectResult.provider !== 'string'
    ) {
      throw new Error('message:created Hook 的 provider 必须是字符串或 null');
    }
    if (
      'model' in objectResult
      && objectResult.model !== null
      && typeof objectResult.model !== 'string'
    ) {
      throw new Error('message:created Hook 的 model 必须是字符串或 null');
    }
    if (
      'status' in objectResult
      && objectResult.status !== null
      && !isChatMessageStatus(objectResult.status)
    ) {
      throw new Error('message:created Hook 的 status 必须是合法消息状态或 null');
    }

    return castValidatedHookResult<MessageCreatedHookMutateResult>(objectResult);
  }

  throw new Error('message:created Hook 返回了未知 action');
}

export function normalizeMessageUpdatedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageUpdatedHookResult | null {
  const objectResult = readHookResultObject(result, 'message:updated');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'content' in objectResult
      && objectResult.content !== null
      && typeof objectResult.content !== 'string'
    ) {
      throw new Error('message:updated Hook 的 content 必须是字符串或 null');
    }
    if (
      'parts' in objectResult
      && objectResult.parts !== null
      && !isChatMessagePartArray(objectResult.parts)
    ) {
      throw new Error('message:updated Hook 的 parts 必须是消息 part 数组或 null');
    }
    if (
      'provider' in objectResult
      && objectResult.provider !== null
      && typeof objectResult.provider !== 'string'
    ) {
      throw new Error('message:updated Hook 的 provider 必须是字符串或 null');
    }
    if (
      'model' in objectResult
      && objectResult.model !== null
      && typeof objectResult.model !== 'string'
    ) {
      throw new Error('message:updated Hook 的 model 必须是字符串或 null');
    }
    if (
      'status' in objectResult
      && objectResult.status !== null
      && !isChatMessageStatus(objectResult.status)
    ) {
      throw new Error('message:updated Hook 的 status 必须是合法消息状态或 null');
    }

    return castValidatedHookResult<MessageUpdatedHookMutateResult>(objectResult);
  }

  throw new Error('message:updated Hook 返回了未知 action');
}

export function normalizeAutomationBeforeRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedAutomationBeforeRunHookResult | null {
  const objectResult = readHookResultObject(result, 'automation:before-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('actions' in objectResult && !isActionConfigArray(objectResult.actions)) {
      throw new Error('automation:before-run Hook 的 actions 必须是动作数组');
    }

    return castValidatedHookResult<AutomationBeforeRunHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.status !== 'string') {
      throw new Error('automation:before-run Hook 的 status 必须是字符串');
    }
    if (!Array.isArray(objectResult.results)) {
      throw new Error('automation:before-run Hook 的 results 必须是数组');
    }

    return castValidatedHookResult<AutomationBeforeRunHookShortCircuitResult>(objectResult);
  }

  throw new Error('automation:before-run Hook 返回了未知 action');
}

export function normalizeAutomationAfterRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedAutomationAfterRunHookResult | null {
  const objectResult = readHookResultObject(result, 'automation:after-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('status' in objectResult && typeof objectResult.status !== 'string') {
      throw new Error('automation:after-run Hook 的 status 必须是字符串');
    }
    if ('results' in objectResult && !Array.isArray(objectResult.results)) {
      throw new Error('automation:after-run Hook 的 results 必须是数组');
    }

    return castValidatedHookResult<AutomationAfterRunHookMutateResult>(objectResult);
  }

  throw new Error('automation:after-run Hook 返回了未知 action');
}

export function normalizeToolBeforeCallHookResult(
  result: JsonValue | null | undefined,
): NormalizedToolBeforeCallHookResult | null {
  const objectResult = readHookResultObject(result, 'tool:before-call');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('params' in objectResult && !isJsonObjectValue(objectResult.params)) {
      throw new Error('tool:before-call Hook 的 params 必须是对象');
    }

    return castValidatedHookResult<ToolBeforeCallHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (!('output' in objectResult) || typeof objectResult.output === 'undefined') {
      throw new Error('tool:before-call Hook 的 output 不能为空');
    }

    return castValidatedHookResult<ToolBeforeCallHookShortCircuitResult>(objectResult);
  }

  throw new Error('tool:before-call Hook 返回了未知 action');
}

export function normalizeToolAfterCallHookResult(
  result: JsonValue | null | undefined,
): NormalizedToolAfterCallHookResult | null {
  const objectResult = readHookResultObject(result, 'tool:after-call');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (!('output' in objectResult) || typeof objectResult.output === 'undefined') {
      throw new Error('tool:after-call Hook 的 output 不能为空');
    }

    return castValidatedHookResult<ToolAfterCallHookMutateResult>(objectResult);
  }

  throw new Error('tool:after-call Hook 返回了未知 action');
}

export function normalizeResponseBeforeSendHookResult(
  result: JsonValue | null | undefined,
): NormalizedResponseBeforeSendHookResult | null {
  const objectResult = readHookResultObject(result, 'response:before-send');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('response:before-send Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('response:before-send Hook 的 modelId 必须是字符串');
    }
    if (
      'assistantContent' in objectResult
      && typeof objectResult.assistantContent !== 'string'
    ) {
      throw new Error('response:before-send Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('response:before-send Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('toolCalls' in objectResult && !Array.isArray(objectResult.toolCalls)) {
      throw new Error('response:before-send Hook 的 toolCalls 必须是数组');
    }
    if ('toolResults' in objectResult && !Array.isArray(objectResult.toolResults)) {
      throw new Error('response:before-send Hook 的 toolResults 必须是数组');
    }

    return castValidatedHookResult<ResponseBeforeSendHookMutateResult>(objectResult);
  }

  throw new Error('response:before-send Hook 返回了未知 action');
}

export function normalizeSubagentBeforeRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedSubagentBeforeRunHookResult | null {
  const objectResult = readHookResultObject(result, 'subagent:before-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'providerId' in objectResult
      && objectResult.providerId !== null
      && typeof objectResult.providerId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
    }
    if (
      'modelId' in objectResult
      && objectResult.modelId !== null
      && typeof objectResult.modelId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
    }
    if (
      'system' in objectResult
      && objectResult.system !== null
      && typeof objectResult.system !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 system 必须是字符串或 null');
    }
    if (
      'messages' in objectResult
      && !isPluginLlmMessageArray(objectResult.messages)
    ) {
      throw new Error('subagent:before-run Hook 的 messages 必须是统一消息数组');
    }
    if (
      'toolNames' in objectResult
      && objectResult.toolNames !== null
      && !isStringArray(objectResult.toolNames)
    ) {
      throw new Error('subagent:before-run Hook 的 toolNames 必须是字符串数组或 null');
    }
    if (
      'variant' in objectResult
      && objectResult.variant !== null
      && typeof objectResult.variant !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 variant 必须是字符串或 null');
    }
    if (
      'providerOptions' in objectResult
      && objectResult.providerOptions !== null
      && !isJsonObjectValue(objectResult.providerOptions)
    ) {
      throw new Error('subagent:before-run Hook 的 providerOptions 必须是对象或 null');
    }
    if (
      'headers' in objectResult
      && objectResult.headers !== null
      && !isStringRecord(objectResult.headers)
    ) {
      throw new Error('subagent:before-run Hook 的 headers 必须是字符串字典或 null');
    }
    if (
      'maxOutputTokens' in objectResult
      && objectResult.maxOutputTokens !== null
      && typeof objectResult.maxOutputTokens !== 'number'
    ) {
      throw new Error('subagent:before-run Hook 的 maxOutputTokens 必须是数字或 null');
    }
    if (
      'maxSteps' in objectResult
      && objectResult.maxSteps !== null
      && typeof objectResult.maxSteps !== 'number'
    ) {
      throw new Error('subagent:before-run Hook 的 maxSteps 必须是数字或 null');
    }

    return castValidatedHookResult<SubagentBeforeRunHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.text !== 'string') {
      throw new Error('subagent:before-run Hook 的 text 必须是字符串');
    }
    if (
      'providerId' in objectResult
      && objectResult.providerId !== null
      && typeof objectResult.providerId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
    }
    if (
      'modelId' in objectResult
      && objectResult.modelId !== null
      && typeof objectResult.modelId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
    }
    if (
      'finishReason' in objectResult
      && objectResult.finishReason !== null
      && typeof objectResult.finishReason !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 finishReason 必须是字符串或 null');
    }
    if (
      'toolCalls' in objectResult
      && !isPluginSubagentToolCallArray(objectResult.toolCalls)
    ) {
      throw new Error('subagent:before-run Hook 的 toolCalls 必须是工具调用数组');
    }
    if (
      'toolResults' in objectResult
      && !isPluginSubagentToolResultArray(objectResult.toolResults)
    ) {
      throw new Error('subagent:before-run Hook 的 toolResults 必须是工具结果数组');
    }

    return castValidatedHookResult<SubagentBeforeRunHookShortCircuitResult>(objectResult);
  }

  throw new Error('subagent:before-run Hook 返回了未知 action');
}

export function normalizeSubagentAfterRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedSubagentAfterRunHookResult | null {
  const objectResult = readHookResultObject(result, 'subagent:after-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('text' in objectResult && typeof objectResult.text !== 'string') {
      throw new Error('subagent:after-run Hook 的 text 必须是字符串');
    }
    if (
      'providerId' in objectResult
      && objectResult.providerId !== null
      && typeof objectResult.providerId !== 'string'
    ) {
      throw new Error('subagent:after-run Hook 的 providerId 必须是字符串或 null');
    }
    if (
      'modelId' in objectResult
      && objectResult.modelId !== null
      && typeof objectResult.modelId !== 'string'
    ) {
      throw new Error('subagent:after-run Hook 的 modelId 必须是字符串或 null');
    }
    if (
      'finishReason' in objectResult
      && objectResult.finishReason !== null
      && typeof objectResult.finishReason !== 'string'
    ) {
      throw new Error('subagent:after-run Hook 的 finishReason 必须是字符串或 null');
    }
    if (
      'toolCalls' in objectResult
      && !isPluginSubagentToolCallArray(objectResult.toolCalls)
    ) {
      throw new Error('subagent:after-run Hook 的 toolCalls 必须是工具调用数组');
    }
    if (
      'toolResults' in objectResult
      && !isPluginSubagentToolResultArray(objectResult.toolResults)
    ) {
      throw new Error('subagent:after-run Hook 的 toolResults 必须是工具结果数组');
    }

    return castValidatedHookResult<SubagentAfterRunHookMutateResult>(objectResult);
  }

  throw new Error('subagent:after-run Hook 返回了未知 action');
}
