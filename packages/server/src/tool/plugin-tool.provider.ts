import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { PluginCallContext } from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';
import type { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import type { PluginService } from '../plugin/plugin.service';
import type {
  ToolHealthStatus,
  ToolProvider,
  ToolProviderState,
  ToolProviderTool,
  ToolSourceDescriptor,
} from './tool.types';

type PersistedPluginRecord = Awaited<ReturnType<PluginService['findAll']>>[number];
type RuntimePluginRecord = ReturnType<PluginRuntimeService['listPlugins']>[number];
type RuntimeToolRecord = ReturnType<PluginRuntimeService['listTools']>[number];

interface PluginToolSourceState {
  sources: ToolSourceDescriptor[];
  sourceById: Map<string, ToolSourceDescriptor>;
  pluginLabels: Map<string, string>;
  runtimeTools: RuntimeToolRecord[];
}

@Injectable()
export class PluginToolProvider implements ToolProvider {
  readonly kind = 'plugin' as const;
  private pluginRuntimePromise?: Promise<Pick<
    PluginRuntimeService,
    'executeTool' | 'listPlugins' | 'listTools'
  >>;
  private pluginServicePromise?: Promise<Pick<PluginService, 'findAll'>>;

  constructor(private readonly moduleRef: ModuleRef) {}

  async collectState(context?: PluginCallContext): Promise<ToolProviderState> {
    const state = await this.readSourceState(context);

    return {
      sources: state.sources,
      tools: this.buildToolsFromState(state),
    };
  }

  async listSources(context?: PluginCallContext) {
    return (await this.collectState(context)).sources;
  }

  async listTools(context?: PluginCallContext): Promise<ToolProviderTool[]> {
    return (await this.collectState(context)).tools;
  }

  executeTool(input: {
    tool: ToolProviderTool;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }) {
    return this.getPluginRuntime().then((pluginRuntime) => pluginRuntime.executeTool({
      pluginId: input.tool.pluginId ?? input.tool.source.id,
      toolName: input.tool.name,
      params: input.params,
      context: input.context,
      skipLifecycleHooks: input.skipLifecycleHooks,
    }));
  }

  private async readSourceState(context?: PluginCallContext): Promise<PluginToolSourceState> {
    const [pluginService, pluginRuntime] = await Promise.all([
      this.getPluginService(),
      this.getPluginRuntime(),
    ]);
    const [persistedPlugins, runtimePlugins] = await Promise.all([
      pluginService.findAll(),
      Promise.resolve(pluginRuntime.listPlugins()),
    ]);
    const persistedByName = new Map<string, PersistedPluginRecord>(
      persistedPlugins.map((plugin: PersistedPluginRecord) => [plugin.name, plugin] as const),
    );
    const sources: ToolSourceDescriptor[] = runtimePlugins.map((entry: RuntimePluginRecord) => {
      const persisted = persistedByName.get(entry.pluginId);

      return {
        kind: 'plugin' as const,
        id: entry.pluginId,
        label: entry.manifest.name || entry.pluginId,
        enabled: persisted?.defaultEnabled ?? true,
        health: readToolHealthStatus(persisted),
        lastError: persisted?.lastError ?? null,
        lastCheckedAt: persisted?.lastCheckedAt?.toISOString() ?? null,
        supportedActions: entry.supportedActions,
        pluginId: entry.pluginId,
        runtimeKind: entry.runtimeKind,
      };
    });

    return {
      sources,
      sourceById: new Map(
        sources.map((source) => [
          source.id,
          source,
        ]),
      ),
      pluginLabels: new Map(
        runtimePlugins.map((entry) => [
          entry.pluginId,
          entry.manifest.name || entry.pluginId,
        ]),
      ),
      runtimeTools: pluginRuntime.listTools(context),
    };
  }

  private buildToolsFromState(
    state: Awaited<ReturnType<PluginToolProvider['readSourceState']>>,
  ): ToolProviderTool[] {
    return (state.runtimeTools ?? []).map((entry) => ({
      source: state.sourceById.get(entry.pluginId) ?? {
        kind: 'plugin',
        id: entry.pluginId,
        label: state.pluginLabels.get(entry.pluginId) ?? entry.pluginId,
        enabled: true,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: null,
      },
      name: entry.tool.name,
      description: entry.tool.description,
      parameters: entry.tool.parameters,
      pluginId: entry.pluginId,
      runtimeKind: entry.runtimeKind,
    }));
  }

  private async getPluginRuntime() {
    if (this.pluginRuntimePromise) {
      return this.pluginRuntimePromise;
    }

    this.pluginRuntimePromise = (async () => {
      const { PluginRuntimeService } = await import('../plugin/plugin-runtime.service');
      const resolved = this.moduleRef.get<Pick<
        PluginRuntimeService,
        'executeTool' | 'listPlugins' | 'listTools'
      >>(PluginRuntimeService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('PluginRuntimeService is not available');
      }

      return resolved;
    })();

    return this.pluginRuntimePromise;
  }

  private async getPluginService() {
    if (this.pluginServicePromise) {
      return this.pluginServicePromise;
    }

    this.pluginServicePromise = (async () => {
      const { PluginService } = await import('../plugin/plugin.service');
      const resolved = this.moduleRef.get<Pick<PluginService, 'findAll'>>(PluginService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('PluginService is not available');
      }

      return resolved;
    })();

    return this.pluginServicePromise;
  }
}

function readToolHealthStatus(persisted: {
  status?: string | null;
  healthStatus?: string | null;
} | undefined): ToolHealthStatus {
  if (persisted?.status !== 'online') {
    return 'unknown';
  }

  switch (persisted.healthStatus) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
    case 'error':
      return 'error';
    case 'unknown':
    case null:
    case undefined:
      return 'unknown';
    default:
      return 'unknown';
  }
}
