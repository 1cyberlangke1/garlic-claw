import { type EventLogSettings, type JsonObject, type JsonValue, type PluginActionName, type PluginLlmPreference, type PluginRemoteDescriptor } from '@garlic-claw/shared';
import { All, BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, Inject, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/http-auth';
import {
  createPluginConfigUpdatedEvent,
  createPluginEventLogUpdatedEvent,
  createPluginGovernanceEvent,
  createPluginLlmPreferenceUpdatedEvent,
  createPluginScopeUpdatedEvent,
  createPluginStorageDeletedEvent,
  createPluginStorageUpdatedEvent,
  type LogEventPayload,
} from '../../core/logging/log-event-payloads';
import { ToolManagementSettingsService } from '../execution/tool/tool-management-settings.service';
import { buildPluginInfo } from './persistence/plugin-read-model';
import { PluginPersistenceService } from './persistence/plugin-persistence.service';
import { buildRemotePluginConnectionInfo, PluginBootstrapService } from './bootstrap/plugin-bootstrap.service';
import { ConversationStoreService } from '../runtime/host/conversation-store.service';
import { PluginDispatchService } from '../runtime/host/plugin-dispatch.service';
import { PluginRuntimeService } from '../runtime/host/plugin-runtime.service';
import { RuntimePluginGovernanceService } from '../runtime/kernel/runtime-plugin-governance.service';
import { readPluginEventQuery, readPluginRouteInvocation, writePluginRouteResponse } from '../../shared/http/http-request.codec';

interface UpsertRemotePluginDto {
  access: {
    accessKey?: string | null;
    serverUrl?: string | null;
  };
  description?: string;
  displayName?: string;
  remote: PluginRemoteDescriptor;
  version?: string;
}
interface UpdatePluginConfigDto { values: JsonObject; }
interface UpdatePluginLlmPreferenceDto extends PluginLlmPreference {}
interface UpdatePluginEventLogDto extends EventLogSettings {}
interface UpdatePluginScopeDto { defaultEnabled?: boolean; conversations?: Record<string, boolean>; }
interface UpdatePluginStorageDto { key: string; value: JsonValue; }
interface PluginEventQueryInput { limit?: string; level?: string; type?: string; keyword?: string; cursor?: string; }

@Controller()
export class PluginController {
  constructor(private readonly pluginBootstrapService: PluginBootstrapService, private readonly pluginPersistenceService: PluginPersistenceService, private readonly runtimeHostConversationRecordService: ConversationStoreService, @Inject(PluginDispatchService) private readonly runtimeHostPluginDispatchService: PluginDispatchService, private readonly runtimeHostPluginRuntimeService: PluginRuntimeService, private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService, private readonly toolManagementSettingsService: ToolManagementSettingsService) {}

  @Get('plugins')
  listPlugins() { return this.runtimePluginGovernanceService.listPlugins().map((plugin) => buildPluginInfo(plugin, this.runtimePluginGovernanceService.listSupportedActions(plugin.pluginId))); }

  @Get('plugins/connected')
  getConnectedPlugins() { return this.runtimePluginGovernanceService.listPlugins().filter((plugin) => plugin.connected).map((plugin) => ({ manifest: plugin.manifest, name: plugin.pluginId, runtimeKind: plugin.manifest.runtime })); }

  @Get('plugins/:pluginId/health')
  getPluginHealth(@Param('pluginId') pluginId: string) { return this.runtimePluginGovernanceService.readPluginHealthSnapshot(pluginId); }

  @Get('plugins/:pluginId/remote-connection')
  getRemotePluginConnection(@Param('pluginId') pluginId: string) {
    return buildRemotePluginConnectionInfo(this.pluginBootstrapService.getPlugin(pluginId));
  }

  @Put('plugins/:pluginId/remote-access')
  upsertRemotePlugin(@Param('pluginId') pluginId: string, @Body() dto: UpsertRemotePluginDto) {
    const record = this.pluginBootstrapService.upsertRemotePlugin({
      access: {
        accessKey: dto.access?.accessKey ?? null,
        serverUrl: dto.access?.serverUrl ?? null,
      },
      description: dto.description,
      displayName: dto.displayName,
      pluginName: pluginId,
      remote: dto.remote,
      version: dto.version,
    });
    return buildPluginInfo(record, this.runtimePluginGovernanceService.listSupportedActions(record.pluginId));
  }

  @Delete('plugins/:pluginId')
  deletePlugin(@Param('pluginId') pluginId: string) {
    const deleted = this.pluginPersistenceService.deletePlugin(pluginId);
    this.runtimeHostPluginRuntimeService.deletePluginRuntimeState(pluginId);
    this.runtimeHostConversationRecordService.deletePluginConversationSessions(pluginId);
    this.runtimePluginGovernanceService.deletePluginRuntimeState(pluginId);
    this.toolManagementSettingsService.deleteSourceOverrides(`plugin:${pluginId}`);
    return deleted;
  }

  @Get('plugins/:pluginId/config')
  getPluginConfig(@Param('pluginId') pluginId: string) { return this.pluginPersistenceService.getPluginConfig(pluginId); }

  @Put('plugins/:pluginId/config')
  updatePluginConfig(@Param('pluginId') pluginId: string, @Body() dto: UpdatePluginConfigDto) {
    const snapshot = this.pluginPersistenceService.updatePluginConfig(pluginId, dto.values);
    this.recordPluginEvent(pluginId, createPluginConfigUpdatedEvent(pluginId, Object.keys(dto.values)));
    return snapshot;
  }

  @Get('plugins/:pluginId/llm-preference')
  getPluginLlmPreference(@Param('pluginId') pluginId: string) { return this.pluginPersistenceService.getPluginLlmPreference(pluginId); }

  @Put('plugins/:pluginId/llm-preference')
  updatePluginLlmPreference(@Param('pluginId') pluginId: string, @Body() dto: UpdatePluginLlmPreferenceDto) {
    const preference = this.pluginPersistenceService.updatePluginLlmPreference(pluginId, dto);
    this.recordPluginEvent(pluginId, createPluginLlmPreferenceUpdatedEvent(pluginId, preference));
    return preference;
  }

  @Get('plugins/:pluginId/event-log')
  getPluginEventLog(@Param('pluginId') pluginId: string) { return this.pluginPersistenceService.getPluginEventLog(pluginId); }

  @Put('plugins/:pluginId/event-log')
  updatePluginEventLog(@Param('pluginId') pluginId: string, @Body() dto: UpdatePluginEventLogDto) {
    const settings = this.pluginPersistenceService.updatePluginEventLog(pluginId, dto);
    this.recordPluginEvent(pluginId, createPluginEventLogUpdatedEvent(pluginId, settings.maxFileSizeMb));
    return settings;
  }

  @Get('plugins/:pluginId/scopes')
  getPluginScope(@Param('pluginId') pluginId: string) { return this.pluginPersistenceService.getPluginScope(pluginId); }

  @Get('plugins/:pluginId/events')
  listPluginEvents(@Param('pluginId') pluginId: string, @Query() query?: PluginEventQueryInput) { return this.pluginPersistenceService.listPluginEvents(pluginId, readPluginEventQuery(query ?? {})); }

  @Put('plugins/:pluginId/scopes')
  updatePluginScope(@Param('pluginId') pluginId: string, @Body() dto: UpdatePluginScopeDto) {
    const scope = this.pluginPersistenceService.updatePluginScope(pluginId, dto);
    this.recordPluginEvent(pluginId, createPluginScopeUpdatedEvent(pluginId, Object.keys(scope.conversations).length));
    return scope;
  }

  @Post('plugins/:pluginId/actions/:action')
  async runPluginAction(@Param('pluginId') pluginId: string, @Param('action') action: string) {
    const actionName = readPluginActionName(action);
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    const eventLog = this.pluginPersistenceService.getPluginEventLog(pluginId);
    let detachedAfterAction = false;
    let result;
    if (actionName === 'reload' && plugin.manifest.runtime === 'local' && this.pluginBootstrapService.canReloadLocal(pluginId)) {
      const reloaded = this.pluginBootstrapService.reloadLocal(pluginId);
      if (reloaded.removed) {
        cleanupDetachedLocalPluginState(pluginId, this.runtimeHostPluginRuntimeService, this.runtimeHostConversationRecordService, this.runtimePluginGovernanceService, this.toolManagementSettingsService);
        detachedAfterAction = true;
        result = { accepted: true, action: actionName, pluginId, message: '本地插件目录已删除，已清理旧记录' };
      } else {
        result = { accepted: true, action: actionName, pluginId, message: '已重新装载本地插件' };
      }
    } else {
      result = await this.runtimePluginGovernanceService.runPluginAction({ action: actionName, pluginId });
    }
    if (detachedAfterAction) {
      this.pluginPersistenceService.recordDetachedPluginEvent(pluginId, eventLog, {
        ...createPluginGovernanceEvent(result.action, result.message, result.action === 'health-check' && result.message.includes('失败') ? 'warn' : 'info'),
      });
    } else {
      this.recordPluginEvent(pluginId, createPluginGovernanceEvent(result.action, result.message, result.action === 'health-check' && result.message.includes('失败') ? 'warn' : 'info'));
    }
    return result;
  }

  @Get('plugins/:pluginId/storage')
  listPluginStorage(@Param('pluginId') pluginId: string, @Query('prefix') prefix?: string) { return this.runtimeHostPluginRuntimeService.listPluginStorage(pluginId, prefix?.trim() || undefined); }

  @Put('plugins/:pluginId/storage')
  setPluginStorage(@Param('pluginId') pluginId: string, @Body() dto: UpdatePluginStorageDto) {
    const entry = { key: dto.key, value: this.runtimeHostPluginRuntimeService.setPluginStorage(pluginId, dto.key, dto.value) };
    this.recordPluginEvent(pluginId, createPluginStorageUpdatedEvent(dto.key));
    return entry;
  }

  @Delete('plugins/:pluginId/storage')
  deletePluginStorage(@Param('pluginId') pluginId: string, @Query('key') key?: string) {
    if (!key?.trim()) {throw new BadRequestException('key 必填');}
    const normalizedKey = key.trim();
    const deleted = this.runtimeHostPluginRuntimeService.deletePluginStorage(pluginId, normalizedKey);
    if (deleted) {
      this.recordPluginEvent(pluginId, createPluginStorageDeletedEvent(normalizedKey));
    }
    return deleted;
  }

  @Get('plugins/:pluginId/crons')
  listPluginCrons(@Param('pluginId') pluginId: string) { return this.runtimeHostPluginRuntimeService.listCronJobs(pluginId); }

  @Delete('plugins/:pluginId/crons/:jobId')
  deletePluginCron(@Param('pluginId') pluginId: string, @Param('jobId') jobId: string) { return this.runtimeHostPluginRuntimeService.deleteCronJob(pluginId, { jobId }) as boolean; }

  @Get('plugins/:pluginId/sessions')
  listPluginConversationSessions(@Param('pluginId') pluginId: string) { return this.runtimeHostConversationRecordService.listPluginConversationSessions(pluginId); }

  @Delete('plugins/:pluginId/sessions/:conversationId')
  finishPluginConversationSession(@Param('pluginId') pluginId: string, @Param('conversationId') conversationId: string) { return this.runtimeHostConversationRecordService.finishPluginConversationSession(pluginId, conversationId); }

  private recordPluginEvent(inputPluginId: string, input: Omit<LogEventPayload, 'level'> & { level?: LogEventPayload['level'] }): void {
    this.pluginPersistenceService.recordPluginEvent(inputPluginId, { level: input.level ?? 'info', message: input.message, ...(input.metadata ? { metadata: input.metadata } : {}), type: input.type });
  }

  @All('plugin-routes/:pluginId/*path')
  @UseGuards(JwtAuthGuard)
  async handleRoute(@Param('pluginId') pluginId: string, @Query() query: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<JsonValue> {
    const route = readPluginRouteInvocation(req, query);
    const result = await this.runtimeHostPluginDispatchService.invokeRoute({ pluginId, request: route.request, context: route.context });
    return writePluginRouteResponse(res, result);
  }
}

function readPluginActionName(action: string): PluginActionName {
  if (action === 'health-check' || action === 'reload' || action === 'reconnect' || action === 'refresh-metadata') {return action;}
  throw new BadRequestException('action 必须是 reload / reconnect / health-check / refresh-metadata');
}

function cleanupDetachedLocalPluginState(
  pluginId: string,
  runtimeHostPluginRuntimeService: PluginRuntimeService,
  runtimeHostConversationRecordService: ConversationStoreService,
  runtimePluginGovernanceService: RuntimePluginGovernanceService,
  toolManagementSettingsService: ToolManagementSettingsService,
): void {
  runtimeHostPluginRuntimeService.deletePluginRuntimeState(pluginId);
  runtimeHostConversationRecordService.deletePluginConversationSessions(pluginId);
  runtimePluginGovernanceService.deletePluginRuntimeState(pluginId);
  toolManagementSettingsService.deleteSourceOverrides(`plugin:${pluginId}`);
}
