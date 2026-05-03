import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../auth/http-auth';
import { ConversationMessagePlanningService } from './conversation-message-planning.service';
import { ConversationMessageLifecycleService } from './conversation-message-lifecycle.service';
import { ConversationTaskService } from './conversation-task.service';
import { RuntimeToolPermissionService } from '../execution/runtime/runtime-tool-permission.service';
import { ConversationMessageService } from '../runtime/host/conversation-message.service';
import { ConversationStoreService, serializeConversationMessage, type RuntimeConversationRecord } from '../runtime/host/conversation-store.service';
import { ConversationTodoService } from '../runtime/host/conversation-todo.service';
import { SubagentRunnerService } from '../runtime/host/subagent-runner.service';
import type { ChatMessagePart, JsonObject } from '@garlic-claw/shared';
import {
  ConversationTodoItemDto,
  CreateConversationDto,
  ReplyRuntimePermissionDto,
  RetryMessageDto,
  SendMessageDto,
  UpdateConversationTodoDto,
  UpdateMessageDto,
} from './dto/conversation.dto';

const routeUuidPipe = new ParseUUIDPipe({ version: '7' });

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationMessagePlanningService: ConversationMessagePlanningService,
    private readonly conversationMessageLifecycleService: ConversationMessageLifecycleService,
    private readonly conversationTaskService: ConversationTaskService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
    private readonly conversationMessages: ConversationMessageService,
    private readonly conversationStore: ConversationStoreService,
    private readonly conversationTodos: ConversationTodoService,
    private readonly subagentRunner: SubagentRunnerService,
  ) {}

  private requireOwnedConversation(userId: string, id: string) {
    return this.conversationStore.requireConversation(id, userId);
  }

  @Post('conversations')
  createConversation(@CurrentUser('id') userId: string, @Body() dto: CreateConversationDto) {
    return this.conversationStore.createConversation({ ...dto, userId });
  }

  @Get('conversations')
  listConversations(@CurrentUser('id') userId: string) { return this.conversationStore.listConversations(userId); }

  @Get('conversations/:id')
  getConversation(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) { return this.conversationStore.getConversation(id, userId); }

  @Get('conversations/:id/context-window')
  getConversationContextWindow(
    @CurrentUser('id') userId: string,
    @Param('id', routeUuidPipe) id: string,
    @Query('providerId') providerId?: string,
    @Query('modelId') modelId?: string,
  ) {
    this.requireOwnedConversation(userId, id);
    return this.conversationMessagePlanningService.getContextWindowPreview({ conversationId: id, ...(typeof modelId === 'string' && modelId.trim() ? { modelId: modelId.trim() } : {}), ...(typeof providerId === 'string' && providerId.trim() ? { providerId: providerId.trim() } : {}), userId });
  }

  @Get('sessions/:id/todo')
  getSessionTodo(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) { return this.conversationTodos.readSessionTodo(id, userId); }

  @Delete('conversations/:id')
  async deleteConversation(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    this.requireOwnedConversation(userId, id);
    const conversationTree = this.conversationStore.listConversationTreeRecords(id, userId) as RuntimeConversationRecord[];
    await stopActiveConversationTreeWork(
      conversationTree,
      userId,
      this.conversationTaskService,
      this.subagentRunner,
    );
    return await this.conversationStore.deleteConversation(id, userId);
  }

  @Put('sessions/:id/todo')
  updateSessionTodo(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Body() dto: UpdateConversationTodoDto) { return this.conversationTodos.replaceSessionTodo(id, dto.todos as ConversationTodoItemDto[], userId); }

  @Get('conversations/:id/runtime-permissions/pending')
  listPendingRuntimePermissions(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    this.requireOwnedConversation(userId, id);
    return this.runtimeToolPermissionService.listPendingRequests(id);
  }

  @Post('conversations/:id/runtime-permissions/:requestId/reply')
  replyRuntimePermission(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('requestId') requestId: string, @Body() dto: ReplyRuntimePermissionDto) {
    this.requireOwnedConversation(userId, id);
    return this.runtimeToolPermissionService.reply(id, requestId, dto.decision);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', routeUuidPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const pluginId = conversation.subagent.pluginId;
      await streamSubagentEvents(
        res,
        async () => {
          await this.subagentRunner.sendInputSubagent(pluginId, {
            ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}),
            ...(dto.model ? { activeModelId: dto.model } : {}),
            ...(dto.provider ? { activeProviderId: dto.provider } : {}),
            conversationId: id,
            source: 'http-route',
            userId,
          }, {
            conversationId: id,
            ...(typeof dto.model === 'string' ? { modelId: dto.model } : {}),
            ...(typeof dto.provider === 'string' ? { providerId: dto.provider } : {}),
            messages: [toPluginLlmMessage(dto)],
          });
          const nextConversation = this.conversationStore.requireConversation(id, userId);
          const assistantMessageId = nextConversation.subagent?.activeAssistantMessageId;
          const assistantMessage = assistantMessageId ? nextConversation.messages.find((message) => message.id === assistantMessageId) : null;
          const userMessage = findLastConversationMessage(nextConversation, (message) => message.role === 'user');
          if (!assistantMessage || !userMessage) {
            throw new Error('子代理会话缺少起始消息');
          }
          return {
            assistantMessageId: String(assistantMessage.id),
            startPayload: {
              assistantMessage: serializeConversationMessage(assistantMessage),
              type: 'message-start' as const,
              userMessage: serializeConversationMessage(userMessage),
            },
          };
        },
        async (assistantMessageId) => {
          await this.subagentRunner.waitSubagent(pluginId, { conversationId: id });
          const latestConversation = this.conversationStore.requireConversation(id, userId);
          return readSubagentConversationEvents(latestConversation, assistantMessageId);
        },
      );
      return;
    }
    await streamTaskEvents(res, this.conversationTaskService, async () => {
      const result = await this.conversationMessageLifecycleService.startMessageGeneration(id, toSendMessagePayload(dto), userId);
      return {
        assistantMessageId: String(result.assistantMessage.id),
        startPayload: {
          assistantMessage: result.assistantMessage,
          type: 'message-start' as const,
          userMessage: result.userMessage,
        },
      };
    });
  }

  @Post('conversations/:id/messages/:messageId/retry')
  async retryMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string, @Body() dto: RetryMessageDto, @Res() res: Response) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const pluginId = conversation.subagent.pluginId;
      await streamSubagentEvents(
        res,
        async () => {
          const retriedInput = readRetrySubagentInput(requireConversationMessage(conversation, messageId), conversation, messageId);
          await this.subagentRunner.sendInputSubagent(pluginId, {
            ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}),
            ...(dto.model ? { activeModelId: dto.model } : {}),
            ...(dto.provider ? { activeProviderId: dto.provider } : {}),
            conversationId: id,
            source: 'http-route',
            userId,
          }, {
            conversationId: id,
            ...(typeof dto.model === 'string' ? { modelId: dto.model } : {}),
            ...(typeof dto.provider === 'string' ? { providerId: dto.provider } : {}),
            messages: [retriedInput],
          });
          const nextConversation = this.conversationStore.requireConversation(id, userId);
          const assistantMessageId = nextConversation.subagent?.activeAssistantMessageId;
          const assistantMessage = assistantMessageId ? nextConversation.messages.find((message) => message.id === assistantMessageId) : null;
          const userMessage = findLastConversationMessage(nextConversation, (message) => message.role === 'user');
          if (!assistantMessage || !userMessage) {
            throw new Error('子代理会话缺少重试消息');
          }
          return {
            assistantMessageId: String(assistantMessage.id),
            startPayload: {
              assistantMessage: serializeConversationMessage(assistantMessage),
              type: 'message-start' as const,
              userMessage: serializeConversationMessage(userMessage),
            },
          };
        },
        async (assistantMessageId) => {
          await this.subagentRunner.waitSubagent(pluginId, { conversationId: id });
          const latestConversation = this.conversationStore.requireConversation(id, userId);
          return readSubagentConversationEvents(latestConversation, assistantMessageId);
        },
      );
      return;
    }
    await streamTaskEvents(res, this.conversationTaskService, async () => {
      const assistantMessage = await this.conversationMessageLifecycleService.retryMessageGeneration(id, messageId, dto, userId);
      return {
        assistantMessageId: String(assistantMessage.id),
        startPayload: { assistantMessage, type: 'message-start' as const },
      };
    });
  }

  @Post('conversations/:id/messages/:messageId/stop')
  stopMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const message = requireConversationMessage(conversation, messageId);
      if (message.role !== 'assistant') {
        throw new BadRequestException('Only assistant messages can be stopped');
      }
      if (
        isSubagentStopTargetInActiveContinuationChain(conversation, messageId)
        && (conversation.subagent.status === 'queued' || conversation.subagent.status === 'running')
      ) {
        return this.subagentRunner.interruptSubagent(conversation.subagent.pluginId, id, userId);
      }
      return { message: 'Generation stopped' };
    }
    return this.conversationMessageLifecycleService.stopMessageGeneration(id, messageId, userId);
  }

  @Patch('conversations/:id/messages/:messageId')
  async updateMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string, @Body() dto: UpdateMessageDto) {
    this.requireOwnedConversation(userId, id);
    await this.conversationTaskService.stopTask(messageId);
    return this.conversationMessages.updateMessage(id, messageId, toUpdateMessagePatch(dto), userId);
  }

  @Get('conversations/:id/subagents')
  listConversationSubagents(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    this.requireOwnedConversation(userId, id);
    return this.conversationStore.listChildSubagentConversations(id, userId);
  }

  @Delete('conversations/:id/messages/:messageId')
  async deleteMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string) {
    this.requireOwnedConversation(userId, id);
    await this.conversationTaskService.stopTask(messageId);
    return this.conversationMessages.deleteMessage(id, messageId, userId);
  }
}

async function streamTaskEvents(
  res: Response,
  conversationTaskService: ConversationTaskService,
  startTask: () => Promise<{ assistantMessageId: string; startPayload: object }>,
) {
  let unsubscribe: () => void = () => undefined;
  initSse(res);
  res.on('close', () => unsubscribe());
  try {
    const { assistantMessageId, startPayload } = await startTask();
    writeSse(res, startPayload);
    unsubscribe = conversationTaskService.subscribe(assistantMessageId, (event) => writeSse(res, event));
    await conversationTaskService.waitForTask(assistantMessageId);
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  writeSse(res, '[DONE]', true);
}

async function streamSubagentEvents(
  res: Response,
  startTask: () => Promise<{ assistantMessageId: string; startPayload: object }>,
  finishTask: (assistantMessageId: string) => Promise<object[]>,
) {
  initSse(res);
  try {
    const { assistantMessageId, startPayload } = await startTask();
    writeSse(res, startPayload);
    for (const event of await finishTask(assistantMessageId)) {
      writeSse(res, event);
    }
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  writeSse(res, '[DONE]', true);
}

function initSse(res: Response) {
  for (const [name, value] of [['Content-Type', 'text/event-stream'], ['Cache-Control', 'no-cache'], ['Connection', 'keep-alive'], ['Access-Control-Allow-Origin', '*']] as const) {res.setHeader(name, value);}
  res.flushHeaders();
}

function writeSse(res: Response, payload: object | '[DONE]', end = false) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`data: ${payload === '[DONE]' ? payload : JSON.stringify(payload)}\n\n`);
    if (end) {res.end();}
  }
}

function toSendMessagePayload(dto: SendMessageDto) {
  return {
    ...(typeof dto.content === 'string' ? { content: dto.content } : {}),
    ...(typeof dto.model === 'string' ? { model: dto.model } : {}),
    ...(dto.parts ? { parts: dto.parts as ChatMessagePart[] } : {}),
    ...(typeof dto.provider === 'string' ? { provider: dto.provider } : {}),
  };
}

function toUpdateMessagePatch(dto: UpdateMessageDto) {
  return {
    ...(typeof dto.content === 'string' ? { content: dto.content } : {}),
    ...(dto.parts ? { parts: dto.parts as ChatMessagePart[] } : {}),
  };
}

function toPluginLlmMessage(dto: SendMessageDto) {
  const parts = dto.parts as ChatMessagePart[] | undefined;
  if (parts?.length) {
    return { content: parts, role: 'user' as const };
  }
  return { content: dto.content ?? '', role: 'user' as const };
}

function readRetrySubagentInput(
  message: RuntimeConversationRecord['messages'][number],
  conversation: RuntimeConversationRecord,
  assistantMessageId: string,
) {
  if (message.role !== 'assistant') {
    throw new BadRequestException('Only assistant messages can be retried');
  }
  const assistantIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId);
  if (assistantIndex < 0) {
    throw new Error(`Message not found: ${assistantMessageId}`);
  }
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role !== 'user') {
      continue;
    }
    const parts = Array.isArray(message.parts) ? message.parts as unknown as ChatMessagePart[] : [];
    return parts.length > 0
      ? { content: parts, role: 'user' as const }
      : { content: typeof message.content === 'string' ? message.content : '', role: 'user' as const };
  }
  throw new Error('没有可重试的用户输入');
}

function findLastConversationMessage(
  conversation: RuntimeConversationRecord,
  predicate: (message: RuntimeConversationRecord['messages'][number]) => boolean,
) {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (predicate(message)) {
      return message;
    }
  }
  return null;
}

function readAssistantToolEvents(
  assistantMessageId: string,
  message: RuntimeConversationRecord['messages'][number],
) {
  const events: Array<{
    input?: unknown;
    messageId: string;
    output?: unknown;
    toolCallId: string;
    toolName: string;
    type: 'tool-call' | 'tool-result';
  }> = [];
  for (const toolCall of readToolEntries(message.toolCalls, 'input')) {
    events.push({
      input: toolCall.input,
      messageId: assistantMessageId,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      type: 'tool-call',
    });
  }
  for (const toolResult of readToolEntries(message.toolResults, 'output')) {
    events.push({
      messageId: assistantMessageId,
      output: toolResult.output,
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      type: 'tool-result',
    });
  }
  return events;
}

function readSubagentConversationEvents(
  conversation: RuntimeConversationRecord,
  startedAssistantMessageId: string,
) {
  const startedIndex = conversation.messages.findIndex((message) => message.id === startedAssistantMessageId);
  if (startedIndex < 0) {
    return [];
  }
  const events: object[] = [];
  for (let index = startedIndex; index < conversation.messages.length; index += 1) {
    const message = conversation.messages[index];
    if (message.role !== 'assistant' || typeof message.id !== 'string') {
      continue;
    }
    if (message.id !== startedAssistantMessageId) {
      const userMessage = readPreviousSubagentUserMessage(conversation, index);
      events.push({
        assistantMessage: serializeConversationMessage(message as unknown as JsonObject),
        type: 'message-start' as const,
        ...(userMessage ? { userMessage: serializeConversationMessage(userMessage as unknown as JsonObject) } : {}),
      });
    }
    const status = String(message.status) as 'completed' | 'error' | 'pending' | 'stopped' | 'streaming';
    events.push(...readAssistantToolEvents(message.id, message));
    events.push({
      content: typeof message.content === 'string' ? message.content : '',
      messageId: message.id,
      type: 'message-patch' as const,
    });
    events.push({
      ...(typeof message.error === 'string' ? { error: message.error } : {}),
      messageId: message.id,
      status,
      type: 'status' as const,
    });
    events.push({
      messageId: message.id,
      status,
      type: 'finish' as const,
    });
  }
  return events;
}

function readPreviousSubagentUserMessage(
  conversation: RuntimeConversationRecord,
  assistantIndex: number,
): RuntimeConversationRecord['messages'][number] | null {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role === 'user') {
      return message;
    }
  }
  return null;
}

function isSubagentStopTargetInActiveContinuationChain(
  conversation: RuntimeConversationRecord,
  messageId: string,
): boolean {
  const activeAssistantMessageId = readActiveSubagentAssistantMessageId(conversation);
  if (!activeAssistantMessageId) {
    return false;
  }
  if (activeAssistantMessageId === messageId) {
    return true;
  }
  const activeAssistantIndex = conversation.messages.findIndex((message) => message.id === activeAssistantMessageId);
  if (activeAssistantIndex < 0) {
    return false;
  }
  let cursor = activeAssistantIndex;
  while (cursor > 1) {
    const syntheticContinueUser = conversation.messages[cursor - 1];
    const previousAssistant = conversation.messages[cursor - 2];
    if (
      syntheticContinueUser?.role !== 'user'
      || !isAutoCompactionContinueMessage(syntheticContinueUser)
      || previousAssistant?.role !== 'assistant'
      || typeof previousAssistant.id !== 'string'
    ) {
      return false;
    }
    if (previousAssistant.id === messageId) {
      return true;
    }
    cursor -= 2;
  }
  return false;
}

function readToolEntries(
  value: unknown,
  payloadKey: 'input' | 'output',
): Array<{ input?: unknown; output?: unknown; toolCallId: string; toolName: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const object = entry as Record<string, unknown>;
    if (typeof object.toolCallId !== 'string' || typeof object.toolName !== 'string') {
      return [];
    }
    return [{
      [payloadKey]: object[payloadKey],
      toolCallId: object.toolCallId,
      toolName: object.toolName,
    }];
  });
}

async function stopActiveConversationTreeWork(
  conversations: RuntimeConversationRecord[],
  userId: string,
  conversationTaskService: ConversationTaskService,
  subagentRunner: SubagentRunnerService,
) {
  for (const conversation of conversations) {
    for (const messageId of readActiveConversationTaskMessageIds(conversation)) {
      await conversationTaskService.stopTask(messageId);
    }
    if (
      conversation.kind === 'subagent'
      && conversation.subagent
      && (conversation.subagent.status === 'queued' || conversation.subagent.status === 'running')
    ) {
      await subagentRunner.interruptSubagent(conversation.subagent.pluginId, conversation.id, userId);
    }
  }
}

function readActiveConversationTaskMessageIds(conversation: RuntimeConversationRecord): string[] {
  return conversation.messages.flatMap((message) => (
    (message.role === 'assistant' || message.role === 'display')
      && typeof message.id === 'string'
      && (message.status === 'pending' || message.status === 'streaming')
      ? [message.id]
      : []
  ));
}

function requireConversationMessage(
  conversation: RuntimeConversationRecord,
  messageId: string,
): RuntimeConversationRecord['messages'][number] {
  const message = conversation.messages.find((entry) => entry.id === messageId);
  if (!message) {
    throw new NotFoundException(`Message not found: ${messageId}`);
  }
  return message;
}

function readActiveSubagentAssistantMessageId(conversation: RuntimeConversationRecord): string | null {
  const activeAssistantMessageId = conversation.subagent?.activeAssistantMessageId;
  if (typeof activeAssistantMessageId === 'string' && activeAssistantMessageId.trim()) {
    return activeAssistantMessageId;
  }
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (
      message.role === 'assistant'
      && typeof message.id === 'string'
      && (message.status === 'pending' || message.status === 'streaming')
    ) {
      return message.id;
    }
  }
  return null;
}

function isAutoCompactionContinueMessage(message: RuntimeConversationRecord['messages'][number]): boolean {
  return readMessageAnnotations(message).some((annotation) => (
    annotation.owner === 'conversation.context-governance'
    && annotation.type === 'context-compaction'
    && isRecord(annotation.data)
    && annotation.data.role === 'continue'
    && annotation.data.synthetic === true
    && annotation.data.trigger === 'after-response'
  ));
}

function readMessageAnnotations(message: Record<string, unknown>): Array<Record<string, unknown>> {
  if (isRecord(message.metadata) && Array.isArray(message.metadata.annotations)) {
    return message.metadata.annotations.filter(isRecord);
  }
  if (typeof message.metadataJson !== 'string' || !message.metadataJson.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(message.metadataJson) as unknown;
    return isRecord(parsed) && Array.isArray(parsed.annotations)
      ? parsed.annotations.filter(isRecord)
      : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
