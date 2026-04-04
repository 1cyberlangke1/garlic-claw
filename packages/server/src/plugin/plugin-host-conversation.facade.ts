import {
  buildConversationMessageSummaries,
  toConversationSummary,
  toMemorySummary,
  toUserSummary,
  type PluginCallContext,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { KbService } from '../kb/kb.service';
import { MemoryService } from '../memory/memory.service';
import { PersonaService } from '../persona/persona.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  readHostNumber,
  readHostString,
  requireHostConversationId,
  requireHostString,
  requireHostUserId,
} from './plugin-host-request.codec';

export function requireHostConversationRecord(input: {
  conversation: {
    id: string;
    title: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  context: PluginCallContext;
  method: string;
}) {
  if (!input.conversation) {
    const conversationId = input.context.conversationId ?? 'unknown';
    throw new NotFoundException(`Conversation not found: ${conversationId}`);
  }

  if (
    input.context.userId
    && input.conversation.userId !== input.context.userId
  ) {
    throw new ForbiddenException(`${input.method} 无权访问当前会话`);
  }

  return input.conversation;
}
export function requireHostUserSummary(input: {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  userId: string;
}) {
  if (!input.user) {
    throw new NotFoundException(`User not found: ${input.userId}`);
  }

  return toUserSummary(input.user);
}
/**
 * Host API 的会话与用户上下文面。
 *
 * 输入:
 * - conversation / kb / persona / memory / user 相关请求
 *
 * 输出:
 * - 对话、用户、KB、persona、memory 的统一 JSON 结果
 *
 * 预期行为:
 * - 把会话/用户上下文相关桥接从 `PluginHostService` 主类拆出
 * - 让 Host 主类聚焦方法分发，而不是长期承载宿主数据读取细节
 */
@Injectable()
export class PluginHostConversationFacade {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly kbService: KbService,
    private readonly personaService: PersonaService,
    private readonly prisma: PrismaService,
  ) {}

  async getConversation(
    context: PluginCallContext,
    _params: JsonObject,
  ): Promise<JsonValue> {
    const conversation = await this.requireConversationRecord(
      context,
      'conversation.get',
    );

    return toConversationSummary(conversation);
  }

  async listKbEntries(params: JsonObject): Promise<JsonValue> {
    const limit = readHostNumber(params, 'limit') ?? 20;
    const entries = await this.kbService.listEntries(limit);
    return toJsonValue(entries);
  }

  async searchKbEntries(params: JsonObject): Promise<JsonValue> {
    const query = requireHostString(params, 'query');
    const limit = readHostNumber(params, 'limit') ?? 5;
    const entries = await this.kbService.searchEntries(
      query,
      limit,
    );
    return toJsonValue(entries);
  }

  async getKbEntry(params: JsonObject): Promise<JsonValue> {
    const entryId = requireHostString(params, 'entryId');
    const entry = await this.kbService.getEntry(entryId);
    return toJsonValue(entry);
  }

  async getCurrentPersona(
    context: PluginCallContext,
  ): Promise<JsonValue> {
    const result = await this.personaService.getCurrentPersona({
      conversationId: context.conversationId,
      activePersonaId: context.activePersonaId,
    });

    return toJsonValue(result);
  }

  async listPersonas(): Promise<JsonValue> {
    const personas = await this.personaService.listPersonas();
    return toJsonValue(personas);
  }

  async getPersona(params: JsonObject): Promise<JsonValue> {
    const personaId = requireHostString(params, 'personaId');
    const persona = await this.personaService.getPersona(personaId);
    return toJsonValue(persona);
  }

  async activatePersona(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const conversation = await this.requireConversationRecord(
      context,
      'persona.activate',
    );
    const personaId = requireHostString(params, 'personaId');
    const result = await this.personaService.activateConversationPersona(
      conversation.id,
      personaId,
    );

    return toJsonValue(result);
  }

  async searchMemories(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const userId = requireHostUserId(context, 'memory.search');
    const query = requireHostString(params, 'query');
    const limit = readHostNumber(params, 'limit') ?? 10;
    const memories = await this.memoryService.searchMemories(userId, query, limit);

    return memories.map((memory) => toMemorySummary(memory));
  }

  async saveMemory(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const userId = requireHostUserId(context, 'memory.save');
    const content = requireHostString(params, 'content');
    const category = readHostString(params, 'category') ?? 'general';
    const keywords = readHostString(params, 'keywords');
    const memory = await this.memoryService.saveMemory(
      userId,
      content,
      category,
      keywords ?? undefined,
    );

    return toMemorySummary(memory);
  }

  async setConversationTitle(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const conversation = await this.requireConversationRecord(
      context,
      'conversation.title.set',
    );
    const title = requireHostString(params, 'title').trim();
    if (!title) {
      throw new BadRequestException('title 不能为空');
    }

    const updated = await this.prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        title,
      },
    });

    return toConversationSummary(updated);
  }

  async getUser(context: PluginCallContext): Promise<JsonValue> {
    const userId = requireHostUserId(context, 'user.get');
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return requireHostUserSummary({
      user,
      userId,
    });
  }

  async listConversationMessages(
    context: PluginCallContext,
  ): Promise<JsonValue> {
    const conversationId = requireHostConversationId(
      context,
      'conversation.messages.list',
    );
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        role: true,
        content: true,
        partsJson: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toJsonValue(buildConversationMessageSummaries(messages));
  }

  private async requireConversationRecord(
    context: PluginCallContext,
    method: string,
  ) {
    const conversationId = requireHostConversationId(context, method);
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return requireHostConversationRecord({
      conversation,
      context,
      method,
    });
  }
}
