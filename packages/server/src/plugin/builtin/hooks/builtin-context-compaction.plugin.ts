import { randomUUID } from 'node:crypto';
import { asChatBeforeModelPayload, asConversationHistoryRewritePayload, CONTEXT_COMPACTION_MANIFEST, createPassHookResult, readContextCompactionConfig, resolveContextCompactionRuntimeConfig } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { ChatMessageAnnotation, JsonValue, PluginCallContext, PluginConversationHistoryMessage, PluginConversationHistoryPreviewResult, PluginRouteResponse } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

const CONTEXT_COMPACTION_ANNOTATION_TYPE = 'context-compaction';
const CONTEXT_COMPACTION_OWNER = 'builtin.context-compaction';
const CONTEXT_COMPACTION_VERSION = '1';
const AUTO_STOP_REPLY = '已完成上下文压缩，本轮不继续生成主回复。';
const AUTO_STOP_STATE_KEY = 'context-compaction:auto-stop';
const CONTEXT_COMPACTION_COMMAND = '/compact';
const CONTEXT_COMPACTION_COMMAND_ALIAS = '/compress';
const CONTEXT_COMPACTION_COMMANDS = [CONTEXT_COMPACTION_COMMAND, CONTEXT_COMPACTION_COMMAND_ALIAS] as const;
const CONTEXT_COMPACTION_COMMAND_MODEL = 'context-compaction-command';
const CONTEXT_COMPACTION_COMMAND_PROVIDER = 'system';
const CONTEXT_COMPACTION_REASON_LABELS: Readonly<Record<string, string>> = {
  disabled: '当前压缩插件已关闭。',
  'empty-summary': '压缩模型没有返回有效摘要。',
  'invalid-history': '当前历史结构异常，暂时无法压缩。',
  'not-enough-history': '当前历史还不足以生成稳定摘要。',
  'threshold-not-reached': '当前上下文还未达到自动压缩阈值。',
};
const CONTEXT_COMPACTION_ROLE_LABELS: Partial<Record<PluginConversationHistoryMessage['role'], string>> = { assistant: '助手', system: '系统' };

type CompactionTrigger = 'manual' | 'prepare-model';
type ContextCompactionHistorySnapshot = { revision: string; messages: PluginConversationHistoryMessage[] };
type ContextCompactionCommandInput = { hasUnexpectedArgs: boolean } | null;
type ContextCompactionRuntimeConfig = Awaited<ReturnType<typeof readContextCompactionRuntimeConfigFromHost>>;
type ContextCompactionSummaryMarker = { role: 'summary'; compactionId: string };
type ContextCompactionSummaryData = {
  role: 'summary';
  compactionId: string;
  trigger: CompactionTrigger;
  coveredCount: number;
  providerId: string;
  modelId: string;
  createdAt: string;
  beforePreview: PluginConversationHistoryPreviewResult;
  afterPreview: PluginConversationHistoryPreviewResult;
};
type ContextCompactionCoveredData = { role: 'covered'; compactionId: string; summaryMessageId: string; markerVisible: boolean; coveredAt: string };
type ContextCompactionAnnotationData = ContextCompactionCoveredData | ContextCompactionSummaryData | ContextCompactionSummaryMarker;
type ContextCompactionRunResult = {
  compacted: boolean;
  reason?: string;
  thresholdTokens?: number;
  beforePreview?: PluginConversationHistoryPreviewResult;
  afterPreview?: PluginConversationHistoryPreviewResult;
  coveredMessageCount?: number;
  revision?: string;
  summaryMessageId?: string;
};
type ContextCompactionMessageState = { message: PluginConversationHistoryMessage; covered: ContextCompactionCoveredData[]; summaryId: string | null };
type ContextCompactionCallInput = {
  callContext: PluginCallContext;
  history: ContextCompactionHistorySnapshot;
  host: PluginHostFacadeMethods;
  modelId?: string;
  providerId?: string;
  runtimeConfig?: ContextCompactionRuntimeConfig;
  trigger: CompactionTrigger;
};

class ContextCompactionHistoryState {
  readonly messages: PluginConversationHistoryMessage[];
  readonly messageStates: ContextCompactionMessageState[];
  readonly visibleMessages: PluginConversationHistoryMessage[];
  readonly modelMessages: PluginConversationHistoryMessage[];

  constructor(messages: PluginConversationHistoryMessage[], omitTrailingPendingAssistant = false) {
    this.messages = messages;
    this.messageStates = messages.map((message) => ({ message, ...readContextCompactionAnnotationState(message) }));
    const activeSummaryIds = new Set(this.messageStates.flatMap(({ summaryId }) => summaryId ? [summaryId] : []));
    const visibleStates = this.messageStates.filter(({ covered }) => !covered.some(({ compactionId }) => activeSummaryIds.has(compactionId)));
    const lastVisibleState = visibleStates.at(-1);
    const settledStates = omitTrailingPendingAssistant && lastVisibleState && isTransientPendingAssistant(lastVisibleState.message)
      ? visibleStates.slice(0, -1)
      : visibleStates;
    this.visibleMessages = settledStates.map(({ message }) => message);
    this.modelMessages = settledStates.flatMap(({ message, summaryId }) => readContextCompactionModelMessages(message, summaryId));
  }

  readSummaryInsertIndex(coveredMessageIds: ReadonlySet<string>): number {
    return this.messageStates.reduce((summaryIndex, { message }, index) => coveredMessageIds.has(message.id) ? index + 1 : summaryIndex, -1);
  }

  readCoveredCount(compactionId: string): number {
    return this.messageStates.filter(({ covered }) => covered.some((annotation) => annotation.compactionId === compactionId)).length;
  }
}

export const BUILTIN_CONTEXT_COMPACTION_PLUGIN: BuiltinPluginDefinition = {
  governance: { builtinRole: 'system-optional', canDisable: true, defaultEnabled: true },
  manifest: CONTEXT_COMPACTION_MANIFEST,
  hooks: {
    'message:received': async (payload, context) => {
      const commandInput = readContextCompactionCommandInput(payload);
      if (!commandInput) {return createPassHookResult();}
      if (commandInput.hasUnexpectedArgs) {
        return createContextCompactionCommandShortCircuit(formatContextCompactionCommandReply(null, true));
      }
      return createContextCompactionCommandShortCircuit(formatContextCompactionCommandReply(await runContextCompactionForCall({
        callContext: context.callContext,
        history: await context.host.getConversationHistory(),
        host: context.host,
        trigger: 'manual',
      }), false));
    },
    'conversation:history-rewrite': async (payload, context) => {
      const hookPayload = asConversationHistoryRewritePayload(payload);
      const runtimeConfig = await readContextCompactionRuntimeConfigFromHost(context.host.getConfig());
      if (!runtimeConfig.enabled || runtimeConfig.mode !== 'auto') {return createPassHookResult();}
      const result = await runContextCompactionForCall({
        callContext: context.callContext,
        history: hookPayload.history,
        host: context.host,
        runtimeConfig,
        trigger: hookPayload.trigger,
      });
      if (result.compacted && !runtimeConfig.allowAutoContinue) {
        await context.host.setState(AUTO_STOP_STATE_KEY, { active: true, conversationId: hookPayload.conversationId }, { scope: 'conversation' });
      }
      return createPassHookResult();
    },
    'chat:before-model': async (payload, context) => {
      const hookPayload = asChatBeforeModelPayload(payload);
      if (await readContextCompactionAutoStopState(context.host, context.callContext.conversationId ?? null)) {
        await context.host.deleteState(AUTO_STOP_STATE_KEY, { scope: 'conversation' });
        return { action: 'short-circuit', assistantContent: AUTO_STOP_REPLY, modelId: hookPayload.request.modelId, providerId: hookPayload.request.providerId, reason: 'context-compaction:auto-stop' };
      }
      const historyState = new ContextCompactionHistoryState((await context.host.getConversationHistory()).messages, true);
      if (historyState.visibleMessages.length === historyState.messages.length) {return createPassHookResult();}
      const prefixCount = Math.max(hookPayload.request.messages.length - historyState.messages.length, 0);
      return {
        action: 'mutate',
        messages: [
          ...hookPayload.request.messages.slice(0, prefixCount),
          ...historyState.modelMessages.map((message) => ({
            content: message.parts?.length ? message.parts : message.content ?? '',
            role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
          })),
        ],
      } as unknown as JsonValue;
    },
  },
  routes: {
    'context-compaction/run': async (request, context) => {
      if (request.method !== 'POST') {
        return { body: toJsonValue({ error: 'Method Not Allowed' }), status: 405 } satisfies PluginRouteResponse;
      }
      const conversationId = readBodyString(request.body, 'conversationId') ?? context.callContext.conversationId ?? null;
      if (!conversationId) {
        return { body: toJsonValue({ error: 'conversationId is required' }), status: 400 } satisfies PluginRouteResponse;
      }
      return {
        status: 200,
        body: toJsonValue(await runContextCompactionForCall({
          callContext: context.callContext,
          history: await context.host.getConversationHistory(),
          host: context.host,
          modelId: readBodyString(request.body, 'modelId') ?? undefined,
          providerId: readBodyString(request.body, 'providerId') ?? undefined,
          trigger: 'manual',
        })),
      };
    },
  },
};

async function readContextCompactionRuntimeConfigFromHost(configPromise: Promise<JsonValue>) {
  return resolveContextCompactionRuntimeConfig(readContextCompactionConfig(await configPromise));
}

async function readContextCompactionAutoStopState(host: PluginHostFacadeMethods, conversationId: string | null): Promise<boolean> {
  if (!conversationId) {return false;}
  const state = await host.getState(AUTO_STOP_STATE_KEY, { scope: 'conversation' });
  return isRecord(state) && state.active === true && state.conversationId === conversationId;
}

async function runContextCompactionForCall(input: ContextCompactionCallInput): Promise<ContextCompactionRunResult> {
  const runtimeConfig = input.runtimeConfig ?? await readContextCompactionRuntimeConfigFromHost(input.host.getConfig());
  return runContextCompaction({
    history: input.history,
    host: input.host,
    modelId: input.modelId ?? input.callContext.activeModelId ?? undefined,
    providerId: input.providerId ?? input.callContext.activeProviderId ?? undefined,
    runtimeConfig,
    trigger: input.trigger,
  });
}

async function runContextCompaction(input: {
  history: ContextCompactionHistorySnapshot;
  host: PluginHostFacadeMethods;
  modelId?: string;
  providerId?: string;
  runtimeConfig: ContextCompactionRuntimeConfig;
  trigger: CompactionTrigger;
}): Promise<ContextCompactionRunResult> {
  if (!input.runtimeConfig.enabled) {return { compacted: false, reason: 'disabled' };}
  const omitTrailingPendingAssistant = input.trigger === 'prepare-model';
  const beforeState = new ContextCompactionHistoryState(input.history.messages, omitTrailingPendingAssistant);
  const beforePreview = await input.host.previewConversationHistory({ messages: beforeState.modelMessages });
  const { modelId, providerId, thresholdTokens } = await readContextCompactionTarget(input);
  if (input.trigger === 'prepare-model' && beforePreview.estimatedTokens < thresholdTokens) {
    return { beforePreview, compacted: false, reason: 'threshold-not-reached', thresholdTokens };
  }
  const keepRecentMessages = Math.min(input.runtimeConfig.keepRecentMessages, beforeState.visibleMessages.length);
  const candidateMessages = beforeState.visibleMessages.slice(0, Math.max(0, beforeState.visibleMessages.length - keepRecentMessages));
  const summarySource = buildSummarySource(candidateMessages);
  if (!candidateMessages.length || !summarySource) {return { beforePreview, compacted: false, reason: 'not-enough-history' };}

  const summaryText = (await input.host.generateText({
    modelId,
    providerId,
    prompt: [input.runtimeConfig.summaryPrompt, '', '历史对话：', summarySource].join('\n'),
    transportMode: 'generate',
  })).text.trim();
  if (!summaryText) {return { beforePreview, compacted: false, reason: 'empty-summary' };}

  const compactionId = randomUUID();
  const summaryMessageId = `context-compaction:${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const coveredMessageIds = new Set(candidateMessages.map((message) => message.id));
  const summaryIndex = beforeState.readSummaryInsertIndex(coveredMessageIds);
  if (summaryIndex < 0) {return { beforePreview, compacted: false, reason: 'invalid-history' };}

  const predictedMessages = applyContextCompaction({
    compactionId,
    coveredMessageIds,
    createdAt,
    historyMessages: input.history.messages,
    markerVisible: input.runtimeConfig.showCoveredMarker,
    summaryIndex,
    summaryMessageId,
    summaryText,
  });
  const afterState = new ContextCompactionHistoryState(predictedMessages, omitTrailingPendingAssistant);
  const afterPreview = await input.host.previewConversationHistory({ messages: afterState.modelMessages });
  const nextMessages = finalizeContextCompactionMessages({
    afterPreview,
    beforePreview,
    compactionId,
    coveredCount: afterState.readCoveredCount(compactionId),
    createdAt,
    messages: predictedMessages,
    modelId,
    providerId,
    showCoveredMarker: input.runtimeConfig.showCoveredMarker,
    summaryMessageId,
    trigger: input.trigger,
  });
  const replaced = await input.host.replaceConversationHistory({ expectedRevision: input.history.revision, messages: nextMessages });
  return { afterPreview, beforePreview, compacted: true, coveredMessageCount: coveredMessageIds.size, revision: replaced.revision, summaryMessageId };
}

async function readContextCompactionTarget(input: {
  host: PluginHostFacadeMethods;
  modelId?: string;
  providerId?: string;
  runtimeConfig: ContextCompactionRuntimeConfig;
}) {
  const current = await input.host.getCurrentProvider();
  const providerId = input.providerId ?? current.providerId;
  const modelId = input.modelId ?? current.modelId;
  const model = await input.host.getProviderModel(providerId, modelId);
  const availableContext = Math.max(model.contextLength - input.runtimeConfig.reservedTokens, 256);
  return { modelId, providerId, thresholdTokens: Math.max(1, Math.floor((availableContext * input.runtimeConfig.compressionThreshold) / 100)) };
}

function applyContextCompaction(input: {
  compactionId: string;
  coveredMessageIds: ReadonlySet<string>;
  createdAt: string;
  historyMessages: PluginConversationHistoryMessage[];
  markerVisible: boolean;
  summaryIndex: number;
  summaryMessageId: string;
  summaryText: string;
}): PluginConversationHistoryMessage[] {
  const nextMessages = input.historyMessages.map((message) =>
    input.coveredMessageIds.has(message.id)
      ? writeContextCompactionCoveredAnnotation(message, {
          compactionId: input.compactionId,
          coveredAt: input.createdAt,
          markerVisible: input.markerVisible,
          role: 'covered',
          summaryMessageId: input.summaryMessageId,
        })
      : message);
  nextMessages.splice(input.summaryIndex, 0, createContextCompactionSummaryMessage(input));
  return nextMessages;
}

function finalizeContextCompactionMessages(input: {
  afterPreview: PluginConversationHistoryPreviewResult;
  beforePreview: PluginConversationHistoryPreviewResult;
  compactionId: string;
  coveredCount: number;
  createdAt: string;
  messages: PluginConversationHistoryMessage[];
  modelId: string;
  providerId: string;
  showCoveredMarker: boolean;
  summaryMessageId: string;
  trigger: CompactionTrigger;
}): PluginConversationHistoryMessage[] {
  const summaryAnnotation = createContextCompactionAnnotation({
    afterPreview: input.afterPreview,
    beforePreview: input.beforePreview,
    compactionId: input.compactionId,
    coveredCount: input.coveredCount,
    createdAt: input.createdAt,
    modelId: input.modelId,
    providerId: input.providerId,
    role: 'summary',
    trigger: input.trigger,
  } satisfies ContextCompactionSummaryData);
  return input.messages.map((message) => message.id === input.summaryMessageId
    ? { ...message, metadata: { ...(message.metadata ?? {}), annotations: [summaryAnnotation] }, model: input.modelId, provider: input.providerId }
    : syncContextCompactionCoveredMarker(message, input.showCoveredMarker));
}

function createContextCompactionSummaryMessage(input: {
  compactionId: string;
  createdAt: string;
  summaryMessageId: string;
  summaryText: string;
}): PluginConversationHistoryMessage {
  return {
    content: input.summaryText,
    createdAt: input.createdAt,
    id: input.summaryMessageId,
    metadata: { annotations: [createContextCompactionAnnotation({ compactionId: input.compactionId, role: 'summary' })] },
    model: null,
    parts: [{ text: input.summaryText, type: 'text' }],
    provider: null,
    role: 'display',
    status: 'completed',
    updatedAt: input.createdAt,
  };
}

function writeContextCompactionCoveredAnnotation(message: PluginConversationHistoryMessage, data: ContextCompactionCoveredData): PluginConversationHistoryMessage {
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      annotations: [
        ...(message.metadata?.annotations ?? []).filter((annotation) => !isContextCompactionOwnedAnnotation(annotation)),
        createContextCompactionAnnotation(data),
      ],
    },
  };
}

function syncContextCompactionCoveredMarker(message: PluginConversationHistoryMessage, markerVisible: boolean): PluginConversationHistoryMessage {
  let hasCoveredMarker = false;
  const nextAnnotations = (message.metadata?.annotations ?? []).map((annotation) => {
    if (!(isContextCompactionOwnedAnnotation(annotation) && isContextCompactionCoveredData(annotation.data))) {return annotation;}
    hasCoveredMarker = true;
    return { ...annotation, data: toJsonValue({ ...annotation.data, markerVisible }) };
  });
  return hasCoveredMarker ? { ...message, metadata: { ...(message.metadata ?? {}), annotations: nextAnnotations } } : message;
}

function readContextCompactionAnnotationState(message: PluginConversationHistoryMessage): { covered: ContextCompactionCoveredData[]; summaryId: string | null } {
  const covered: ContextCompactionCoveredData[] = [];
  let summaryId: string | null = null;
  for (const annotation of message.metadata?.annotations ?? []) {
    if (!isContextCompactionOwnedAnnotation(annotation)) {continue;}
    if (summaryId === null && isContextCompactionSummaryMarker(annotation.data)) {
      summaryId = annotation.data.compactionId;
      continue;
    }
    if (isContextCompactionCoveredData(annotation.data)) {covered.push(annotation.data);}
  }
  return { covered, summaryId };
}

function buildSummarySource(messages: PluginConversationHistoryMessage[]): string {
  return messages.map((message) => {
    const content = readMessageText(message);
    return content ? `${CONTEXT_COMPACTION_ROLE_LABELS[message.role] ?? '用户'}: ${content}` : '';
  }).filter(Boolean).join('\n');
}

function readContextCompactionModelMessages(
  message: PluginConversationHistoryMessage,
  summaryId: string | null,
): PluginConversationHistoryMessage[] {
  if (message.role === 'display') {return summaryId ? [{ ...message, role: 'assistant' }] : [];}
  return message.role === 'assistant' || message.role === 'user' || message.role === 'system' ? [message] : [];
}

function readMessageText(message: PluginConversationHistoryMessage): string {
  const partText = (message.parts ?? [])
    .filter((part: PluginConversationHistoryMessage['parts'][number]): part is Extract<PluginConversationHistoryMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part: Extract<PluginConversationHistoryMessage['parts'][number], { type: 'text' }>) => part.text)
    .join('\n');
  return (partText || message.content || '').trim();
}

function isTransientPendingAssistant(message: PluginConversationHistoryMessage): boolean {
  return message.role === 'assistant' && message.status === 'pending' && readMessageText(message).length === 0 && !(message.toolCalls?.length) && !(message.toolResults?.length);
}

function createContextCompactionAnnotation(data: ContextCompactionAnnotationData): ChatMessageAnnotation {
  return { data: toJsonValue(data), owner: CONTEXT_COMPACTION_OWNER, type: CONTEXT_COMPACTION_ANNOTATION_TYPE, version: CONTEXT_COMPACTION_VERSION };
}

function isContextCompactionOwnedAnnotation(annotation: ChatMessageAnnotation): boolean {
  return annotation.type === CONTEXT_COMPACTION_ANNOTATION_TYPE && annotation.owner === CONTEXT_COMPACTION_OWNER;
}

function isContextCompactionSummaryMarker(value: unknown): value is ContextCompactionSummaryMarker {
  return isRecord(value) && value.role === 'summary' && typeof value.compactionId === 'string';
}

function isContextCompactionCoveredData(value: unknown): value is ContextCompactionCoveredData {
  return isRecord(value) && value.role === 'covered' && typeof value.compactionId === 'string' && typeof value.summaryMessageId === 'string' && typeof value.coveredAt === 'string' && typeof value.markerVisible === 'boolean';
}

function readBodyString(body: JsonValue | null, key: string): string | null {
  return isRecord(body) && typeof body[key] === 'string' && body[key].trim() ? body[key].trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue<T>(value: T): JsonValue {
  return value as unknown as JsonValue;
}

function readContextCompactionCommandInput(payload: JsonValue): ContextCompactionCommandInput {
  if (!isRecord(payload) || !isRecord(payload.message)) {return null;}
  if ((Array.isArray(payload.message.parts) ? payload.message.parts : []).some((part) => isRecord(part) && part.type !== 'text')) {return null;}
  const messageContent = typeof payload.message.content === 'string' ? payload.message.content.trim() : '';
  if (!messageContent) {return null;}
  if (CONTEXT_COMPACTION_COMMANDS.includes(messageContent as typeof CONTEXT_COMPACTION_COMMANDS[number])) {
    return { hasUnexpectedArgs: false };
  }
  return CONTEXT_COMPACTION_COMMANDS.some((command) => messageContent.startsWith(`${command} `)) ? { hasUnexpectedArgs: true } : null;
}

function formatContextCompactionCommandReply(result: ContextCompactionRunResult | null, hasUnexpectedArgs: boolean): string {
  if (hasUnexpectedArgs) {
    return ['上下文压缩命令不接受额外参数。', `可用命令：${CONTEXT_COMPACTION_COMMAND} 或 ${CONTEXT_COMPACTION_COMMAND_ALIAS}`].join('\n');
  }
  if (!result) {return '本次未执行上下文压缩。';}
  if (result.compacted) {return result.coveredMessageCount ? `已压缩上下文，覆盖 ${result.coveredMessageCount} 条历史消息。` : '已完成上下文压缩。';}
  return CONTEXT_COMPACTION_REASON_LABELS[result.reason ?? ''] ?? '本次未执行上下文压缩。';
}

function createContextCompactionCommandShortCircuit(assistantContent: string) {
  return {
    action: 'short-circuit' as const,
    assistantContent,
    assistantParts: [{ text: assistantContent, type: 'text' as const }],
    modelId: CONTEXT_COMPACTION_COMMAND_MODEL,
    providerId: CONTEXT_COMPACTION_COMMAND_PROVIDER,
    reason: 'context-compaction:command',
  };
}
