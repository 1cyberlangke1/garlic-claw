import type { ConversationHostServices } from './types/chat';

export const DEFAULT_CONVERSATION_HOST_SERVICES: ConversationHostServices = {
  sessionEnabled: true,
  llmEnabled: true,
  ttsEnabled: true,
};

export function normalizeConversationHostServices(
  raw?: string | null,
): ConversationHostServices {
  if (!raw) {
    return { ...DEFAULT_CONVERSATION_HOST_SERVICES };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConversationHostServices>;
    return {
      sessionEnabled:
        typeof parsed.sessionEnabled === 'boolean'
          ? parsed.sessionEnabled
          : DEFAULT_CONVERSATION_HOST_SERVICES.sessionEnabled,
      llmEnabled:
        typeof parsed.llmEnabled === 'boolean'
          ? parsed.llmEnabled
          : DEFAULT_CONVERSATION_HOST_SERVICES.llmEnabled,
      ttsEnabled:
        typeof parsed.ttsEnabled === 'boolean'
          ? parsed.ttsEnabled
          : DEFAULT_CONVERSATION_HOST_SERVICES.ttsEnabled,
    };
  } catch {
    return { ...DEFAULT_CONVERSATION_HOST_SERVICES };
  }
}

export function mergeConversationHostServices(
  current: ConversationHostServices,
  patch: Partial<ConversationHostServices>,
): ConversationHostServices {
  return {
    ...current,
    ...(typeof patch.sessionEnabled === 'boolean'
      ? { sessionEnabled: patch.sessionEnabled }
      : {}),
    ...(typeof patch.llmEnabled === 'boolean'
      ? { llmEnabled: patch.llmEnabled }
      : {}),
    ...(typeof patch.ttsEnabled === 'boolean'
      ? { ttsEnabled: patch.ttsEnabled }
      : {}),
  };
}
