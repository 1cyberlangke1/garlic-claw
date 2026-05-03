import type { ChatMessageMetadata } from '@garlic-claw/shared';
import type { ConversationResponseSource } from './conversation-message-planning.service';

export const AUTO_COMPACTION_CONTINUE_TEXT = 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.';

export type ConversationCompactionContinuationState = {
  hasAssistantTextOutput: boolean;
  hasToolActivity: boolean;
};

export function createAutoCompactionContinuationMetadata(): ChatMessageMetadata {
  return {
    annotations: [
      {
        data: {
          role: 'continue',
          synthetic: true,
          trigger: 'after-response',
        },
        owner: 'conversation.context-governance',
        type: 'context-compaction',
        version: '1',
      },
    ],
  };
}

export function shouldAutoContinueAfterCompaction(input: {
  continuationState: ConversationCompactionContinuationState;
  responseSource: ConversationResponseSource;
}): boolean {
  return input.responseSource === 'model'
    && input.continuationState.hasToolActivity
    && !input.continuationState.hasAssistantTextOutput;
}
