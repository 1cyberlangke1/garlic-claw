import type {
  AiModelUsage,
  ChatMessageAnnotation,
  ChatMessageMetadata,
  JsonObject,
} from '@garlic-claw/shared';

export interface ConversationModelUsageAnnotationData extends AiModelUsage {
  modelId: string;
  providerId: string;
  requestHistorySignature?: string;
  responseHistorySignature?: string;
}

const CONVERSATION_MODEL_USAGE_OWNER = 'conversation.model-usage';
const CONVERSATION_MODEL_USAGE_TYPE = 'model-usage';
const CONVERSATION_MODEL_USAGE_VERSION = '1';

export function appendConversationModelUsageMetadata(
  metadata: ChatMessageMetadata | undefined,
  input: ConversationModelUsageAnnotationData,
): ChatMessageMetadata {
  return {
    ...(metadata ?? {}),
    annotations: [
      ...(metadata?.annotations ?? []).filter(
        (annotation) => !isConversationModelUsageAnnotation(annotation),
      ),
      createConversationModelUsageAnnotation(input),
    ],
  };
}

export function readConversationModelUsageAnnotation(
  metadata: ChatMessageMetadata | undefined,
  target: { modelId: string; providerId: string },
): ConversationModelUsageAnnotationData | null {
  for (let index = (metadata?.annotations ?? []).length - 1; index >= 0; index -= 1) {
    const annotation = metadata?.annotations?.[index];
    if (!annotation || !isConversationModelUsageAnnotation(annotation)) {
      continue;
    }
    const data = annotation.data;
    if (!isConversationModelUsageAnnotationData(data)) {
      continue;
    }
    if (data.modelId === target.modelId && data.providerId === target.providerId) {
      return data;
    }
  }
  return null;
}

function createConversationModelUsageAnnotation(
  data: ConversationModelUsageAnnotationData,
): ChatMessageAnnotation {
  return {
    data: serializeConversationModelUsageAnnotationData(data),
    owner: CONVERSATION_MODEL_USAGE_OWNER,
    type: CONVERSATION_MODEL_USAGE_TYPE,
    version: CONVERSATION_MODEL_USAGE_VERSION,
  };
}

function serializeConversationModelUsageAnnotationData(
  data: ConversationModelUsageAnnotationData,
): JsonObject {
  return {
    ...(data.cachedInputTokens === undefined ? {} : { cachedInputTokens: data.cachedInputTokens }),
    inputTokens: data.inputTokens,
    modelId: data.modelId,
    outputTokens: data.outputTokens,
    providerId: data.providerId,
    ...(data.requestHistorySignature ? { requestHistorySignature: data.requestHistorySignature } : {}),
    ...(data.responseHistorySignature ? { responseHistorySignature: data.responseHistorySignature } : {}),
    source: data.source,
    totalTokens: data.totalTokens,
  };
}

function isConversationModelUsageAnnotation(
  annotation: ChatMessageAnnotation | undefined,
): boolean {
  return Boolean(annotation)
    && annotation?.owner === CONVERSATION_MODEL_USAGE_OWNER
    && annotation.type === CONVERSATION_MODEL_USAGE_TYPE
    && annotation.version === CONVERSATION_MODEL_USAGE_VERSION;
}

function isConversationModelUsageAnnotationData(
  value: unknown,
): value is ConversationModelUsageAnnotationData {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.modelId === 'string'
    && typeof value.providerId === 'string'
    && (value.requestHistorySignature === undefined || typeof value.requestHistorySignature === 'string')
    && (value.responseHistorySignature === undefined || typeof value.responseHistorySignature === 'string')
    && isTokenCount(value.inputTokens)
    && (value.cachedInputTokens === undefined || isTokenCount(value.cachedInputTokens))
    && isTokenCount(value.outputTokens)
    && isTokenCount(value.totalTokens)
    && (value.source === 'provider' || value.source === 'estimated');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
