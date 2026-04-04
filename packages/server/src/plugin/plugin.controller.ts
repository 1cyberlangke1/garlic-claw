import type {
  PluginActionName,
  PluginActionResult,
  PluginConfigSnapshot,
  PluginConversationSessionInfo,
  PluginEventListResult,
  PluginHealthSnapshot,
  PluginInfo,
  RemotePluginBootstrapInfo,
  PluginScopeSettings,
  PluginStorageEntry,
} from '@garlic-claw/shared';
import { buildPluginHealthSnapshot } from '@garlic-claw/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { toJsonValue } from '../common/utils/json-value';
import {
  CreateRemotePluginBootstrapDto,
  UpdatePluginConfigDto,
  UpdatePluginScopeDto,
  UpdatePluginStorageDto,
} from './dto/plugin-admin.dto';
import { PluginAdminService } from './plugin-admin.service';
import { PluginCronService } from './plugin-cron.service';
import { readPluginEventQuery } from './plugin-event.helpers';
import { readNonEmptyString } from './plugin-manifest-normalize-base.helpers';
import { buildMergedPluginView } from './plugin-read.service';
import { PluginRemoteBootstrapService } from './plugin-remote-bootstrap.service';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

const PLUGIN_ACTIONS: PluginActionName[] = ['reload', 'reconnect', 'health-check'];

@ApiTags('Plugins')
@ApiBearerAuth()
@Controller('plugins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class PluginController {
  constructor(
    private pluginService: PluginService,
    private pluginRuntime: PluginRuntimeService,
    private pluginRuntimeOrchestrator: PluginRuntimeOrchestratorService,
    private pluginCronService: PluginCronService,
    private pluginAdmin: PluginAdminService,
    private pluginRemoteBootstrap: PluginRemoteBootstrapService,
  ) {}

  @Get()
  async listPlugins(): Promise<PluginInfo[]> {
    const plugins = await this.pluginService.findAll();
    const runtimePlugins = new Map(
      this.pluginRuntime.listPlugins().map((plugin) => [plugin.pluginId, plugin]),
    );
    return Promise.all(plugins.map(async (p) => {
      const runtimePlugin = runtimePlugins.get(p.name);
      const mergedView = buildMergedPluginView({
        plugin: p,
        ...(runtimePlugin ? { runtimePlugin } : {}),
      });
      const health = buildPluginHealthSnapshot({ plugin: p });
      return {
        id: p.id,
        name: p.name,
        displayName: mergedView.manifest.name,
        description: mergedView.manifest.description,
        deviceType: p.deviceType,
        status: p.status,
        connected: mergedView.connected,
        runtimeKind: mergedView.runtimeKind,
        version: mergedView.manifest.version,
        supportedActions: mergedView.supportedActions,
        crons: await this.pluginCronService.listCronJobs(p.name),
        manifest: mergedView.manifest,
        health: mergeRuntimePressure(health, mergedView.runtimePressure),
        governance: mergedView.governance,
        lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    }));
  }

  @Get('connected')
  getConnectedPlugins() {
    return this.pluginRuntime.listPlugins().map((plugin) => ({
      name: plugin.pluginId,
      runtimeKind: plugin.runtimeKind,
      manifest: plugin.manifest,
    }));
  }

  @Post('remote/bootstrap')
  createRemoteBootstrap(
    @Body() dto: CreateRemotePluginBootstrapDto,
  ): Promise<RemotePluginBootstrapInfo> {
    return this.pluginRemoteBootstrap.issueBootstrap(dto);
  }

  @Delete(':name')
  deletePlugin(@Param('name') name: string) {
    return this.pluginService.deletePlugin(name);
  }

  @Get(':name/config')
  getPluginConfig(@Param('name') name: string): Promise<PluginConfigSnapshot> {
    return this.pluginService.getPluginConfig(name);
  }

  @Put(':name/config')
  async updatePluginConfig(
    @Param('name') name: string,
    @Body() dto: UpdatePluginConfigDto,
  ): Promise<PluginConfigSnapshot> {
    const result = await this.pluginService.updatePluginConfig(name, dto.values);
    await this.pluginRuntimeOrchestrator.refreshPluginGovernance(name);
    return result;
  }

  @Get(':name/storage')
  listPluginStorage(
    @Param('name') name: string,
    @Query('prefix') prefix?: string,
  ): Promise<PluginStorageEntry[]> {
    return this.pluginService.listPluginStorage(name, prefix?.trim() || undefined);
  }

  @Put(':name/storage')
  async setPluginStorage(
    @Param('name') name: string,
    @Body() dto: UpdatePluginStorageDto,
  ): Promise<PluginStorageEntry> {
    return {
      key: dto.key,
      value: await this.pluginService.setPluginStorage(
        name,
        dto.key,
        toJsonValue(dto.value),
      ),
    };
  }

  @Delete(':name/storage')
  deletePluginStorage(
    @Param('name') name: string,
    @Query('key') key?: string,
  ): Promise<boolean> {
    const normalizedKey = readNonEmptyString(key);
    if (!normalizedKey) {
      throw new BadRequestException('key 必填');
    }

    return this.pluginService.deletePluginStorage(name, normalizedKey);
  }

  @Get(':name/scopes')
  getPluginScope(@Param('name') name: string): Promise<PluginScopeSettings> {
    return this.pluginService.getPluginScope(name);
  }

  @Get(':name/health')
  async getPluginHealth(@Param('name') name: string): Promise<PluginHealthSnapshot> {
    const health = await this.pluginService.getPluginHealth(name);
    return mergeRuntimePressure(health, this.pluginRuntime.getRuntimePressure(name));
  }

  @Get(':name/events')
  listPluginEvents(
    @Param('name') name: string,
    @Query() query?: Parameters<typeof readPluginEventQuery>[0],
  ): Promise<PluginEventListResult> {
    return this.pluginService.listPluginEvents(
      name,
      readPluginEventQuery(query ?? {}),
    );
  }

  @Get(':name/crons')
  listPluginCrons(@Param('name') name: string) {
    return this.pluginCronService.listCronJobs(name);
  }

  @Delete(':name/crons/:jobId')
  deletePluginCron(
    @Param('name') name: string,
    @Param('jobId') jobId: string,
  ): Promise<boolean> {
    return this.pluginCronService.deleteCron(name, jobId);
  }

  @Get(':name/sessions')
  async listPluginConversationSessions(
    @Param('name') name: string,
  ): Promise<PluginConversationSessionInfo[]> {
    return this.pluginRuntime.listConversationSessions(name);
  }

  @Delete(':name/sessions/:conversationId')
  async finishPluginConversationSession(
    @Param('name') name: string,
    @Param('conversationId') conversationId: string,
  ): Promise<boolean> {
    return this.pluginRuntime.finishConversationSessionForGovernance(
      name,
      conversationId,
    );
  }

  @Put(':name/scopes')
  async updatePluginScope(
    @Param('name') name: string,
    @Body() dto: UpdatePluginScopeDto,
  ): Promise<PluginScopeSettings> {
    const currentScope = await this.pluginService.getPluginScope(name);
    const result = await this.pluginService.updatePluginScope(name, {
      defaultEnabled: currentScope.defaultEnabled,
      conversations: dto.conversations ?? currentScope.conversations,
    });
    await this.pluginRuntimeOrchestrator.refreshPluginGovernance(name);
    return result;
  }

  @Post(':name/actions/:action')
  runPluginAction(
    @Param('name') name: string,
    @Param('action') action: string,
  ): Promise<PluginActionResult> {
    if (!PLUGIN_ACTIONS.includes(action as PluginActionName)) {
      throw new BadRequestException(
        'action 必须是 reload / reconnect / health-check',
      );
    }

    return this.pluginAdmin.runAction(name, action as PluginActionName);
  }
}

function mergeRuntimePressure(
  health: PluginHealthSnapshot,
  runtimePressure: PluginHealthSnapshot['runtimePressure'] | null | undefined,
): PluginHealthSnapshot {
  return runtimePressure ? { ...health, runtimePressure } : health;
}
