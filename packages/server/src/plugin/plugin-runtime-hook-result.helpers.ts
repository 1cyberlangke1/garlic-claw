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
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import {
  isActionConfigArray,
  isChatMessagePartArray,
  isChatMessageStatus,
  isJsonObjectValue,
  isPluginLlmMessageArray,
  isPluginSubagentToolCallArray,
  isPluginSubagentToolResultArray,
  isStringArray,
  isStringRecord,
} from './plugin-runtime-validation.helpers';

// NOTE: 当前保持单文件，因为这些 Hook result 归一化规则共享同一套错误文案和字段约束；
// 若按 hook 再拆细，会把同类校验散到更多文件里，后续调整时更容易发生约束漂移。

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

function castValidatedHookResult<T>(result: JsonObject): T {
  return result as T;
}

export function normalizeChatBeforeModelHookResult(
  result: JsonValue | null | undefined,
): NormalizedChatBeforeModelHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('chat:before-model Hook 返回值必须是对象');
  }

  if (result.action === 'pass') {
    return { action: 'pass' };
  }

  if (result.action === 'mutate') {
    if ('providerId' in result && typeof result.providerId !== 'string') {
      throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in result && typeof result.modelId !== 'string') {
      throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
    }
    if ('systemPrompt' in result && typeof result.systemPrompt !== 'string') {
      throw new Error('chat:before-model Hook 的 systemPrompt 必须是字符串');
    }
    if ('messages' in result && !Array.isArray(result.messages)) {
      throw new Error('chat:before-model Hook 的 messages 必须是数组');
    }
    if ('toolNames' in result && !isStringArray(result.toolNames)) {
      throw new Error('chat:before-model Hook 的 toolNames 必须是字符串数组');
    }
    if ('variant' in result && result.variant !== null && typeof result.variant !== 'string') {
      throw new Error('chat:before-model Hook 的 variant 必须是字符串或 null');
    }
    if (
      'providerOptions' in result
      && result.providerOptions !== null
      && !isJsonObjectValue(result.providerOptions)
    ) {
      throw new Error('chat:before-model Hook 的 providerOptions 必须是对象或 null');
    }
    if ('headers' in result && result.headers !== null && !isStringRecord(result.headers)) {
      throw new Error('chat:before-model Hook 的 headers 必须是字符串对象或 null');
    }
    if (
      'maxOutputTokens' in result
      && result.maxOutputTokens !== null
      && typeof result.maxOutputTokens !== 'number'
    ) {
      throw new Error('chat:before-model Hook 的 maxOutputTokens 必须是数字或 null');
    }

    return castValidatedHookResult<ChatBeforeModelHookMutateResult>(result);
  }

  if (result.action === 'short-circuit') {
    if (typeof result.assistantContent !== 'string') {
      throw new Error('chat:before-model Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in result
      && result.assistantParts !== null
      && !isChatMessagePartArray(result.assistantParts)
    ) {
      throw new Error('chat:before-model Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('providerId' in result && typeof result.providerId !== 'string') {
      throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in result && typeof result.modelId !== 'string') {
      throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
    }
    if ('reason' in result && typeof result.reason !== 'string') {
      throw new Error('chat:before-model Hook 的 reason 必须是字符串');
    }

    return castValidatedHookResult<ChatBeforeModelHookShortCircuitResult>(result);
  }

  throw new Error('chat:before-model Hook 返回了未知 action');
}

export function normalizeMessageReceivedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageReceivedHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('message:received Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('providerId' in result && typeof result.providerId !== 'string') {
      throw new Error('message:received Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in result && typeof result.modelId !== 'string') {
      throw new Error('message:received Hook 的 modelId 必须是字符串');
    }
    if ('content' in result && result.content !== null && typeof result.content !== 'string') {
      throw new Error('message:received Hook 的 content 必须是字符串或 null');
    }
    if ('parts' in result && result.parts !== null && !isChatMessagePartArray(result.parts)) {
      throw new Error('message:received Hook 的 parts 必须是消息 part 数组或 null');
    }
    if ('modelMessages' in result && !isPluginLlmMessageArray(result.modelMessages)) {
      throw new Error('message:received Hook 的 modelMessages 必须是统一消息数组');
    }

    return castValidatedHookResult<MessageReceivedHookMutateResult>(result);
  }
  if (result.action === 'short-circuit') {
    if (typeof result.assistantContent !== 'string') {
      throw new Error('message:received Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in result
      && result.assistantParts !== null
      && !isChatMessagePartArray(result.assistantParts)
    ) {
      throw new Error('message:received Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('providerId' in result && typeof result.providerId !== 'string') {
      throw new Error('message:received Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in result && typeof result.modelId !== 'string') {
      throw new Error('message:received Hook 的 modelId 必须是字符串');
    }
    if ('reason' in result && typeof result.reason !== 'string') {
      throw new Error('message:received Hook 的 reason 必须是字符串');
    }

    return castValidatedHookResult<MessageReceivedHookShortCircuitResult>(result);
  }

  throw new Error('message:received Hook 返回了未知 action');
}

export function normalizeChatAfterModelHookResult(
  result: JsonValue | null | undefined,
): NormalizedChatAfterModelHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('chat:after-model Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if (
      'assistantContent' in result
      && result.assistantContent !== null
      && typeof result.assistantContent !== 'string'
    ) {
      throw new Error('chat:after-model Hook 的 assistantContent 必须是字符串或 null');
    }
    if (
      'assistantParts' in result
      && result.assistantParts !== null
      && !isChatMessagePartArray(result.assistantParts)
    ) {
      throw new Error('chat:after-model Hook 的 assistantParts 必须是消息 part 数组或 null');
    }

    return castValidatedHookResult<ChatAfterModelHookMutateResult>(result);
  }

  throw new Error('chat:after-model Hook 返回了未知 action');
}

export function normalizeMessageCreatedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageCreatedHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('message:created Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('content' in result && result.content !== null && typeof result.content !== 'string') {
      throw new Error('message:created Hook 的 content 必须是字符串或 null');
    }
    if ('parts' in result && result.parts !== null && !isChatMessagePartArray(result.parts)) {
      throw new Error('message:created Hook 的 parts 必须是消息 part 数组或 null');
    }
    if ('modelMessages' in result && !isPluginLlmMessageArray(result.modelMessages)) {
      throw new Error('message:created Hook 的 modelMessages 必须是统一消息数组');
    }
    if ('provider' in result && result.provider !== null && typeof result.provider !== 'string') {
      throw new Error('message:created Hook 的 provider 必须是字符串或 null');
    }
    if ('model' in result && result.model !== null && typeof result.model !== 'string') {
      throw new Error('message:created Hook 的 model 必须是字符串或 null');
    }
    if ('status' in result && result.status !== null && !isChatMessageStatus(result.status)) {
      throw new Error('message:created Hook 的 status 必须是合法消息状态或 null');
    }

    return castValidatedHookResult<MessageCreatedHookMutateResult>(result);
  }

  throw new Error('message:created Hook 返回了未知 action');
}

export function normalizeMessageUpdatedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageUpdatedHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('message:updated Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('content' in result && result.content !== null && typeof result.content !== 'string') {
      throw new Error('message:updated Hook 的 content 必须是字符串或 null');
    }
    if ('parts' in result && result.parts !== null && !isChatMessagePartArray(result.parts)) {
      throw new Error('message:updated Hook 的 parts 必须是消息 part 数组或 null');
    }
    if ('provider' in result && result.provider !== null && typeof result.provider !== 'string') {
      throw new Error('message:updated Hook 的 provider 必须是字符串或 null');
    }
    if ('model' in result && result.model !== null && typeof result.model !== 'string') {
      throw new Error('message:updated Hook 的 model 必须是字符串或 null');
    }
    if ('status' in result && result.status !== null && !isChatMessageStatus(result.status)) {
      throw new Error('message:updated Hook 的 status 必须是合法消息状态或 null');
    }

    return castValidatedHookResult<MessageUpdatedHookMutateResult>(result);
  }

  throw new Error('message:updated Hook 返回了未知 action');
}

export function normalizeAutomationBeforeRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedAutomationBeforeRunHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('automation:before-run Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('actions' in result && !isActionConfigArray(result.actions)) {
      throw new Error('automation:before-run Hook 的 actions 必须是动作数组');
    }

    return castValidatedHookResult<AutomationBeforeRunHookMutateResult>(result);
  }
  if (result.action === 'short-circuit') {
    if (typeof result.status !== 'string') {
      throw new Error('automation:before-run Hook 的 status 必须是字符串');
    }
    if (!Array.isArray(result.results)) {
      throw new Error('automation:before-run Hook 的 results 必须是数组');
    }

    return castValidatedHookResult<AutomationBeforeRunHookShortCircuitResult>(result);
  }

  throw new Error('automation:before-run Hook 返回了未知 action');
}

export function normalizeAutomationAfterRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedAutomationAfterRunHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('automation:after-run Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('status' in result && typeof result.status !== 'string') {
      throw new Error('automation:after-run Hook 的 status 必须是字符串');
    }
    if ('results' in result && !Array.isArray(result.results)) {
      throw new Error('automation:after-run Hook 的 results 必须是数组');
    }

    return castValidatedHookResult<AutomationAfterRunHookMutateResult>(result);
  }

  throw new Error('automation:after-run Hook 返回了未知 action');
}

export function normalizeSubagentBeforeRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedSubagentBeforeRunHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('subagent:before-run Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('providerId' in result && result.providerId !== null && typeof result.providerId !== 'string') {
      throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
    }
    if ('modelId' in result && result.modelId !== null && typeof result.modelId !== 'string') {
      throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
    }
    if ('system' in result && result.system !== null && typeof result.system !== 'string') {
      throw new Error('subagent:before-run Hook 的 system 必须是字符串或 null');
    }
    if ('messages' in result && !isPluginLlmMessageArray(result.messages)) {
      throw new Error('subagent:before-run Hook 的 messages 必须是统一消息数组');
    }
    if ('toolNames' in result && result.toolNames !== null && !isStringArray(result.toolNames)) {
      throw new Error('subagent:before-run Hook 的 toolNames 必须是字符串数组或 null');
    }
    if ('variant' in result && result.variant !== null && typeof result.variant !== 'string') {
      throw new Error('subagent:before-run Hook 的 variant 必须是字符串或 null');
    }
    if ('providerOptions' in result && result.providerOptions !== null && !isJsonObjectValue(result.providerOptions)) {
      throw new Error('subagent:before-run Hook 的 providerOptions 必须是对象或 null');
    }
    if ('headers' in result && result.headers !== null && !isStringRecord(result.headers)) {
      throw new Error('subagent:before-run Hook 的 headers 必须是字符串字典或 null');
    }
    if ('maxOutputTokens' in result && result.maxOutputTokens !== null && typeof result.maxOutputTokens !== 'number') {
      throw new Error('subagent:before-run Hook 的 maxOutputTokens 必须是数字或 null');
    }
    if ('maxSteps' in result && result.maxSteps !== null && typeof result.maxSteps !== 'number') {
      throw new Error('subagent:before-run Hook 的 maxSteps 必须是数字或 null');
    }

    return castValidatedHookResult<SubagentBeforeRunHookMutateResult>(result);
  }
  if (result.action === 'short-circuit') {
    if (typeof result.text !== 'string') {
      throw new Error('subagent:before-run Hook 的 text 必须是字符串');
    }
    if ('providerId' in result && result.providerId !== null && typeof result.providerId !== 'string') {
      throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
    }
    if ('modelId' in result && result.modelId !== null && typeof result.modelId !== 'string') {
      throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
    }
    if ('finishReason' in result && result.finishReason !== null && typeof result.finishReason !== 'string') {
      throw new Error('subagent:before-run Hook 的 finishReason 必须是字符串或 null');
    }
    if ('toolCalls' in result && !isPluginSubagentToolCallArray(result.toolCalls)) {
      throw new Error('subagent:before-run Hook 的 toolCalls 必须是工具调用数组');
    }
    if ('toolResults' in result && !isPluginSubagentToolResultArray(result.toolResults)) {
      throw new Error('subagent:before-run Hook 的 toolResults 必须是工具结果数组');
    }

    return castValidatedHookResult<SubagentBeforeRunHookShortCircuitResult>(result);
  }

  throw new Error('subagent:before-run Hook 返回了未知 action');
}

export function normalizeSubagentAfterRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedSubagentAfterRunHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('subagent:after-run Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('text' in result && typeof result.text !== 'string') {
      throw new Error('subagent:after-run Hook 的 text 必须是字符串');
    }
    if ('providerId' in result && result.providerId !== null && typeof result.providerId !== 'string') {
      throw new Error('subagent:after-run Hook 的 providerId 必须是字符串或 null');
    }
    if ('modelId' in result && result.modelId !== null && typeof result.modelId !== 'string') {
      throw new Error('subagent:after-run Hook 的 modelId 必须是字符串或 null');
    }
    if ('finishReason' in result && result.finishReason !== null && typeof result.finishReason !== 'string') {
      throw new Error('subagent:after-run Hook 的 finishReason 必须是字符串或 null');
    }
    if ('toolCalls' in result && !isPluginSubagentToolCallArray(result.toolCalls)) {
      throw new Error('subagent:after-run Hook 的 toolCalls 必须是工具调用数组');
    }
    if ('toolResults' in result && !isPluginSubagentToolResultArray(result.toolResults)) {
      throw new Error('subagent:after-run Hook 的 toolResults 必须是工具结果数组');
    }

    return castValidatedHookResult<SubagentAfterRunHookMutateResult>(result);
  }

  throw new Error('subagent:after-run Hook 返回了未知 action');
}

export function normalizeToolBeforeCallHookResult(
  result: JsonValue | null | undefined,
): NormalizedToolBeforeCallHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('tool:before-call Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('params' in result && !isJsonObjectValue(result.params)) {
      throw new Error('tool:before-call Hook 的 params 必须是对象');
    }

    return castValidatedHookResult<ToolBeforeCallHookMutateResult>(result);
  }
  if (result.action === 'short-circuit') {
    if (!('output' in result) || typeof result.output === 'undefined') {
      throw new Error('tool:before-call Hook 的 output 不能为空');
    }

    return castValidatedHookResult<ToolBeforeCallHookShortCircuitResult>(result);
  }

  throw new Error('tool:before-call Hook 返回了未知 action');
}

export function normalizeToolAfterCallHookResult(
  result: JsonValue | null | undefined,
): NormalizedToolAfterCallHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('tool:after-call Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if (!('output' in result) || typeof result.output === 'undefined') {
      throw new Error('tool:after-call Hook 的 output 不能为空');
    }

    return castValidatedHookResult<ToolAfterCallHookMutateResult>(result);
  }

  throw new Error('tool:after-call Hook 返回了未知 action');
}

export function normalizeResponseBeforeSendHookResult(
  result: JsonValue | null | undefined,
): NormalizedResponseBeforeSendHookResult | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error('response:before-send Hook 返回值必须是对象');
  }
  if (result.action === 'pass') {
    return { action: 'pass' };
  }
  if (result.action === 'mutate') {
    if ('providerId' in result && typeof result.providerId !== 'string') {
      throw new Error('response:before-send Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in result && typeof result.modelId !== 'string') {
      throw new Error('response:before-send Hook 的 modelId 必须是字符串');
    }
    if ('assistantContent' in result && typeof result.assistantContent !== 'string') {
      throw new Error('response:before-send Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in result
      && result.assistantParts !== null
      && !isChatMessagePartArray(result.assistantParts)
    ) {
      throw new Error('response:before-send Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('toolCalls' in result && !Array.isArray(result.toolCalls)) {
      throw new Error('response:before-send Hook 的 toolCalls 必须是数组');
    }
    if ('toolResults' in result && !Array.isArray(result.toolResults)) {
      throw new Error('response:before-send Hook 的 toolResults 必须是数组');
    }

    return castValidatedHookResult<ResponseBeforeSendHookMutateResult>(result);
  }

  throw new Error('response:before-send Hook 返回了未知 action');
}
