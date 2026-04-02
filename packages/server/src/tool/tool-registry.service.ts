import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { Tool } from 'ai';
import type {
  PluginAvailableToolSummary,
  PluginCallContext,
  ToolOverview,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { McpToolProvider } from './mcp-tool.provider';
import { PluginToolProvider } from './plugin-tool.provider';
import { SkillToolProvider } from './skill-tool.provider';
import {
  buildAvailableToolSummary,
  buildToolOverview,
  normalizeToolRecord,
} from './tool-registry.helpers';
import { buildAiToolSetFromResolvedTools } from './tool-registry-execution.helpers';
import { ToolSettingsService } from './tool-settings.service';
import type {
  ResolvedToolRecord,
  ToolFilterInput,
  ToolProvider,
  ToolProviderState,
  ToolProviderTool,
  ToolRecord,
  ToolSourceDescriptor,
} from './tool.types';

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly settings: ToolSettingsService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    @Inject(forwardRef(() => PluginToolProvider))
    private readonly pluginToolProvider: PluginToolProvider,
    @Inject(forwardRef(() => McpToolProvider))
    private readonly mcpToolProvider: McpToolProvider,
    @Inject(forwardRef(() => SkillToolProvider))
    private readonly skillToolProvider?: SkillToolProvider,
  ) {}

  async listTools(input: ToolFilterInput): Promise<ToolRecord[]> {
    return (await this.resolveTools(input)).map((entry) => entry.record);
  }

  async listAvailableToolSummaries(input: ToolFilterInput) {
    return (await this.prepareToolSelection(input)).availableTools;
  }

  async listSources(context?: PluginCallContext): Promise<ToolSourceInfo[]> {
    return (await this.listOverview(context)).sources;
  }

  async listOverview(context?: PluginCallContext): Promise<ToolOverview> {
    return this.buildOverviewFromProviderState(
      await this.collectProviderState(context),
    );
  }

  async setSourceEnabled(
    kind: ToolSourceDescriptor['kind'],
    id: string,
    enabled: boolean,
  ) {
    const providerState = await this.collectProviderState();
    const existing = this.buildOverviewFromProviderState(providerState).sources.find((source) =>
      source.kind === kind && source.id === id);
    if (!existing) {
      throw new NotFoundException(`Tool source not found: ${kind}:${id}`);
    }

    this.settings.setSourceEnabled(kind, id, enabled);
    const updated = this.buildOverviewFromProviderState(providerState).sources.find((source) =>
      source.kind === kind && source.id === id);
    if (!updated) {
      throw new NotFoundException(`Tool source not found after update: ${kind}:${id}`);
    }

    return updated;
  }

  async setToolEnabled(toolId: string, enabled: boolean) {
    const providerState = await this.collectProviderState();
    const existing = this.buildOverviewFromProviderState(providerState).tools.find((toolInfo) =>
      toolInfo.toolId === toolId);
    if (!existing) {
      throw new NotFoundException(`Tool not found: ${toolId}`);
    }

    this.settings.setToolEnabled(toolId, enabled);
    const updated = this.buildOverviewFromProviderState(providerState).tools.find((toolInfo) =>
      toolInfo.toolId === toolId);
    if (!updated) {
      throw new NotFoundException(`Tool not found after update: ${toolId}`);
    }

    return updated;
  }

  private buildOverviewFromProviderState(providedState: Array<{
    provider: ToolProvider;
    sources: ToolProviderState['sources'];
    tools: ToolProviderState['tools'];
  }>): ToolOverview {
    return buildToolOverview({
      sources: providedState.flatMap(({ sources }) =>
        sources.map((source) => this.applySourceOverrides(source))),
      tools: providedState.flatMap(({ provider, tools }) =>
        tools.map((raw) => this.toResolvedToolRecord(provider, raw).record)),
    });
  }

  async buildToolSet(input: ToolFilterInput): Promise<Record<string, Tool> | undefined> {
    return (await this.prepareToolSelection(input)).buildToolSet({
      context: input.context,
      allowedToolNames: input.allowedToolNames,
    });
  }

  private async resolveTools(input: ToolFilterInput): Promise<ResolvedToolRecord[]> {
    return (await this.resolveAllTools(input.context))
      .filter((entry) => this.matchesFilters(entry.record, input));
  }

  async prepareToolSelection(input: ToolFilterInput): Promise<{
    availableTools: PluginAvailableToolSummary[];
    buildToolSet: (options: {
      context: PluginCallContext;
      allowedToolNames?: string[];
    }) => Record<string, Tool> | undefined;
  }> {
    const resolvedTools = await this.resolveTools(input);

    return {
      availableTools: resolvedTools.map((entry) => buildAvailableToolSummary(entry.record)),
      buildToolSet: (options) => buildAiToolSetFromResolvedTools({
        resolvedTools,
        context: options.context,
        allowedToolNames: options.allowedToolNames,
        pluginRuntime: this.pluginRuntime,
      }),
    };
  }

  private matchesFilters(record: ToolRecord, input: ToolFilterInput): boolean {
    if (!record.enabled || !record.source.enabled) {
      return false;
    }

    if (input.allowedToolNames && !input.allowedToolNames.includes(record.callName)) {
      return false;
    }

    if (input.excludedSources?.some((source) =>
      source.kind === record.source.kind && source.id === record.source.id
    )) {
      return false;
    }

    return true;
  }

  private listProviders(): ToolProvider[] {
    return [
      this.pluginToolProvider,
      this.mcpToolProvider,
      ...(this.skillToolProvider ? [this.skillToolProvider] : []),
    ];
  }

  private async resolveAllTools(context?: PluginCallContext): Promise<ResolvedToolRecord[]> {
    const providers = this.listProviders();
    const providedTools = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        tools: await Promise.resolve(provider.listTools(context)),
      })),
    );

    return providedTools.flatMap(({ provider, tools }) =>
      tools.map((raw) => this.toResolvedToolRecord(provider, raw)));
  }

  private async collectProviderState(context?: PluginCallContext): Promise<Array<{
    provider: ToolProvider;
    sources: ToolProviderState['sources'];
    tools: ToolProviderState['tools'];
  }>> {
    const providers = this.listProviders();

    return Promise.all(
      providers.map(async (provider) => {
        if (provider.collectState) {
          const state = await Promise.resolve(provider.collectState(context));

          return {
            provider,
            sources: state.sources,
            tools: state.tools,
          };
        }

        const [sources, tools] = await Promise.all([
          Promise.resolve(provider.listSources(context)),
          Promise.resolve(provider.listTools(context)),
        ]);

        return {
          provider,
          sources,
          tools,
        };
      }),
    );
  }

  private toResolvedToolRecord(
    provider: ToolProvider,
    raw: ToolProviderTool,
  ): ResolvedToolRecord {
    const normalized = normalizeToolRecord(raw);
    const sourceEnabled = this.settings.getSourceEnabled(
      normalized.source.kind,
      normalized.source.id,
    ) ?? normalized.source.enabled;
    const persistedToolEnabled = this.settings.getToolEnabled(normalized.toolId);
    const toolEnabled = (persistedToolEnabled ?? normalized.enabled) && sourceEnabled;

    return {
      provider,
      raw,
      record: {
        ...normalized,
        enabled: toolEnabled,
        source: {
          ...normalized.source,
          enabled: sourceEnabled,
        },
      },
    };
  }

  private applySourceOverrides(source: ToolSourceDescriptor): ToolSourceDescriptor {
    const enabled = this.settings.getSourceEnabled(source.kind, source.id)
      ?? source.enabled
      ?? true;

    return {
      ...source,
      enabled,
      health: source.health ?? 'unknown',
      lastError: source.lastError ?? null,
      lastCheckedAt: source.lastCheckedAt ?? null,
    };
  }
}
