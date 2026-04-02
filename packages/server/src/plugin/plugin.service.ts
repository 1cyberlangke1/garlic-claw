import type {
  PluginEventLevel,
  PluginEventListResult,
  JsonObject,
  JsonValue,
  PluginCapability,
  PluginConfigSchema,
  PluginConfigSnapshot,
  PluginHealthSnapshot,
  PluginManifest,
  PluginScopeSettings,
  PluginSelfInfo,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertPluginScopeCanBeUpdated,
  normalizePluginScopeForGovernance,
} from './plugin-governance-policy';
import {
  buildPluginEventWhere,
  buildPluginHealthSnapshot,
  createPluginEvent,
  normalizePluginEventOptions,
  parsePluginEventLevel,
  resolvePluginEventCursor,
  type ListPluginEventOptions,
} from './plugin-event.helpers';
import {
  parsePersistedPluginManifest,
  serializePersistedPluginManifest,
} from './plugin-manifest.persistence';

/**
 * 运行时可直接消费的插件治理快照。
 */
export interface PluginGovernanceSnapshot {
  configSchema: PluginConfigSchema | null;
  resolvedConfig: JsonObject;
  scope: PluginScopeSettings;
}

/**
 * 记录插件事件时使用的输入参数。
 */
interface PluginEventInput {
  /** 事件类型。 */
  type: string;
  /** 人类可读消息。 */
  message: string;
  /** 可选附加上下文。 */
  metadata?: JsonObject;
}

/**
 * 插件持久化服务。
 *
 * 输入:
 * - 插件 manifest 与在线状态
 * - 插件配置与作用域更新请求
 *
 * 输出:
 * - 插件列表
 * - 持久化后的配置/作用域快照
 *
 * 预期行为:
 * - 统一持久化插件 manifest 邻接元数据
 * - 为 runtime 暴露可缓存的治理快照
 * - 校验插件配置与作用域规则
 */
@Injectable()
export class PluginService {
  private readonly logger = new Logger(PluginService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 注册或刷新一个插件，并返回治理快照。
   * @param name 插件 ID
   * @param deviceType 设备/运行设备类型
   * @param manifest 完整插件清单
   * @returns 可供 runtime 缓存的治理快照
   */
  async registerPlugin(
    name: string,
    deviceType: string,
    manifest: PluginManifest,
  ): Promise<PluginGovernanceSnapshot> {
    const existing = await this.prisma.plugin.findUnique({
      where: { name },
      select: {
        id: true,
      },
    });
    const plugin = await this.prisma.plugin.upsert({
      where: { name },
      create: {
        name,
        displayName: manifest.name,
        deviceType,
        runtimeKind: manifest.runtime,
        description: manifest.description,
        status: 'online',
        manifestJson: serializePersistedPluginManifest(manifest),
        version: manifest.version,
        healthStatus: 'healthy',
        lastSeenAt: new Date(),
      },
      update: {
        displayName: manifest.name,
        deviceType,
        runtimeKind: manifest.runtime,
        description: manifest.description,
        status: 'online',
        manifestJson: serializePersistedPluginManifest(manifest),
        version: manifest.version,
        healthStatus: 'healthy',
        lastSeenAt: new Date(),
      },
    });
    if (existing) {
      await createPluginEvent({
        prisma: this.prisma,
        pluginId: plugin.id,
        type: 'lifecycle:online',
        level: 'info',
        message: '插件已上线',
      });
      this.logger.log(`插件 "${name}" 已重新接入运行时，包含 ${(manifest.tools ?? []).length} 个能力`);
    } else {
      await createPluginEvent({
        prisma: this.prisma,
        pluginId: plugin.id,
        type: 'register',
        level: 'info',
        message: '插件已注册',
      });
      this.logger.log(`插件 "${name}" 已注册，包含 ${(manifest.tools ?? []).length} 个能力`);
    }
    return this.buildGovernanceSnapshot(plugin);
  }

  /**
   * 读取插件当前的治理快照。
   * @param name 插件 ID
   * @returns 配置 schema、解析后的配置值和作用域规则
   */
  async getGovernanceSnapshot(name: string): Promise<PluginGovernanceSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return this.buildGovernanceSnapshot(plugin);
  }

  /**
   * 将插件标记为在线。
   * @param name 插件 ID
   * @returns 更新后的数据库记录
   */
  async setOnline(name: string) {
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: {
        status: 'online',
        healthStatus: 'healthy',
        lastSeenAt: new Date(),
      },
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: updated.id,
      type: 'lifecycle:online',
      level: 'info',
      message: '插件已上线',
    });
    return updated;
  }

  /**
   * 将插件标记为离线。
   * @param name 插件 ID
   * @returns 更新后的数据库记录
   */
  async setOffline(name: string) {
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: {
        status: 'offline',
        healthStatus: 'offline',
      },
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: updated.id,
      type: 'lifecycle:offline',
      level: 'warn',
      message: '插件已离线',
    });
    return updated;
  }

  /**
   * 刷新插件最近心跳时间。
   * @param name 插件 ID
   * @returns 更新后的数据库记录
   */
  async heartbeat(name: string) {
    return this.prisma.plugin.update({
      where: { name },
      data: { lastSeenAt: new Date() },
    });
  }

  /**
   * 读取所有插件记录。
   * @returns 按名称排序的插件列表
   */
  async findAll() {
    return this.prisma.plugin.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * 读取所有在线插件记录。
   * @returns 在线插件列表
   */
  async findOnline() {
    return this.prisma.plugin.findMany({
      where: { status: 'online' },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * 通过名称读取插件。
   * @param name 插件 ID
   * @returns 数据库记录；不存在时返回 null
   */
  async findByName(name: string) {
    return this.prisma.plugin.findUnique({ where: { name } });
  }

  /**
   * 删除一条插件记录。
   * @param name 插件 ID
   * @returns 删除结果
   */
  async deletePlugin(name: string) {
    const plugin = await this.findByNameOrThrow(name);
    if (plugin.status === 'online') {
      throw new BadRequestException(`插件 ${name} 当前在线，不能直接删除`);
    }

    return this.prisma.plugin.delete({ where: { name } });
  }

  /**
   * 读取插件配置快照。
   * @param name 插件 ID
   * @returns schema 与解析后的配置值
   */
  async getPluginConfig(name: string): Promise<PluginConfigSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    const manifest = this.readPersistedManifest(plugin);
    return {
      schema: manifest.config ?? null,
      values: this.resolveConfig(plugin.config, manifest),
    };
  }

  /**
   * 读取插件解析后的配置值。
   * @param name 插件 ID
   * @returns 默认值与持久化值合并后的结果
   */
  async getResolvedConfig(name: string): Promise<JsonObject> {
    const plugin = await this.findByNameOrThrow(name);
    return this.resolveConfig(plugin.config, this.readPersistedManifest(plugin));
  }

  /**
   * 读取插件持久化存储中的单个值。
   * @param name 插件 ID
   * @param key 存储键
   * @returns JSON 值；不存在时返回 null
   */
  async getPluginStorage(name: string, key: string): Promise<JsonValue | null> {
    const plugin = await this.findByNameOrThrow(name);
    const entry = await this.prisma.pluginStorage.findUnique({
      where: {
        pluginId_key: {
          pluginId: plugin.id,
          key,
        },
      },
    });
    if (!entry) {
      return null;
    }

    return this.parseStoredJsonValue(
      entry.valueJson,
      null,
      `pluginStorage:${name}:${key}`,
    );
  }

  /**
   * 写入插件持久化存储。
   * @param name 插件 ID
   * @param key 存储键
   * @param value 待写入的 JSON 值
   * @returns 原样返回写入值
   */
  async setPluginStorage(
    name: string,
    key: string,
    value: JsonValue,
  ): Promise<JsonValue> {
    const plugin = await this.findByNameOrThrow(name);
    await this.prisma.pluginStorage.upsert({
      where: {
        pluginId_key: {
          pluginId: plugin.id,
          key,
        },
      },
      create: {
        pluginId: plugin.id,
        key,
        valueJson: JSON.stringify(value),
      },
      update: {
        valueJson: JSON.stringify(value),
      },
    });

    return value;
  }

  /**
   * 删除一条插件持久化存储记录。
   * @param name 插件 ID
   * @param key 存储键
   * @returns 是否删除成功
   */
  async deletePluginStorage(name: string, key: string): Promise<boolean> {
    const plugin = await this.findByNameOrThrow(name);
    const deleted = await this.prisma.pluginStorage.deleteMany({
      where: {
        pluginId: plugin.id,
        key,
      },
    });

    return deleted.count > 0;
  }

  /**
   * 列出插件持久化存储。
   * @param name 插件 ID
   * @param prefix 可选键前缀
   * @returns 键值对列表
   */
  async listPluginStorage(
    name: string,
    prefix?: string,
  ): Promise<Array<{ key: string; value: JsonValue }>> {
    const plugin = await this.findByNameOrThrow(name);
    const entries = await this.prisma.pluginStorage.findMany({
      where: {
        pluginId: plugin.id,
        ...(prefix ? { key: { startsWith: prefix } } : {}),
      },
      orderBy: {
        key: 'asc',
      },
    });

    return entries.map((entry) => ({
      key: entry.key,
      value: this.parseStoredJsonValue(
        entry.valueJson,
        null,
        `pluginStorage:${name}:${entry.key}`,
      ),
    }));
  }

  /**
   * 读取插件自身摘要。
   * @param name 插件 ID
   * @returns 当前插件的自省信息
   */
  async getPluginSelfInfo(name: string): Promise<PluginSelfInfo> {
    const plugin = await this.findByNameOrThrow(name);
    const manifest = this.readPersistedManifest(plugin);
    return {
      id: plugin.name,
      name: manifest.name,
      runtimeKind: plugin.runtimeKind === 'builtin' ? 'builtin' : 'remote',
      version: manifest.version || undefined,
      description: manifest.description ?? undefined,
      permissions: [...manifest.permissions],
      ...(manifest.crons ? { crons: [...manifest.crons] } : {}),
      ...(manifest.commands ? { commands: [...manifest.commands] } : {}),
      hooks: [...(manifest.hooks ?? [])],
      routes: [...(manifest.routes ?? [])],
    };
  }

  /**
   * 更新插件配置。
   * @param name 插件 ID
   * @param values 待保存的配置值
   * @returns 保存后的配置快照
   */
  async updatePluginConfig(
    name: string,
    values: JsonObject,
  ): Promise<PluginConfigSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    const manifest = this.readPersistedManifest(plugin);
    const schema = manifest.config ?? null;
    if (!schema) {
      throw new BadRequestException(`插件 ${name} 未声明配置 schema`);
    }

    const normalized = this.validateAndNormalizeConfig(schema, values);
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: {
        config: JSON.stringify(normalized),
      },
    });

    return {
      schema,
      values: this.resolveConfig(updated.config, manifest),
    };
  }

  /**
   * 读取插件作用域规则。
   * @param name 插件 ID
   * @returns 作用域设置
   */
  async getPluginScope(name: string): Promise<PluginScopeSettings> {
    const plugin = await this.findByNameOrThrow(name);
    return this.parseScope(plugin);
  }

  /**
   * 更新插件作用域规则。
   * @param name 插件 ID
   * @param scope 新的默认启用与会话级覆盖
   * @returns 归一化后的作用域设置
   */
  async updatePluginScope(
    name: string,
    scope: PluginScopeSettings,
  ): Promise<PluginScopeSettings> {
    const plugin = await this.findByNameOrThrow(name);
    this.validateScope(scope);
    assertPluginScopeCanBeUpdated({
      pluginId: plugin.name,
      runtimeKind: plugin.runtimeKind,
      scope,
    });
    const normalizedScope = normalizePluginScopeForGovernance({
      pluginId: plugin.name,
      runtimeKind: plugin.runtimeKind,
      scope,
    });

    const updated = await this.prisma.plugin.update({
      where: { name },
      data: {
        defaultEnabled: normalizedScope.defaultEnabled,
        conversationScopes: JSON.stringify(normalizedScope.conversations),
      },
    });

    return this.parseScope(updated);
  }

  /**
   * 读取插件健康快照。
   * @param name 插件 ID
   * @returns 健康摘要
   */
  async getPluginHealth(name: string): Promise<PluginHealthSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginHealthSnapshot({
      plugin,
    });
  }

  /**
   * 读取插件事件日志。
   * @param name 插件 ID
   * @param limit 返回数量上限
   * @returns 最近事件列表
   */
  async listPluginEvents(
    name: string,
    options: ListPluginEventOptions = {},
  ): Promise<PluginEventListResult> {
    const plugin = await this.findByNameOrThrow(name);
    const normalized = normalizePluginEventOptions(options);
    const cursorEvent = normalized.cursor
      ? await resolvePluginEventCursor({
        prisma: this.prisma,
        pluginId: plugin.id,
        cursor: normalized.cursor,
      })
      : null;
    const events = await this.prisma.pluginEvent.findMany({
      where: buildPluginEventWhere({
        pluginId: plugin.id,
        options: normalized,
        cursorEvent,
      }),
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: normalized.limit + 1,
    });
    const hasMore = events.length > normalized.limit;
    const items = (hasMore ? events.slice(0, normalized.limit) : events).map((event) => ({
      id: event.id,
      type: event.type,
      level: parsePluginEventLevel(event.level),
      message: event.message,
      metadata: this.parseNullableJsonObject(event.metadataJson),
      createdAt: event.createdAt.toISOString(),
    }));

    return {
      items,
      nextCursor: hasMore ? events[normalized.limit]?.id ?? null : null,
    };
  }

  /**
   * 记录一条插件主动写入的事件日志。
   * @param name 插件 ID
   * @param input 事件输入
   * @returns 无返回值
   */
  async recordPluginEvent(
    name: string,
    input: PluginEventInput & {
      level: PluginEventLevel;
    },
  ): Promise<void> {
    const plugin = await this.findByNameOrThrow(name);
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: plugin.id,
      type: input.type,
      level: input.level,
      message: input.message,
      metadata: input.metadata,
    });
  }

  /**
   * 记录插件成功事件并更新健康快照。
   * @param name 插件 ID
   * @param input 事件输入
   * @returns 无返回值
   */
  async recordPluginSuccess(
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
      persistEvent?: boolean;
    },
  ): Promise<void> {
    const plugin = await this.findByNameOrThrow(name);
    const now = new Date();
    await this.prisma.plugin.update({
      where: {
        name,
      },
      data: {
        healthStatus: plugin.status === 'offline' ? 'offline' : 'healthy',
        consecutiveFailures: 0,
        lastSuccessAt: now,
        ...(input.checked ? { lastCheckedAt: now } : {}),
      },
    });
    if (input.persistEvent !== false) {
      await createPluginEvent({
        prisma: this.prisma,
        pluginId: plugin.id,
        type: input.type,
        level: 'info',
        message: input.message,
        metadata: input.metadata,
      });
    }
  }

  /**
   * 记录插件失败事件并更新健康快照。
   * @param name 插件 ID
   * @param input 事件输入
   * @returns 无返回值
   */
  async recordPluginFailure(
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
    },
  ): Promise<void> {
    const plugin = await this.findByNameOrThrow(name);
    const now = new Date();
    const consecutiveFailures = plugin.consecutiveFailures + 1;
    await this.prisma.plugin.update({
      where: {
        name,
      },
      data: {
        healthStatus:
          plugin.status === 'offline'
            ? 'offline'
            : consecutiveFailures >= 3
              ? 'error'
              : 'degraded',
        failureCount: plugin.failureCount + 1,
        consecutiveFailures,
        lastError: input.message,
        lastErrorAt: now,
        ...(input.checked ? { lastCheckedAt: now } : {}),
      },
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: plugin.id,
      type: input.type,
      level: 'error',
      message: input.message,
      metadata: input.metadata,
    });
  }

  /**
   * 记录一次插件健康检查结果。
   * @param name 插件 ID
   * @param input 健康检查结果
   * @returns 无返回值
   */
  async recordHealthCheck(
    name: string,
    input: {
      ok: boolean;
      message: string;
      metadata?: JsonObject;
    },
  ): Promise<void> {
    if (input.ok) {
      await this.recordPluginSuccess(name, {
        type: 'health:ok',
        message: input.message,
        metadata: input.metadata,
        checked: true,
      });
      return;
    }

    await this.recordPluginFailure(name, {
      type: 'health:error',
      message: input.message,
      metadata: input.metadata,
      checked: true,
    });
  }

  /**
   * 将 Prisma 记录转换为运行时治理快照。
   * @param plugin 原始数据库记录
   * @returns 配置 schema、解析后的配置值和作用域
   */
  private buildGovernanceSnapshot(
    plugin: Awaited<ReturnType<PluginService['findByNameOrThrow']>>,
  ): PluginGovernanceSnapshot {
    const manifest = this.readPersistedManifest(plugin);
    return {
      configSchema: manifest.config ?? null,
      resolvedConfig: this.resolveConfig(plugin.config, manifest),
      scope: this.parseScope(plugin),
    };
  }

  /**
   * 解析插件配置值并合并默认值。
   * @param rawConfig 原始持久化配置 JSON
   * @param manifest 插件清单
   * @returns 可供插件读取的配置对象
   */
  private resolveConfig(
    rawConfig: string | null,
    manifest: PluginManifest,
  ): JsonObject {
    const schema = manifest.config ?? null;
    const stored = this.parseJsonObject(rawConfig);
    if (!schema) {
      return stored;
    }

    const resolved: JsonObject = {};
    for (const field of schema.fields) {
      const storedValue = stored[field.key];
      if (storedValue !== undefined) {
        resolved[field.key] = storedValue;
        continue;
      }
      if (field.defaultValue !== undefined) {
        resolved[field.key] = field.defaultValue;
      }
    }

    return resolved;
  }

  /**
   * 读取持久化的插件 manifest。
   * @param plugin 原始数据库记录
   * @returns 归一化后的插件清单
   */
  private readPersistedManifest(
    plugin: Awaited<ReturnType<PluginService['findByNameOrThrow']>>,
  ): PluginManifest {
    return parsePersistedPluginManifest(
      plugin.manifestJson,
      {
        id: plugin.name,
        displayName: plugin.displayName,
        description: plugin.description,
        version: plugin.version,
        runtimeKind: plugin.runtimeKind,
      },
      (message) => {
        this.logger.warn(`plugin.manifestJson JSON 无效，已回退默认值: ${message}`);
      },
    );
  }

  /**
   * 校验并归一化插件配置值。
   * @param schema 插件声明的配置 schema
   * @param values 待保存值
   * @returns 可持久化的配置对象
   */
  private validateAndNormalizeConfig(
    schema: PluginConfigSchema,
    values: JsonObject,
  ): JsonObject {
    const normalized: JsonObject = {};
    const fieldsByKey = new Map(schema.fields.map((field) => [field.key, field]));

    for (const [key, value] of Object.entries(values)) {
      const field = fieldsByKey.get(key);
      if (!field) {
        throw new BadRequestException(`未知的插件配置项: ${key}`);
      }
      if (!this.matchesConfigType(field.type, value)) {
        throw new BadRequestException(`插件配置 ${key} 类型无效`);
      }
      normalized[key] = value;
    }

    for (const field of schema.fields) {
      const provided = normalized[field.key];
      if (field.required && provided === undefined && field.defaultValue === undefined) {
        throw new BadRequestException(`插件配置 ${field.key} 必填`);
      }
    }

    return normalized;
  }

  /**
   * 校验作用域配置。
   * @param scope 作用域设置
   * @returns 无返回值；校验失败时抛错
   */
  private validateScope(scope: PluginScopeSettings): void {
    if (typeof scope.defaultEnabled !== 'boolean') {
      throw new BadRequestException('defaultEnabled 必须是布尔值');
    }

    for (const [conversationId, enabled] of Object.entries(scope.conversations)) {
      if (!conversationId) {
        throw new BadRequestException('conversationId 不能为空');
      }
      if (typeof enabled !== 'boolean') {
        throw new BadRequestException(
          `conversation ${conversationId} 的启停值必须是布尔值`,
        );
      }
    }
  }

  /**
   * 解析插件作用域规则。
   * @param plugin 原始数据库记录
   * @returns 归一化后的作用域设置
   */
  private parseScope(
    plugin: Awaited<ReturnType<PluginService['findByNameOrThrow']>>,
  ): PluginScopeSettings {
    const conversations = this.parseBooleanRecord(plugin.conversationScopes);
    return normalizePluginScopeForGovernance({
      pluginId: plugin.name,
      runtimeKind: plugin.runtimeKind,
      scope: {
        defaultEnabled: plugin.defaultEnabled,
        conversations,
      },
    });
  }

  /**
   * 将 JSON 字符串解析为对象。
   * @param raw 原始 JSON 字符串
   * @returns JSON 对象；空值时返回空对象
   */
  private parseJsonObject(raw: string | null): JsonObject {
    if (!raw) {
      return {};
    }

    const parsed = this.safeParse(raw, 'plugin.jsonObject');
    if (!isJsonObjectValue(parsed)) {
      return {};
    }

    return parsed;
  }

  /**
   * 将 JSON 字符串解析为可为空对象。
   * @param raw 原始 JSON 字符串
   * @returns JSON 对象；无效时返回 null
   */
  private parseNullableJsonObject(raw: string | null): JsonObject | null {
    if (!raw) {
      return null;
    }

    const parsed = this.safeParse(raw, 'plugin.nullableJsonObject');
    if (!isJsonObjectValue(parsed)) {
      return null;
    }

    return parsed;
  }

  /**
   * 将 JSON 字符串解析为布尔值字典。
   * @param raw 原始 JSON 字符串
   * @returns 布尔值记录
   */
  private parseBooleanRecord(raw: string | null): Record<string, boolean> {
    const parsed = this.parseJsonObject(raw);
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * 判断值是否符合插件配置字段类型。
   * @param type 声明类型
   * @param value 待校验值
   * @returns 是否匹配
   */
  private matchesConfigType(
    type: PluginCapability['parameters'][string]['type'],
    value: JsonValue,
  ): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      default:
        return false;
    }
  }


  /**
   * 安全解析任意持久化 JSON 值，解析失败时记录告警并回退默认值。
   * @param raw 原始 JSON 字符串
   * @param fallback 回退值
   * @param label 日志标签
   * @returns 解析结果或回退值
   */
  private parseStoredJsonValue(
    raw: string,
    fallback: JsonValue | null,
    label: string,
  ): JsonValue | null {
    const parsed = this.safeParse(raw, label);
    return isJsonValue(parsed) ? parsed : fallback;
  }

  /**
   * 安全解析 JSON 并在失败时记录日志。
   * @param raw 原始 JSON 字符串
   * @param fallback 回退值
   * @param label 日志标签
   * @returns 解析结果或回退值
   */
  private safeParse(raw: string, label: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${label} JSON 无效，已回退默认值: ${message}`);
      return undefined;
    }
  }

  /**
   * 读取一条插件记录；不存在时抛出 404。
   * @param name 插件 ID
   * @returns 原始数据库记录
   */
  private async findByNameOrThrow(name: string) {
    const plugin = await this.findByName(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${name}`);
    }

    return plugin;
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function isJsonObjectValue(value: unknown): value is JsonObject {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => isJsonValue(entry));
}
