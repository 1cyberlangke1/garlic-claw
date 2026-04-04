import { Injectable } from '@nestjs/common';
import type {
  ChatMessagePart,
  PluginCallContext,
  PluginMessageSendInfo,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
} from '@garlic-claw/shared';
import { ChatMessageGenerationService } from './chat-message-generation.service';
import { ChatMessageMutationService } from './chat-message-mutation.service';
import { type RetryMessageDto, type SendMessageDto, type UpdateMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatMessageService {
  constructor(
    private readonly generationService: ChatMessageGenerationService,
    private readonly mutationService: ChatMessageMutationService,
  ) {}

  /** 创建一轮新的用户消息与 assistant 生成任务，输出已落库的用户消息与 assistant 占位消息。 */
  async startMessageGeneration(userId: string, conversationId: string, dto: SendMessageDto) {
    return this.generationService.startMessageGeneration(userId, conversationId, dto);
  }

  /** 主动停止指定 assistant 消息的后台生成任务，并返回最新消息状态。 */
  async stopMessageGeneration(userId: string, conversationId: string, messageId: string) {
    return this.generationService.stopMessageGeneration(userId, conversationId, messageId);
  }

  /** 原地重试最后一条 assistant 回复，可选覆盖 provider/model。 */
  async retryMessageGeneration(userId: string, conversationId: string, messageId: string, dto: RetryMessageDto) {
    return this.generationService.retryMessageGeneration(userId, conversationId, messageId, dto);
  }

  /** 更新一条已存在的消息，不会自动触发重跑。 */
  async updateMessage(userId: string, conversationId: string, messageId: string, dto: UpdateMessageDto) {
    return this.mutationService.updateMessage(userId, conversationId, messageId, dto);
  }

  /** 删除一条消息，不会自动删除其后的消息。 */
  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    return this.mutationService.deleteMessage(userId, conversationId, messageId);
  }

  /** 供插件读取当前消息目标摘要；当前实现映射为当前会话。 */
  async getCurrentPluginMessageTarget(input: {
    context: PluginCallContext;
  }): Promise<PluginMessageTargetInfo | null> {
    return this.mutationService.getCurrentPluginMessageTarget(input);
  }

  /** 供插件向当前或指定单用户消息目标发送一条 assistant 消息。 */
  async sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginMessageSendInfo> {
    return this.mutationService.sendPluginMessage(input);
  }
}
