import { Injectable } from '@nestjs/common';
import type { ChatMessagePart } from '@garlic-claw/shared';
import { PrismaService } from '../prisma/prisma.service';
import { touchConversationTimestamp } from './chat-message-common.helpers';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import { normalizeAssistantMessageOutput, serializeMessageParts } from './message-parts';

type MessageRecordWithMetadata = { id: string; metadataJson?: string | null } & Record<string, unknown>;

interface ChatMessageMetadataValue {
  visionFallback?: { state: 'transcribing' | 'completed'; entries: ChatVisionFallbackMetadataEntry[] };
}

interface ChatVisionFallbackMetadataEntry { text: string; source: 'cache' | 'generated' }

@Injectable()
export class ChatMessageCompletionService {
  constructor(private readonly prisma: PrismaService, private readonly orchestration: ChatMessageOrchestrationService) {}

  async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    providerId: string;
    modelId: string;
    activePersonaId: string;
    assistantContent: string;
    assistantParts?: ChatMessagePart[];
  }) {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.assistantContent,
      parts: input.assistantParts,
    });
    const assistantMessage = await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: normalizedAssistant.content,
        partsJson: normalizedAssistant.parts.length
          ? serializeMessageParts(normalizedAssistant.parts)
          : null,
        provider: input.providerId,
        model: input.modelId,
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await touchConversationTimestamp(this.prisma, input.conversationId);
    const finalResult = await this.orchestration.applyFinalResponseHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: input.assistantMessageId,
        conversationId: input.conversationId,
        providerId: input.providerId,
        modelId: input.modelId,
        content: normalizedAssistant.content,
        parts: normalizedAssistant.parts,
        toolCalls: [],
        toolResults: [],
      },
    });

    const serializedFinalParts = finalResult.parts.length
      ? serializeMessageParts(finalResult.parts)
      : null;
    const finalAssistantMessage = finalResult.content === assistantMessage.content
      && serializedFinalParts === ((assistantMessage as { partsJson?: string | null }).partsJson ?? null)
      && finalResult.providerId === assistantMessage.provider
      && finalResult.modelId === assistantMessage.model
      ? assistantMessage
      : await this.prisma.message.update({
        where: { id: input.assistantMessageId },
        data: {
          content: finalResult.content,
          partsJson: serializedFinalParts,
          provider: finalResult.providerId,
          model: finalResult.modelId,
          status: 'completed',
          error: null,
          toolCalls: finalResult.toolCalls.length
            ? JSON.stringify(finalResult.toolCalls)
            : null,
          toolResults: finalResult.toolResults.length
            ? JSON.stringify(finalResult.toolResults)
            : null,
        },
      });
    await touchConversationTimestamp(this.prisma, input.conversationId);
    await this.orchestration.runResponseAfterSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: finalResult,
    });
    return finalAssistantMessage;
  }

  async applyVisionFallbackMetadata(input: {
    userMessage: MessageRecordWithMetadata;
    assistantMessage: MessageRecordWithMetadata;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }) {
    const metadataJson = await this.persistVisionFallbackMetadata(
      [input.userMessage.id, input.assistantMessage.id],
      input.visionFallbackEntries,
    );
    if (!metadataJson) {
      return input;
    }

    return {
      userMessage: {
        ...input.userMessage,
        metadataJson,
      },
      assistantMessage: {
        ...input.assistantMessage,
        metadataJson,
      },
    };
  }

  async applyVisionFallbackMetadataToAssistant(input: {
    assistantMessage: MessageRecordWithMetadata;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }) {
    const metadataJson = await this.persistVisionFallbackMetadata(
      [input.assistantMessage.id],
      input.visionFallbackEntries,
    );
    if (!metadataJson) {
      return input.assistantMessage;
    }

    return {
      ...input.assistantMessage,
      metadataJson,
    };
  }

  private async persistVisionFallbackMetadata(
    messageIds: readonly string[],
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[],
  ): Promise<string | null> {
    if (visionFallbackEntries.length === 0) {
      return null;
    }

    const metadataJson = serializeChatMessageMetadata({
      visionFallback: {
        state: 'completed',
        entries: visionFallbackEntries,
      },
    });
    if (messageIds.length === 1) {
      await this.prisma.message.update({
        where: {
          id: messageIds[0],
        },
        data: {
          metadataJson,
        },
      });
    } else {
      await this.prisma.message.updateMany({
        where: {
          id: {
            in: [...messageIds],
          },
        },
        data: {
          metadataJson,
        },
      });
    }

    return metadataJson;
  }
}

function serializeChatMessageMetadata(metadata: ChatMessageMetadataValue): string { return JSON.stringify(metadata); }
