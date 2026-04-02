import type {
  HostCallPayload,
  PluginCallContext,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { AiManagementService } from '../ai/ai-management.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { ModelRegistryService } from '../ai/registry/model-registry.service';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { KbService } from '../kb/kb.service';
import { MemoryService } from '../memory/memory.service';
import { PersonaService } from '../persona/persona.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildConversationMessageSummaries,
  buildHostGenerateExecutionInput,
  buildCurrentHostProviderInfo,
  buildHostGenerateResult,
  buildHostGenerateTextResult,
  findHostProviderSummaryOrThrow,
  requireHostConversationRecord,
  requireHostUserSummary,
  resolveHostProviderModelSummary,
  readHostGenerateParams,
  readHostEventLevel,
  readHostLlmMessages,
  readHostNumber,
  readHostObject,
  resolveHostUtilityRoleForGeneration,
  readHostString,
  requireHostConversationId,
  requireHostJsonValue,
  requireHostString,
  requireHostUserId,
  toConversationSummary,
  toMemorySummary,
} from './plugin-host.helpers';
import {
  buildPluginScopedStateKey,
  buildPluginScopedStatePrefix,
  resolvePluginScopedStateTarget,
  stripPluginScopedStatePrefix,
} from './plugin-scoped-state.helpers';
import { PluginStateService } from './plugin-state.service';
import { PluginService } from './plugin.service';

/**
 * 插件 Host API 服务。
 *
 * NOTE: 当前保持单文件，因为 Host API 分发表、上下文校验和宿主能力映射仍共享同一套私有解析 helper；
 * 继续减法时会优先外提重复读写与摘要序列化，避免把强耦合的入口语义打散到多处。
 *
 * 输入:
 * - 插件 ID
 * - 调用上下文
 * - Host API 方法名与参数
 *
 * 输出:
 * - JSON 可序列化的 Host API 返回值
 *
 * 预期行为:
 * - 统一校验插件调用上下文
 * - 将宿主能力通过单一入口暴露给内建/远程插件
 * - 不直接把 Nest service 实例暴露给插件
 */
@Injectable()
export class PluginHostService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly kbService: KbService,
    private readonly personaService: PersonaService,
    private readonly prisma: PrismaService,
    private readonly stateService: PluginStateService,
    private readonly pluginService: PluginService,
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly aiProviderService: AiProviderService,
    private readonly aiManagementService: AiManagementService,
    private readonly modelRegistryService: ModelRegistryService,
  ) {}

  /**
   * 执行一次 Host API 调用。
   * @param input 插件 ID、上下文和方法参数
   * @returns JSON 可序列化的调用结果
   */
  async call(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue> {
    switch (input.method) {
      case 'config.get':
        return this.getConfig(input.pluginId, input.params);
      case 'conversation.get':
        return this.getConversation(input.context, input.params);
      case 'kb.list':
        return this.listKbEntries(input.params);
      case 'kb.search':
        return this.searchKbEntries(input.params);
      case 'kb.get':
        return this.getKbEntry(input.params);
      case 'log.list':
        return this.listLogs(input.pluginId, input.params);
      case 'log.write':
        return this.writeLog(input.pluginId, input.params);
      case 'persona.current.get':
        return this.getCurrentPersona(input.context);
      case 'persona.list':
        return this.listPersonas();
      case 'persona.get':
        return this.getPersona(input.params);
      case 'persona.activate':
        return this.activatePersona(input.context, input.params);
      case 'provider.current.get':
        return this.getCurrentProvider(input.context);
      case 'provider.get':
        return this.getProvider(input.params);
      case 'provider.list':
        return this.listProviders();
      case 'provider.model.get':
        return this.getProviderModel(input.params);
      case 'memory.search':
        return this.searchMemories(input.context, input.params);
      case 'memory.save':
        return this.saveMemory(input.context, input.params);
      case 'conversation.title.set':
        return this.setConversationTitle(input.context, input.params);
      case 'llm.generate':
        return this.generate(input.pluginId, input.context, input.params);
      case 'llm.generate-text':
        return this.generateText(input.pluginId, input.context, input.params);
      case 'plugin.self.get':
        return this.getPluginSelf(input.pluginId);
      case 'storage.delete':
        return this.deleteStorage(input.pluginId, input.context, input.params);
      case 'storage.get':
        return this.getStorage(input.pluginId, input.context, input.params);
      case 'storage.list':
        return this.listStorage(input.pluginId, input.context, input.params);
      case 'storage.set':
        return this.setStorage(input.pluginId, input.context, input.params);
      case 'state.delete':
        return this.deleteState(input.pluginId, input.context, input.params);
      case 'state.get':
        return this.getState(input.pluginId, input.context, input.params);
      case 'state.list':
        return this.listState(input.pluginId, input.context, input.params);
      case 'state.set':
        return this.setState(input.pluginId, input.context, input.params);
      case 'user.get':
        return this.getUser(input.context);
      case 'conversation.messages.list':
        return this.listConversationMessages(input.context);
      default:
        throw new BadRequestException(`不支持的 Host API 方法: ${input.method}`);
    }
  }

  /**
   * 读取插件解析后的配置。
   * @param pluginId 插件 ID
   * @param params 可选 key 查询参数
   * @returns 配置对象或单个配置值
   */
  private async getConfig(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const config = await this.pluginService.getResolvedConfig(pluginId);
    const key = readHostString(params, 'key');
    if (!key) {
      return config;
    }

    return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : null;
  }

  /**
   * 读取当前会话摘要。
   * @param context 插件调用上下文
   * @param _params 当前未使用的参数对象
   * @returns 当前会话摘要
   */
  private async getConversation(
    context: PluginCallContext,
    _params: JsonObject,
  ): Promise<JsonValue> {
    const conversation = await this.requireConversationRecord(
      context,
      'conversation.get',
    );

    return toConversationSummary(conversation);
  }

  /**
   * 列出宿主当前可见的 KB 条目摘要。
   * @param params 查询参数
   * @returns KB 摘要列表
   */
  private async listKbEntries(params: JsonObject): Promise<JsonValue> {
    const limit = readHostNumber(params, 'limit') ?? 20;
    const entries = await this.kbService.listEntries(limit);
    return toJsonValue(entries);
  }

  /**
   * 搜索宿主知识库条目。
   * @param params 搜索参数
   * @returns KB 条目详情列表
   */
  private async searchKbEntries(params: JsonObject): Promise<JsonValue> {
    const query = requireHostString(params, 'query');
    const limit = readHostNumber(params, 'limit') ?? 5;
    const entries = await this.kbService.searchEntries(
      query,
      limit,
    );
    return toJsonValue(entries);
  }

  /**
   * 读取单个 KB 条目详情。
   * @param params 查询参数
   * @returns KB 条目详情
   */
  private async getKbEntry(params: JsonObject): Promise<JsonValue> {
    const entryId = requireHostString(params, 'entryId');
    const entry = await this.kbService.getEntry(entryId);
    return toJsonValue(entry);
  }

  /**
   * 读取当前调用可见的 persona 上下文。
   * @param context 插件调用上下文
   * @returns 当前 persona 摘要
   */
  private async getCurrentPersona(
    context: PluginCallContext,
  ): Promise<JsonValue> {
    const result = await this.personaService.getCurrentPersona({
      conversationId: context.conversationId,
      activePersonaId: context.activePersonaId,
    });

    return toJsonValue(result);
  }

  /**
   * 列出宿主当前可用的 persona 摘要。
   * @returns persona 摘要列表
   */
  private async listPersonas(): Promise<JsonValue> {
    const personas = await this.personaService.listPersonas();
    return toJsonValue(personas);
  }

  /**
   * 读取单个 persona 摘要。
   * @param params 查询参数
   * @returns persona 摘要
   */
  private async getPersona(params: JsonObject): Promise<JsonValue> {
    const personaId = requireHostString(params, 'personaId');
    const persona = await this.personaService.getPersona(personaId);
    return toJsonValue(persona);
  }

  /**
   * 为当前会话激活一个 persona。
   * @param context 插件调用上下文
   * @param params 激活参数
   * @returns 激活后的当前 persona 摘要
   */
  private async activatePersona(
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

  /**
   * 读取当前调用可见的 provider/model 上下文。
   * @param context 插件调用上下文
   * @returns 当前 provider/model 摘要
   */
  private getCurrentProvider(context: PluginCallContext): JsonValue {
    return toJsonValue(
      buildCurrentHostProviderInfo(
        context,
        this.aiProviderService.getModelConfig(),
      ),
    );
  }

  /**
   * 列出宿主当前可用的 provider 安全摘要。
   * @returns provider 摘要列表
   */
  private listProviders(): JsonValue {
    return toJsonValue(
      this.aiManagementService
        .listProviders(),
    );
  }

  /**
   * 读取单个 provider 的安全摘要。
   * @param params 查询参数
   * @returns provider 摘要
   */
  private getProvider(params: JsonObject): JsonValue {
    const providerId = requireHostString(params, 'providerId');
    return toJsonValue(
      findHostProviderSummaryOrThrow({
        providers: this.aiManagementService.listProviders(),
        providerId,
        ensureExists: (missingProviderId) => {
          this.aiManagementService.getProvider(missingProviderId);
        },
      }),
    );
  }

  /**
   * 读取单个模型的安全摘要。
   * @param params 查询参数
   * @returns 模型摘要
   */
  private getProviderModel(params: JsonObject): JsonValue {
    const providerId = requireHostString(params, 'providerId');
    const modelId = requireHostString(params, 'modelId');
    const model = resolveHostProviderModelSummary({
      registryModel: this.modelRegistryService.getModel(providerId, modelId) ?? undefined,
      listedModels: this.aiManagementService.listModels(providerId),
      modelId,
    });
    if (!model) {
      throw new NotFoundException(
        `Model "${modelId}" not found for provider "${providerId}"`,
      );
    }

    return toJsonValue(model);
  }

  /**
   * 使用当前用户上下文搜索记忆。
   * @param context 插件调用上下文
   * @param params 搜索参数
   * @returns 命中的记忆摘要列表
   */
  private async searchMemories(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const userId = requireHostUserId(context, 'memory.search');
    const query = requireHostString(params, 'query');
    const limit = readHostNumber(params, 'limit') ?? 10;
    const memories = await this.memoryService.searchMemories(userId, query, limit);

    return memories.map((memory) => toMemorySummary(memory));
  }

  /**
   * 使用当前用户上下文保存记忆。
   * @param context 插件调用上下文
   * @param params 保存参数
   * @returns 新记忆的最小摘要
   */
  private async saveMemory(
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

  /**
   * 更新当前会话标题。
   * @param context 插件调用上下文
   * @param params 标题更新参数
   * @returns 更新后的会话摘要
   */
  private async setConversationTitle(
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

  /**
   * 通过宿主统一入口执行一次文本生成。
   * @param pluginId 调用插件 ID
   * @param context 插件调用上下文
   * @param params 模型选择与提示词参数
   * @returns 生成结果摘要
   */
  private async generateText(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const prompt = requireHostString(params, 'prompt');
    const result = await this.generateCore(
      pluginId,
      context,
      readHostGenerateParams(params, [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ]),
    );

    return buildHostGenerateTextResult(result);
  }

  /**
   * 通过宿主统一入口执行一次结构化生成。
   * @param pluginId 调用插件 ID
   * @param context 插件调用上下文
   * @param params 模型选择与消息参数
   * @returns 生成结果摘要
   */
  private async generate(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    return toJsonValue(
      await this.generateCore(
        pluginId,
        context,
        readHostGenerateParams(params, readHostLlmMessages(params)),
      ),
    );
  }

  /**
   * 读取当前插件自身信息。
   * @param pluginId 插件 ID
   * @returns 插件自身摘要
   */
  private async getPluginSelf(pluginId: string): Promise<JsonValue> {
    return toJsonValue(await this.pluginService.getPluginSelfInfo(pluginId));
  }

  /**
   * 读取插件持久化存储中的单个值。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 命中的 JSON 值；不存在时返回 null
   */
  private async getStorage(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'storage.get',
    });
    const key = requireHostString(params, 'key');
    return this.pluginService.getPluginStorage(
      pluginId,
      buildPluginScopedStateKey(target, key),
    );
  }

  /**
   * 写入插件持久化存储。
   * @param pluginId 插件 ID
   * @param params 写入参数
   * @returns 写入后的 JSON 值
   */
  private async setStorage(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'storage.set',
    });
    const key = requireHostString(params, 'key');
    return this.pluginService.setPluginStorage(
      pluginId,
      buildPluginScopedStateKey(target, key),
      requireHostJsonValue(params, 'value', 'storage.set'),
    );
  }

  /**
   * 删除插件持久化存储中的一个键。
   * @param pluginId 插件 ID
   * @param params 删除参数
   * @returns 是否删除成功
   */
  private async deleteStorage(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'storage.delete',
    });
    const key = requireHostString(params, 'key');
    return this.pluginService.deletePluginStorage(
      pluginId,
      buildPluginScopedStateKey(target, key),
    );
  }

  /**
   * 列出插件持久化存储。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 键值对列表
   */
  private async listStorage(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'storage.list',
    });
    const prefix = buildPluginScopedStatePrefix(
      target,
      readHostString(params, 'prefix'),
    );
    const entries = await this.pluginService.listPluginStorage(pluginId, prefix);

    return entries
      .map((entry) => ({
        key: stripPluginScopedStatePrefix(target, entry.key),
        value: entry.value,
      }))
      .filter((entry): entry is { key: string; value: JsonValue } => entry.key !== null);
  }

  /**
   * 记录一条插件主动写入的宿主事件日志。
   * @param pluginId 插件 ID
   * @param params 日志参数
   * @returns 是否记录成功
   */
  private async writeLog(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const level = readHostEventLevel(params, 'level');
    const message = requireHostString(params, 'message');
    const type = readHostString(params, 'type') ?? 'plugin:log';
    const metadata = readHostObject(params, 'metadata') ?? undefined;

    await this.pluginService.recordPluginEvent(pluginId, {
      level,
      type,
      message,
      metadata,
    });

    return true;
  }

  /**
   * 读取当前插件的事件日志。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 事件日志分页结果
   */
  private async listLogs(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const limit = readHostNumber(params, 'limit');
    if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
      throw new BadRequestException('limit 必须是正整数');
    }

    const type = readHostString(params, 'type');
    const keyword = readHostString(params, 'keyword');
    const cursor = readHostString(params, 'cursor');
    const result = await this.pluginService.listPluginEvents(pluginId, {
      ...(limit !== null ? { limit } : {}),
      ...(Object.prototype.hasOwnProperty.call(params, 'level')
        ? { level: readHostEventLevel(params, 'level') }
        : {}),
      ...(type ? { type } : {}),
      ...(keyword ? { keyword } : {}),
      ...(cursor ? { cursor } : {}),
    });

    return toJsonValue(result);
  }

  /**
   * 读取插件自己的运行时状态。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 状态值；不存在时返回 null
   */
  private getState(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): JsonValue {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'state.get',
    });
    const key = requireHostString(params, 'key');
    return this.stateService.get(
      pluginId,
      buildPluginScopedStateKey(target, key),
    );
  }

  /**
   * 写入插件自己的运行时状态。
   * @param pluginId 插件 ID
   * @param params 写入参数
   * @returns 写入后的状态值
   */
  private setState(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): JsonValue {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'state.set',
    });
    const key = requireHostString(params, 'key');
    return this.stateService.set(
      pluginId,
      buildPluginScopedStateKey(target, key),
      requireHostJsonValue(params, 'value', 'state.set'),
    );
  }

  /**
   * 删除插件自己的运行时状态。
   * @param pluginId 插件 ID
   * @param context 插件调用上下文
   * @param params 删除参数
   * @returns 是否删除成功
   */
  private deleteState(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): JsonValue {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'state.delete',
    });
    const key = requireHostString(params, 'key');

    return this.stateService.delete(
      pluginId,
      buildPluginScopedStateKey(target, key),
    );
  }

  /**
   * 列出插件自己的运行时状态。
   * @param pluginId 插件 ID
   * @param context 插件调用上下文
   * @param params 查询参数
   * @returns 状态键值对列表
   */
  private listState(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): JsonValue {
    const target = resolvePluginScopedStateTarget({
      context,
      params,
      method: 'state.list',
    });
    const prefix = buildPluginScopedStatePrefix(
      target,
      readHostString(params, 'prefix'),
    );

    return this.stateService.list(pluginId, prefix)
      .map((entry) => ({
        key: stripPluginScopedStatePrefix(target, entry.key),
        value: entry.value,
      }))
      .filter((entry): entry is { key: string; value: JsonValue } => entry.key !== null);
  }

  /**
   * 读取当前用户摘要。
   * @param context 插件调用上下文
   * @returns 用户摘要
   */
  private async getUser(context: PluginCallContext): Promise<JsonValue> {
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

  /**
   * 读取当前对话的消息列表。
   * @param context 插件调用上下文
   * @returns 对话消息摘要列表
   */
  private async listConversationMessages(
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

  /**
   * 执行一次统一的结构化 LLM 生成。
   * @param pluginId 调用插件 ID
   * @param context 插件调用上下文
   * @param params 已解析的生成参数
   * @returns 统一的生成结果
   */
  private async generateCore(
    pluginId: string,
    context: PluginCallContext,
    params: PluginLlmGenerateParams,
  ): Promise<PluginLlmGenerateResult> {
    const utilityRole = resolveHostUtilityRoleForGeneration(
      pluginId,
      context,
      params,
    );
    const executed = await this.aiModelExecution.generateText(
      buildHostGenerateExecutionInput({
        params,
        utilityRole,
      }),
    );

    return buildHostGenerateResult(executed);
  }

  /**
   * 读取当前上下文对应的会话记录，并在有 userId 时校验所有权。
   * @param context 插件调用上下文
   * @param method 当前 Host API 方法名
   * @returns 当前会话记录
   */
  private async requireConversationRecord(
    context: PluginCallContext,
    method: string,
  ): Promise<{
    id: string;
    title: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const conversationId = requireHostConversationId(context, method);
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        title: true,
        userId: true,
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
