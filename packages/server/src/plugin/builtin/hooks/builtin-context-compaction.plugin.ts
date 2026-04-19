import { randomUUID } from 'node:crypto';
import {
  asChatBeforeModelPayload,
  asConversationHistoryRewritePayload,
  CONTEXT_COMPACTION_MANIFEST,
  createPassHookResult,
  readContextCompactionConfig,
  resolveContextCompactionRuntimeConfig,
} from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type {
  ChatMessageAnnotation,
  JsonValue,
  PluginConversationHistoryMessage,
  PluginConversationHistoryPreviewResult,
  PluginLlmMessage,
  PluginRouteResponse,
} from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

const CONTEXT_COMPACTION_ANNOTATION_TYPE = 'context-compaction';
const CONTEXT_COMPACTION_OWNER = 'builtin.context-compaction';
const CONTEXT_COMPACTION_VERSION = '1';
const AUTO_STOP_REPLY = '已完成上下文压缩，本轮不继续生成主回复。';
const AUTO_STOP_STATE_KEY = 'context-compaction:auto-stop';
const CONTEXT_COMPACTION_COMMAND = '/compact';
const CONTEXT_COMPACTION_COMMAND_ALIAS = '/compress';
const CONTEXT_COMPACTION_COMMAND_MODEL = 'context-compaction-command';
const CONTEXT_COMPACTION_COMMAND_PROVIDER = 'system';

type CompactionTrigger = 'manual' | 'prepare-model';

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

type ContextCompactionCoveredData = {
  role: 'covered';
  compactionId: string;
  summaryMessageId: string;
  markerVisible: boolean;
  coveredAt: string;
};

type ContextCompactionRuntimeConfig = Awaited<
  ReturnType<typeof readContextCompactionRuntimeConfigFromHost>
>;

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

export const BUILTIN_CONTEXT_COMPACTION_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: CONTEXT_COMPACTION_MANIFEST,
  hooks: {
    'message:received': async (payload, context) => {
      const commandInput = readContextCompactionCommandInput(payload);
      if (!commandInput) {
        return createPassHookResult();
      }
      if (commandInput.hasUnexpectedArgs) {
        return {
          action: 'short-circuit',
          assistantContent: formatContextCompactionCommandReply(null, true),
          assistantParts: [
            {
              text: formatContextCompactionCommandReply(null, true),
              type: 'text',
            },
          ],
          modelId: CONTEXT_COMPACTION_COMMAND_MODEL,
          providerId: CONTEXT_COMPACTION_COMMAND_PROVIDER,
          reason: 'context-compaction:command',
        };
      }
      const history = await context.host.getConversationHistory();
      const runtimeConfig = await readContextCompactionRuntimeConfigFromHost(context.host.getConfig());
      const result = await runContextCompaction({
        conversationId: history.conversationId,
        history,
        host: context.host,
        modelId: context.callContext.activeModelId ?? undefined,
        providerId: context.callContext.activeProviderId ?? undefined,
        runtimeConfig,
        trigger: 'manual',
      });
      const assistantContent = formatContextCompactionCommandReply(result, false);
      return {
        action: 'short-circuit',
        assistantContent,
        assistantParts: [
          {
            text: assistantContent,
            type: 'text',
          },
        ],
        modelId: CONTEXT_COMPACTION_COMMAND_MODEL,
        providerId: CONTEXT_COMPACTION_COMMAND_PROVIDER,
        reason: 'context-compaction:command',
      };
    },
    'conversation:history-rewrite': async (payload, context) => {
      const hookPayload = asConversationHistoryRewritePayload(payload);
      const runtimeConfig = await readContextCompactionRuntimeConfigFromHost(context.host.getConfig());
      if (!runtimeConfig.enabled || runtimeConfig.mode !== 'auto') {
        return createPassHookResult();
      }
      const result = await runContextCompaction({
        conversationId: hookPayload.conversationId,
        history: hookPayload.history,
        host: context.host,
        modelId: context.callContext.activeModelId ?? undefined,
        providerId: context.callContext.activeProviderId ?? undefined,
        runtimeConfig,
        trigger: hookPayload.trigger,
      });
      if (result.compacted && !runtimeConfig.allowAutoContinue) {
        await context.host.setState(
          AUTO_STOP_STATE_KEY,
          {
            active: true,
            conversationId: hookPayload.conversationId,
          },
          { scope: 'conversation' },
        );
      }
      return createPassHookResult();
    },
    'chat:before-model': async (payload, context) => {
      const hookPayload = asChatBeforeModelPayload(payload);
      const stopState = await readAutoStopState(
        context.host.getState(AUTO_STOP_STATE_KEY, { scope: 'conversation' }),
        context.callContext.conversationId ?? null,
      );
      if (stopState) {
        await context.host.deleteState(AUTO_STOP_STATE_KEY, { scope: 'conversation' });
        return {
          action: 'short-circuit',
          assistantContent: AUTO_STOP_REPLY,
          modelId: hookPayload.request.modelId,
          providerId: hookPayload.request.providerId,
          reason: 'context-compaction:auto-stop',
        };
      }

      const history = await context.host.getConversationHistory();
      const effectiveMessages = buildEffectiveConversationHistory(history.messages, {
        omitTrailingPendingAssistant: true,
      });
      if (effectiveMessages.length === history.messages.length) {
        return createPassHookResult();
      }
      const historyMessageCount = history.messages.length;
      const prefixCount = Math.max(
        hookPayload.request.messages.length - historyMessageCount,
        0,
      );
      const prefixMessages = hookPayload.request.messages.slice(0, prefixCount);
      return {
        action: 'mutate',
        messages: [
          ...prefixMessages,
          ...effectiveMessages.map(toPluginLlmMessage),
        ],
      } as unknown as JsonValue;
    },
  },
  routes: {
    'context-compaction/run': async (request, context) => {
      if (request.method !== 'POST') {
        return {
          status: 405,
          body: toJsonValue({
            error: 'Method Not Allowed',
          }),
        } satisfies PluginRouteResponse;
      }
      const conversationId = readBodyString(request.body, 'conversationId')
        ?? context.callContext.conversationId
        ?? null;
      if (!conversationId) {
        return {
          status: 400,
          body: toJsonValue({
            error: 'conversationId is required',
          }),
        } satisfies PluginRouteResponse;
      }
      const runtimeConfig = await readContextCompactionRuntimeConfigFromHost(context.host.getConfig());
      const history = await context.host.getConversationHistory();
      const result = await runContextCompaction({
        conversationId,
        history,
        host: context.host,
        modelId: readBodyString(request.body, 'modelId') ?? undefined,
        providerId: readBodyString(request.body, 'providerId') ?? undefined,
        runtimeConfig,
        trigger: 'manual',
      });
      return {
        status: 200,
        body: toJsonValue(result),
      };
    },
  },
};

async function readContextCompactionRuntimeConfigFromHost(
  configPromise: Promise<JsonValue>,
) {
  return resolveContextCompactionRuntimeConfig(
    readContextCompactionConfig(await configPromise),
  );
}

async function runContextCompaction(input: {
  conversationId: string;
  history: {
    conversationId: string;
    revision: string;
    messages: PluginConversationHistoryMessage[];
  };
  host: PluginHostFacadeMethods;
  modelId?: string;
  providerId?: string;
  runtimeConfig: ContextCompactionRuntimeConfig;
  trigger: CompactionTrigger;
}): Promise<ContextCompactionRunResult> {
  if (!input.runtimeConfig.enabled) {
    return {
      compacted: false,
      reason: 'disabled',
    };
  }

  const effectiveMessages = buildEffectiveConversationHistory(input.history.messages, {
    omitTrailingPendingAssistant: input.trigger === 'prepare-model',
  });
  const beforePreview = await input.host.previewConversationHistory({
    messages: effectiveMessages,
  });
  const target = await resolveCompactionTarget({
    host: input.host,
    modelId: input.modelId,
    providerId: input.providerId,
  });
  const availableContext = Math.max(target.contextLength - input.runtimeConfig.reservedTokens, 256);
  const thresholdTokens = Math.max(
    1,
    Math.floor((availableContext * input.runtimeConfig.compressionThreshold) / 100),
  );
  if (input.trigger === 'prepare-model' && beforePreview.estimatedTokens < thresholdTokens) {
    return {
      compacted: false,
      reason: 'threshold-not-reached',
      thresholdTokens,
      beforePreview,
    };
  }

  const keepRecentMessages = Math.min(
    input.runtimeConfig.keepRecentMessages,
    effectiveMessages.length,
  );
  const candidateMessages = effectiveMessages.slice(
    0,
    Math.max(0, effectiveMessages.length - keepRecentMessages),
  );
  const summarySource = buildSummarySource(candidateMessages);
  if (!summarySource || candidateMessages.length === 0) {
    return {
      compacted: false,
      reason: 'not-enough-history',
      beforePreview,
    };
  }

  const summaryText = sanitizeSummaryText(
    (
      await input.host.generateText({
        modelId: target.modelId,
        providerId: target.providerId,
        prompt: buildSummaryPrompt(input.runtimeConfig.summaryPrompt, summarySource),
        transportMode: 'generate',
      })
    ).text,
  );
  if (!summaryText) {
    return {
      compacted: false,
      reason: 'empty-summary',
      beforePreview,
    };
  }

  const compactionId = randomUUID();
  const summaryMessageId = `context-compaction:${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const coveredMessageIds = new Set(candidateMessages.map((message) => message.id));
  const summaryIndex = readSummaryInsertIndex(input.history.messages, coveredMessageIds);
  if (summaryIndex < 0) {
    return {
      compacted: false,
      reason: 'invalid-history',
      beforePreview,
    };
  }

  const predictedMessages = applyContextCompaction({
    createdAt,
    historyMessages: input.history.messages,
    input,
    summaryMessageId,
    compactionId,
    coveredMessageIds,
    summaryIndex,
    summaryText,
  });
  const afterPreview = await input.host.previewConversationHistory({
    messages: buildEffectiveConversationHistory(predictedMessages, {
      omitTrailingPendingAssistant: input.trigger === 'prepare-model',
    }),
  });
  const nextMessages = finalizeContextCompactionMessages(
    predictedMessages,
    summaryMessageId,
    compactionId,
    createdAt,
    input.runtimeConfig.showCoveredMarker,
    input.trigger,
    beforePreview,
    afterPreview,
    target.providerId,
    target.modelId,
  );

  const replaced = await input.host.replaceConversationHistory({
    expectedRevision: input.history.revision,
    messages: nextMessages,
  });
  return {
    afterPreview,
    beforePreview,
    compacted: true,
    coveredMessageCount: coveredMessageIds.size,
    revision: replaced.revision,
    summaryMessageId,
  };
}

async function resolveCompactionTarget(input: {
  host: PluginHostFacadeMethods;
  providerId?: string;
  modelId?: string;
}) {
  const current = await input.host.getCurrentProvider();
  const providerId = input.providerId ?? current.providerId;
  const modelId = input.modelId ?? current.modelId;
  const model = await input.host.getProviderModel(providerId, modelId);
  return {
    contextLength: model.contextLength,
    modelId,
    providerId,
  };
}

function buildEffectiveConversationHistory(
  messages: PluginConversationHistoryMessage[],
  options: {
    omitTrailingPendingAssistant?: boolean;
  } = {},
): PluginConversationHistoryMessage[] {
  const activeSummaryIds = new Set(
    messages
      .map((message) => readContextCompactionSummaryAnnotation(message))
      .flatMap((annotation) =>
        annotation ? [annotation.compactionId] : [],
      ),
  );
  const filteredMessages = messages.filter((message) => {
    const coveredAnnotations = readContextCompactionCoveredAnnotations(message);
    if (
      coveredAnnotations.some((annotation) =>
        activeSummaryIds.has(annotation.data.compactionId),
      )
    ) {
      return false;
    }
    return true;
  });
  return options.omitTrailingPendingAssistant
    ? stripTrailingPendingAssistant(filteredMessages)
    : filteredMessages;
}

function buildSummarySource(messages: PluginConversationHistoryMessage[]): string {
  return messages
    .map((message) => {
      const content = readMessageText(message);
      return content ? `${mapRoleLabel(message.role)}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildSummaryPrompt(summaryPrompt: string, source: string): string {
  return [summaryPrompt, '', '历史对话：', source].join('\n');
}

function sanitizeSummaryText(value: string): string {
  return value.trim();
}

function readMessageText(message: PluginConversationHistoryMessage): string {
  const partText = (message.parts ?? [])
    .filter((part: PluginConversationHistoryMessage['parts'][number]): part is Extract<PluginConversationHistoryMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part: Extract<PluginConversationHistoryMessage['parts'][number], { type: 'text' }>) => part.text)
    .join('\n');
  return (partText || message.content || '').trim();
}

function mapRoleLabel(role: string): string {
  if (role === 'assistant') {
    return '助手';
  }
  if (role === 'system') {
    return '系统';
  }
  return '用户';
}

function stripTrailingPendingAssistant(
  messages: PluginConversationHistoryMessage[],
): PluginConversationHistoryMessage[] {
  const lastMessage = messages.at(-1);
  if (!lastMessage || !isTransientPendingAssistant(lastMessage)) {
    return messages;
  }
  return messages.slice(0, -1);
}

function readSummaryInsertIndex(
  messages: PluginConversationHistoryMessage[],
  coveredMessageIds: ReadonlySet<string>,
): number {
  let summaryIndex = -1;
  messages.forEach((message, index) => {
    if (coveredMessageIds.has(message.id)) {
      summaryIndex = index + 1;
    }
  });
  return summaryIndex;
}

function isTransientPendingAssistant(
  message: PluginConversationHistoryMessage,
): boolean {
  return message.role === 'assistant'
    && message.status === 'pending'
    && readMessageText(message).length === 0
    && !(message.toolCalls?.length)
    && !(message.toolResults?.length);
}

function applyContextCompaction(input: {
  createdAt: string;
  historyMessages: PluginConversationHistoryMessage[];
  input: {
    runtimeConfig: ContextCompactionRuntimeConfig;
  };
  summaryMessageId: string;
  compactionId: string;
  coveredMessageIds: ReadonlySet<string>;
  summaryIndex: number;
  summaryText: string;
}): PluginConversationHistoryMessage[] {
  const nextMessages = input.historyMessages.map((message) =>
    input.coveredMessageIds.has(message.id)
      ? appendContextCompactionCoveredAnnotation(
          message,
          input.compactionId,
          input.summaryMessageId,
          input.createdAt,
          input.input.runtimeConfig.showCoveredMarker,
        )
      : message,
  );
  nextMessages.splice(input.summaryIndex, 0, {
    content: input.summaryText,
    createdAt: input.createdAt,
    id: input.summaryMessageId,
    metadata: {
      annotations: [
        {
          data: toJsonValue({
            compactionId: input.compactionId,
            role: 'summary',
          }),
          owner: CONTEXT_COMPACTION_OWNER,
          type: CONTEXT_COMPACTION_ANNOTATION_TYPE,
          version: CONTEXT_COMPACTION_VERSION,
        },
      ],
    },
    model: null,
    parts: [
      {
        text: input.summaryText,
        type: 'text',
      },
    ],
    provider: null,
    role: 'assistant',
    status: 'completed',
    updatedAt: input.createdAt,
  });
  return nextMessages;
}

function finalizeContextCompactionMessages(
  messages: PluginConversationHistoryMessage[],
  summaryMessageId: string,
  compactionId: string,
  createdAt: string,
  showCoveredMarker: boolean,
  trigger: CompactionTrigger,
  beforePreview: PluginConversationHistoryPreviewResult,
  afterPreview: PluginConversationHistoryPreviewResult,
  providerId: string,
  modelId: string,
): PluginConversationHistoryMessage[] {
  return messages.map((message): PluginConversationHistoryMessage => {
    if (message.id !== summaryMessageId) {
      return message;
    }
    const summaryAnnotation: ChatMessageAnnotation = {
      data: toJsonValue({
        afterPreview,
        beforePreview,
        compactionId,
        coveredCount: readContextCompactionCoveredCount(messages, compactionId),
        createdAt,
        modelId,
        providerId,
        role: 'summary',
        trigger,
      } satisfies ContextCompactionSummaryData),
      owner: CONTEXT_COMPACTION_OWNER,
      type: CONTEXT_COMPACTION_ANNOTATION_TYPE,
      version: CONTEXT_COMPACTION_VERSION,
    };
    return {
      ...message,
      metadata: {
        ...(message.metadata ?? {}),
        annotations: [summaryAnnotation],
      },
      model: modelId,
      provider: providerId,
    };
  }).map((message) =>
    message.id === summaryMessageId
      ? message
      : normalizeCoveredMarker(message, showCoveredMarker),
  );
}

function readContextCompactionCoveredCount(
  messages: PluginConversationHistoryMessage[],
  compactionId: string,
): number {
  return messages.filter((message) =>
    readContextCompactionCoveredAnnotations(message).some(
      (annotation: { data: ContextCompactionCoveredData }) => annotation.data.compactionId === compactionId,
    ),
  ).length;
}

function appendContextCompactionCoveredAnnotation(
  message: PluginConversationHistoryMessage,
  compactionId: string,
  summaryMessageId: string,
  coveredAt: string,
  markerVisible: boolean,
): PluginConversationHistoryMessage {
  const annotations = message.metadata?.annotations ?? [];
  const nextAnnotation: ChatMessageAnnotation = {
    data: toJsonValue({
      compactionId,
      coveredAt,
      markerVisible,
      role: 'covered',
      summaryMessageId,
    } satisfies ContextCompactionCoveredData),
    owner: CONTEXT_COMPACTION_OWNER,
    type: CONTEXT_COMPACTION_ANNOTATION_TYPE,
    version: CONTEXT_COMPACTION_VERSION,
  };
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      annotations: [
        ...annotations.filter(
          (annotation) =>
            annotation.type !== CONTEXT_COMPACTION_ANNOTATION_TYPE
            || annotation.owner !== CONTEXT_COMPACTION_OWNER,
        ),
        nextAnnotation,
      ],
    },
  };
}

function normalizeCoveredMarker(
  message: PluginConversationHistoryMessage,
  markerVisible: boolean,
): PluginConversationHistoryMessage {
  const coveredAnnotations = readContextCompactionCoveredAnnotations(message);
  if (coveredAnnotations.length === 0) {
    return message;
  }
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      annotations: (message.metadata?.annotations ?? []).map((annotation: ChatMessageAnnotation) =>
        annotation.type === CONTEXT_COMPACTION_ANNOTATION_TYPE
        && annotation.owner === CONTEXT_COMPACTION_OWNER
        && isContextCompactionCoveredData(annotation.data)
          ? {
              ...annotation,
              data: toJsonValue({
                ...annotation.data,
                markerVisible,
              }),
            }
          : annotation,
      ),
    },
  };
}

function readContextCompactionSummaryAnnotation(
  message: PluginConversationHistoryMessage,
): { compactionId: string } | null {
  const annotation = (message.metadata?.annotations ?? []).find(
    (entry: ChatMessageAnnotation) =>
      entry.type === CONTEXT_COMPACTION_ANNOTATION_TYPE
      && entry.owner === CONTEXT_COMPACTION_OWNER
      && isContextCompactionSummaryMarker(entry.data),
  );
  return annotation
    ? { compactionId: (annotation.data as { compactionId: string }).compactionId }
    : null;
}

function readContextCompactionCoveredAnnotations(
  message: PluginConversationHistoryMessage,
): Array<{ data: ContextCompactionCoveredData }> {
  return (message.metadata?.annotations ?? [])
    .filter(
      (entry: ChatMessageAnnotation) =>
        entry.type === CONTEXT_COMPACTION_ANNOTATION_TYPE
        && entry.owner === CONTEXT_COMPACTION_OWNER
        && isContextCompactionCoveredData(entry.data),
    )
    .map((entry: ChatMessageAnnotation) => ({
      data: entry.data as ContextCompactionCoveredData,
    }));
}

function isContextCompactionSummaryMarker(
  value: unknown,
): value is { compactionId: string; role: 'summary' } {
  return isRecord(value)
    && value.role === 'summary'
    && typeof value.compactionId === 'string';
}

function isContextCompactionCoveredData(value: unknown): value is ContextCompactionCoveredData {
  return isRecord(value)
    && value.role === 'covered'
    && typeof value.compactionId === 'string'
    && typeof value.summaryMessageId === 'string'
    && typeof value.coveredAt === 'string'
    && typeof value.markerVisible === 'boolean';
}

function toPluginLlmMessage(message: PluginConversationHistoryMessage): PluginLlmMessage {
  return {
    content: message.parts?.length
      ? message.parts
      : message.content ?? '',
    role: message.role === 'assistant' ? 'assistant' : 'user',
  };
}

async function readAutoStopState(
  statePromise: Promise<JsonValue>,
  conversationId: string | null,
): Promise<boolean> {
  if (!conversationId) {
    return false;
  }
  const state = await statePromise;
  return isRecord(state) && state.active === true && state.conversationId === conversationId;
}

function readBodyString(body: JsonValue | null, key: string): string | null {
  if (!isRecord(body)) {
    return null;
  }
  return typeof body[key] === 'string' && body[key].trim()
    ? body[key].trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue<T>(value: T): JsonValue {
  return value as unknown as JsonValue;
}

function readContextCompactionCommandInput(payload: JsonValue): {
  hasUnexpectedArgs: boolean;
} | null {
  if (!isRecord(payload) || !isRecord(payload.message)) {
    return null;
  }
  const messageParts = Array.isArray(payload.message.parts)
    ? payload.message.parts
    : [];
  if (messageParts.some((part) => isRecord(part) && part.type !== 'text')) {
    return null;
  }
  const messageContent = typeof payload.message.content === 'string'
    ? payload.message.content.trim()
    : '';
  if (!messageContent) {
    return null;
  }

  if (messageContent === CONTEXT_COMPACTION_COMMAND || messageContent === CONTEXT_COMPACTION_COMMAND_ALIAS) {
    return {
      hasUnexpectedArgs: false,
    };
  }

  if (
    messageContent.startsWith(`${CONTEXT_COMPACTION_COMMAND} `)
    || messageContent.startsWith(`${CONTEXT_COMPACTION_COMMAND_ALIAS} `)
  ) {
    return {
      hasUnexpectedArgs: true,
    };
  }

  return null;
}

function formatContextCompactionCommandReply(
  result: ContextCompactionRunResult | null,
  hasUnexpectedArgs: boolean,
): string {
  if (hasUnexpectedArgs) {
    return [
      '上下文压缩命令不接受额外参数。',
      `可用命令：${CONTEXT_COMPACTION_COMMAND} 或 ${CONTEXT_COMPACTION_COMMAND_ALIAS}`,
    ].join('\n');
  }

  if (!result) {
    return '本次未执行上下文压缩。';
  }

  if (result.compacted) {
    const coveredCount = result.coveredMessageCount ?? 0;
    return coveredCount > 0
      ? `已压缩上下文，覆盖 ${coveredCount} 条历史消息。`
      : '已完成上下文压缩。';
  }

  return readContextCompactionResultLabel(result.reason);
}

function readContextCompactionResultLabel(reason?: string): string {
  if (reason === 'disabled') {
    return '当前压缩插件已关闭。';
  }
  if (reason === 'threshold-not-reached') {
    return '当前上下文还未达到自动压缩阈值。';
  }
  if (reason === 'not-enough-history') {
    return '当前历史还不足以生成稳定摘要。';
  }
  if (reason === 'empty-summary') {
    return '压缩模型没有返回有效摘要。';
  }
  if (reason === 'invalid-history') {
    return '当前历史结构异常，暂时无法压缩。';
  }
  return '本次未执行上下文压缩。';
}
