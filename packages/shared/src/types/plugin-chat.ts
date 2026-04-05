import type { ChatMessagePart, ChatMessageStatus } from './chat';
import type { JsonValue } from './json';
import type { PluginCallContext } from './plugin';
import type { PluginLlmMessage } from './plugin-ai';

/** 插件可见的会话创建摘要。 */
export interface PluginConversationHookInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 插件可见的消息快照。 */
export interface PluginMessageHookInfo {
  id?: string;
  role: string;
  content: string | null;
  parts: ChatMessagePart[];
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus;
}

/** 当前宿主支持的单用户消息目标类型。 */
export type PluginMessageTargetType = 'conversation';

/** 插件可引用的消息目标。 */
export interface PluginMessageTargetRef {
  type: PluginMessageTargetType;
  id: string;
}

/** 插件可见的消息目标摘要。 */
export interface PluginMessageTargetInfo extends PluginMessageTargetRef {
  label?: string;
}

/** 插件主动发送一条消息的参数。 */
export interface PluginMessageSendParams {
  target?: PluginMessageTargetRef | null;
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  provider?: string | null;
  model?: string | null;
}

/** 插件主动发送后的消息摘要。 */
export interface PluginMessageSendInfo {
  id: string;
  target: PluginMessageTargetInfo;
  role: 'assistant';
  content: string;
  parts: ChatMessagePart[];
  provider?: string | null;
  model?: string | null;
  status: ChatMessageStatus;
  createdAt: string;
  updatedAt: string;
}

/** 插件启动会话等待态的参数。 */
export interface PluginConversationSessionStartParams {
  timeoutMs: number;
  captureHistory?: boolean;
  metadata?: JsonValue;
}

/** 插件续期当前会话等待态的参数。 */
export interface PluginConversationSessionKeepParams {
  timeoutMs: number;
  resetTimeout?: boolean;
}

/** 插件可见的当前会话等待态摘要。 */
export interface PluginConversationSessionInfo {
  pluginId: string;
  conversationId: string;
  timeoutMs: number;
  startedAt: string;
  expiresAt: string;
  lastMatchedAt: string | null;
  captureHistory: boolean;
  historyMessages: PluginMessageHookInfo[];
  metadata?: JsonValue;
}

/** 会话创建 Hook 的输入。 */
export interface ConversationCreatedHookPayload {
  context: PluginCallContext;
  conversation: PluginConversationHookInfo;
}

/** 消息创建 Hook 的输入。 */
export interface MessageCreatedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  message: PluginMessageHookInfo;
  modelMessages: PluginLlmMessage[];
}

/** 消息更新 Hook 的输入。 */
export interface MessageUpdatedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  messageId: string;
  currentMessage: PluginMessageHookInfo;
  nextMessage: PluginMessageHookInfo;
}

/** 消息删除 Hook 的输入。 */
export interface MessageDeletedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  messageId: string;
  message: PluginMessageHookInfo;
}

/** 消息生命周期 Hook 不做改写。 */
export interface MessageLifecycleHookPassResult {
  action: 'pass';
}

/** 消息创建 Hook 改写消息草稿。 */
export interface MessageCreatedHookMutateResult {
  action: 'mutate';
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  modelMessages?: PluginLlmMessage[] | null;
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus | null;
}

/** 消息更新 Hook 改写待写入的新消息快照。 */
export interface MessageUpdatedHookMutateResult {
  action: 'mutate';
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus | null;
}

/** 消息创建 Hook 的返回。 */
export type MessageCreatedHookResult =
  | MessageLifecycleHookPassResult
  | MessageCreatedHookMutateResult;

/** 消息更新 Hook 的返回。 */
export type MessageUpdatedHookResult =
  | MessageLifecycleHookPassResult
  | MessageUpdatedHookMutateResult;
