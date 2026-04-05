import { deserializeMessageParts } from './chat-message-parts';
import type {
  PluginCallContext,
} from './types/plugin';
import type {
  ChatBeforeModelRequest,
  MessageReceivedHookPayload,
  PluginLlmMessage,
} from './types/plugin-ai';
import type {
  MessageCreatedHookPayload,
  PluginMessageHookInfo,
} from './types/plugin-chat';

export function createChatLifecycleContext(input: {
  source?: PluginCallContext['source'];
  userId?: string;
  conversationId: string;
  activeProviderId?: string;
  activeModelId?: string;
  activePersonaId?: string;
}): PluginCallContext {
  return {
    source: input.source ?? 'chat-hook',
    ...(input.userId ? { userId: input.userId } : {}),
    conversationId: input.conversationId,
    ...(input.activeProviderId ? { activeProviderId: input.activeProviderId } : {}),
    ...(input.activeModelId ? { activeModelId: input.activeModelId } : {}),
    ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}),
  };
}

export function createChatModelLifecycleContext(input: {
  source?: PluginCallContext['source'];
  userId?: string;
  conversationId: string;
  activePersonaId?: string;
  modelConfig?: { providerId?: string | null; id?: string | null };
}): PluginCallContext {
  return createChatLifecycleContext({
    source: input.source,
    userId: input.userId,
    conversationId: input.conversationId,
    ...(input.modelConfig?.providerId
      ? { activeProviderId: input.modelConfig.providerId }
      : {}),
    ...(input.modelConfig?.id ? { activeModelId: input.modelConfig.id } : {}),
    ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}),
  });
}

export function mergeChatSystemPrompts(
  basePrompt: string,
  appendedPrompt: string,
): string {
  if (!appendedPrompt.trim()) {
    return basePrompt;
  }

  return basePrompt.trim()
    ? `${basePrompt}\n\n${appendedPrompt}`
    : appendedPrompt;
}

export function filterChatAvailableTools(
  availableTools: ChatBeforeModelRequest['availableTools'],
  allowedToolNames: string[] | null,
  deniedToolNames: string[],
): ChatBeforeModelRequest['availableTools'] {
  const allowedSet = allowedToolNames ? new Set(allowedToolNames) : null;
  const deniedSet = new Set(deniedToolNames);

  return availableTools.filter((tool) => {
    if (deniedSet.has(tool.name)) {
      return false;
    }
    if (allowedSet && !allowedSet.has(tool.name)) {
      return false;
    }
    return true;
  });
}

export function createPluginMessageHookInfo(input: {
  id?: string;
  role: PluginMessageHookInfo['role'];
  content: PluginMessageHookInfo['content'];
  parts: PluginMessageHookInfo['parts'];
  provider?: PluginMessageHookInfo['provider'];
  model?: PluginMessageHookInfo['model'];
  status?: PluginMessageHookInfo['status'] | null;
}): PluginMessageHookInfo {
  return {
    ...(input.id ? { id: input.id } : {}),
    role: input.role,
    content: input.content,
    parts: input.parts,
    ...(typeof input.provider !== 'undefined' ? { provider: input.provider } : {}),
    ...(typeof input.model !== 'undefined' ? { model: input.model } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
}

export function createPluginMessageHookInfoFromRecord(input: {
  id: string;
  role: string;
  content: string | null;
  partsJson?: string | null;
  provider?: string | null;
  model?: string | null;
  status?: string | null;
}): PluginMessageHookInfo {
  return createPluginMessageHookInfo({
    id: input.id,
    role: input.role,
    content: input.content,
    parts: deserializeMessageParts(input.partsJson),
    ...(typeof input.provider !== 'undefined' ? { provider: input.provider } : {}),
    ...(typeof input.model !== 'undefined' ? { model: input.model } : {}),
    ...(input.status ? { status: input.status as PluginMessageHookInfo['status'] } : {}),
  });
}

export function createMessageReceivedHookPayload(input: {
  context: PluginCallContext;
  conversationId: string;
  providerId: string;
  modelId: string;
  message: {
    role: PluginMessageHookInfo['role'];
    content: PluginMessageHookInfo['content'];
    parts: PluginMessageHookInfo['parts'];
  };
  modelMessages: PluginLlmMessage[];
}): MessageReceivedHookPayload {
  return {
    context: input.context,
    conversationId: input.conversationId,
    providerId: input.providerId,
    modelId: input.modelId,
    message: createPluginMessageHookInfo(input.message),
    modelMessages: input.modelMessages,
  };
}

export function createMessageCreatedHookPayload(input: {
  context: PluginCallContext;
  conversationId: string;
  message: {
    id?: string;
    role: PluginMessageHookInfo['role'];
    content: PluginMessageHookInfo['content'];
    parts: PluginMessageHookInfo['parts'];
    provider?: PluginMessageHookInfo['provider'];
    model?: PluginMessageHookInfo['model'];
    status?: PluginMessageHookInfo['status'] | null;
  };
  modelMessages: PluginLlmMessage[];
}): MessageCreatedHookPayload {
  return {
    context: input.context,
    conversationId: input.conversationId,
    message: createPluginMessageHookInfo(input.message),
    modelMessages: input.modelMessages,
  };
}
