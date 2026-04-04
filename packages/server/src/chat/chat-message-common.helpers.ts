import { BadRequestException, NotFoundException } from '@nestjs/common';
import { normalizeConversationHostServices } from '@garlic-claw/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ChatService } from './chat.service';

export async function touchConversationTimestamp(
  prisma: Pick<PrismaService, 'conversation'>,
  conversationId: string,
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}

export async function getOwnedConversationMessage(
  chatService: Pick<ChatService, 'getConversation'>,
  userId: string,
  conversationId: string,
  messageId: string,
) {
  const conversation = await chatService.getConversation(userId, conversationId);
  const message = conversation.messages.find((item) => item.id === messageId);
  if (!message) {
    throw new NotFoundException('Message not found');
  }

  return { conversation, message };
}

export function assertConversationLlmEnabled(conversation: { hostServicesJson?: string | null }) {
  const hostServices = normalizeConversationHostServices(
    conversation.hostServicesJson,
  );

  if (!hostServices.sessionEnabled) {
    throw new BadRequestException('当前会话宿主服务已停用');
  }

  if (!hostServices.llmEnabled) {
    throw new BadRequestException('当前会话已关闭 LLM 自动回复');
  }
}
