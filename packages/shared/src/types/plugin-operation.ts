import type { ActionConfig, AutomationInfo } from './automation';
import type { ChatMessagePart } from './chat';
import type { JsonObject, JsonValue } from './json';
import type {
  PluginCallContext,
  PluginCapability,
  PluginRuntimeKind,
} from './plugin';

/** 自动化运行前 Hook 的输入。 */
export interface AutomationBeforeRunHookPayload {
  context: PluginCallContext;
  automation: AutomationInfo;
  actions: ActionConfig[];
}

/** 自动化运行前 Hook 不改写当前请求。 */
export interface AutomationBeforeRunHookPassResult {
  action: 'pass';
}

/** 自动化运行前 Hook 改写待执行动作列表。 */
export interface AutomationBeforeRunHookMutateResult {
  action: 'mutate';
  actions?: ActionConfig[];
}

/** 自动化运行前 Hook 直接短路本轮执行。 */
export interface AutomationBeforeRunHookShortCircuitResult {
  action: 'short-circuit';
  status: string;
  results: JsonValue[];
}

/** 自动化运行前 Hook 的返回。 */
export type AutomationBeforeRunHookResult =
  | AutomationBeforeRunHookPassResult
  | AutomationBeforeRunHookMutateResult
  | AutomationBeforeRunHookShortCircuitResult;

/** 自动化运行后 Hook 的输入。 */
export interface AutomationAfterRunHookPayload {
  context: PluginCallContext;
  automation: AutomationInfo;
  status: string;
  results: JsonValue[];
}

/** 自动化运行后 Hook 透传当前结果。 */
export interface AutomationAfterRunHookPassResult {
  action: 'pass';
}

/** 自动化运行后 Hook 改写当前执行结果。 */
export interface AutomationAfterRunHookMutateResult {
  action: 'mutate';
  status?: string;
  results?: JsonValue[];
}

/** 自动化运行后 Hook 的返回。 */
export type AutomationAfterRunHookResult =
  | AutomationAfterRunHookPassResult
  | AutomationAfterRunHookMutateResult;

/** 最终回复来源。 */
export type PluginResponseSource = 'model' | 'short-circuit';

/** 工具 Hook 看到的来源类型。 */
export type ToolHookSourceKind = 'plugin' | 'mcp' | 'skill';

/** 工具 Hook 看到的工具来源信息。 */
export interface ToolHookSourceInfo {
  kind: ToolHookSourceKind;
  id: string;
  label: string;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
}

/** 工具 Hook 看到的统一工具信息。 */
export interface ToolHookToolInfo extends PluginCapability {
  toolId: string;
  callName: string;
}

/** 工具调用前 Hook 的输入。 */
export interface ToolBeforeCallHookPayload {
  context: PluginCallContext;
  source: ToolHookSourceInfo;
  tool: ToolHookToolInfo;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
  params: JsonObject;
}

/** 工具调用前 Hook 不改写当前请求。 */
export interface ToolBeforeCallHookPassResult {
  action: 'pass';
}

/** 工具调用前 Hook 改写工具参数。 */
export interface ToolBeforeCallHookMutateResult {
  action: 'mutate';
  params?: JsonObject;
}

/** 工具调用前 Hook 直接短路本轮工具调用。 */
export interface ToolBeforeCallHookShortCircuitResult {
  action: 'short-circuit';
  output: JsonValue;
}

/** 工具调用前 Hook 的返回。 */
export type ToolBeforeCallHookResult =
  | ToolBeforeCallHookPassResult
  | ToolBeforeCallHookMutateResult
  | ToolBeforeCallHookShortCircuitResult;

/** 工具调用后 Hook 的输入。 */
export interface ToolAfterCallHookPayload {
  context: PluginCallContext;
  source: ToolHookSourceInfo;
  tool: ToolHookToolInfo;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
  params: JsonObject;
  output: JsonValue;
}

/** 工具调用后 Hook 透传当前结果。 */
export interface ToolAfterCallHookPassResult {
  action: 'pass';
}

/** 工具调用后 Hook 改写当前工具输出。 */
export interface ToolAfterCallHookMutateResult {
  action: 'mutate';
  output?: JsonValue;
}

/** 工具调用后 Hook 的返回。 */
export type ToolAfterCallHookResult =
  | ToolAfterCallHookPassResult
  | ToolAfterCallHookMutateResult;

/** 最终回复发送前 Hook 的输入。 */
export interface ResponseBeforeSendHookPayload {
  context: PluginCallContext;
  responseSource: PluginResponseSource;
  assistantMessageId: string;
  providerId: string;
  modelId: string;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: JsonValue;
  }>;
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    output: JsonValue;
  }>;
}

/** 最终回复发送前 Hook 透传当前结果。 */
export interface ResponseBeforeSendHookPassResult {
  action: 'pass';
}

/** 最终回复发送前 Hook 改写最终回复。 */
export interface ResponseBeforeSendHookMutateResult {
  action: 'mutate';
  providerId?: string;
  modelId?: string;
  assistantContent?: string;
  assistantParts?: ChatMessagePart[] | null;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    input: JsonValue;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    output: JsonValue;
  }>;
}

/** 最终回复发送前 Hook 的返回。 */
export type ResponseBeforeSendHookResult =
  | ResponseBeforeSendHookPassResult
  | ResponseBeforeSendHookMutateResult;

/** 最终回复发送后 Hook 的输入。 */
export interface ResponseAfterSendHookPayload
  extends ResponseBeforeSendHookPayload {
  sentAt: string;
}
