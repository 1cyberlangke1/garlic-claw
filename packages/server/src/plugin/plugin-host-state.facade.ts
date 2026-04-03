import type { PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import {
  buildPluginScopedStateKey,
  buildPluginScopedStatePrefix,
  resolvePluginScopedStateTarget,
  stripPluginScopedStatePrefix,
} from './plugin-scoped-state.helpers';
import { PluginStateService } from './plugin-state.service';
import { PluginService } from './plugin.service';
import {
  readHostEventLevel,
  readHostNumber,
  readHostObject,
  readHostString,
  requireHostJsonValue,
  requireHostString,
} from './plugin-host.helpers';

/**
 * Host API 的宿主状态面。
 *
 * 输入:
 * - 插件配置/自省/日志/持久化/运行时状态请求
 *
 * 输出:
 * - JSON 可序列化结果
 *
 * 预期行为:
 * - 把 `config / plugin.self / storage / state / log` 从 Host 分发表主类中拆出
 * - 继续复用统一 scoped state key 规则
 * - 不把持久化与运行时状态样板继续堆在 `PluginHostService`
 */
@Injectable()
export class PluginHostStateFacade {
  constructor(
    private readonly pluginService: PluginService,
    private readonly stateService: PluginStateService,
  ) {}

  async getConfig(pluginId: string, params: JsonObject): Promise<JsonValue> {
    const config = await this.pluginService.getResolvedConfig(pluginId);
    const key = readHostString(params, 'key');
    if (!key) {
      return config;
    }

    return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : null;
  }

  async getPluginSelf(pluginId: string): Promise<JsonValue> {
    return toJsonValue(await this.pluginService.getPluginSelfInfo(pluginId));
  }

  async getStorage(
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

  async setStorage(
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

  async deleteStorage(
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

  async listStorage(
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

  async writeLog(pluginId: string, params: JsonObject): Promise<JsonValue> {
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

  async listLogs(pluginId: string, params: JsonObject): Promise<JsonValue> {
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

  getState(
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

  setState(
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

  deleteState(
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

  listState(
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
}
