import type { JsonValue, PluginActionName, PluginAvailableToolSummary, PluginCallContext, PluginParamSchema, PluginToolOutput, SkillLoadResult, ToolInfo, ToolOverview, ToolSourceActionResult, ToolSourceInfo, ToolSourceKind } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { Tool } from 'ai';
import { z } from 'zod';
import { BashToolService } from '../bash/bash-tool.service';
import { EditToolService } from '../edit/edit-tool.service';
import { GlobToolService } from '../glob/glob-tool.service';
import { GrepToolService } from '../grep/grep-tool.service';
import { InvalidToolService } from '../invalid/invalid-tool.service';
import { createInvalidToolResult, isInvalidToolResult, stringifyInvalidToolInput } from '../invalid/invalid-tool-record';
import { ReadToolService } from '../read/read-tool.service';
import { renderRuntimeCommandTextOutput } from '../runtime/runtime-command-output';
import { RuntimeToolBackendService } from '../runtime/runtime-tool-backend.service';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeToolPermissionService } from '../runtime/runtime-tool-permission.service';
import { RuntimeToolsSettingsService } from '../runtime/runtime-tools-settings.service';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeHostPluginDispatchService } from '../../runtime/host/runtime-host-plugin-dispatch.service';
import { isPluginEnabledForContext } from '../../runtime/kernel/runtime-plugin-hook-governance';
import { RuntimePluginGovernanceService } from '../../runtime/kernel/runtime-plugin-governance.service';
import { McpService } from '../mcp/mcp.service';
import { SkillToolService } from '../skill/skill-tool.service';
import { SubagentToolService } from '../subagent/subagent-tool.service';
import { TodoToolService } from '../todo/todo-tool.service';
import { WebFetchToolService } from '../webfetch/webfetch-tool.service';
import { WriteToolService } from '../write/write-tool.service';

interface ExecutableToolDefinition {
  availableTool: PluginAvailableToolSummary;
  callName: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  internal?: boolean;
  parameters: Record<string, PluginParamSchema>;
  sourceId?: string;
  sourceKind?: ToolSourceKind;
  toModelOutput?: NonNullable<Tool['toModelOutput']>;
  wrapExecutionOutput?: boolean;
}

@Injectable()
export class ToolRegistryService {
  private readonly sourceEnabledOverrides = new Map<string, boolean>();
  private readonly toolEnabledOverrides = new Map<string, boolean>();

  constructor(
    private readonly bashToolService: BashToolService,
    private readonly editToolService: EditToolService,
    private readonly globToolService: GlobToolService,
    private readonly grepToolService: GrepToolService,
    private readonly mcpService: McpService,
    private readonly invalidToolService: InvalidToolService,
    private readonly readToolService: ReadToolService,
    private readonly runtimeToolBackendService: RuntimeToolBackendService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
    private readonly runtimeToolsSettingsService: RuntimeToolsSettingsService,
    @Inject(forwardRef(() => SubagentToolService)) private readonly subagentToolService: SubagentToolService,
    private readonly todoToolService: TodoToolService,
    private readonly webFetchToolService: WebFetchToolService,
    private readonly writeToolService: WriteToolService,
    private readonly skillToolService: SkillToolService,
    @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    @Inject(RuntimePluginGovernanceService) private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService,
  ) {}

  async listOverview(): Promise<ToolOverview> {
    const pluginSources = this.buildPluginSources();
    const internalSources = this.buildInternalSources();
    const mcpSources = this.mcpService.listToolSources();
    return {
      sources: [
        ...pluginSources.map((entry) => entry.source),
        ...internalSources.map((entry) => entry.source),
        ...mcpSources.map((entry) => entry.source),
      ],
      tools: [
        ...pluginSources.flatMap((entry) => entry.tools),
        ...internalSources.flatMap((entry) => entry.tools),
        ...mcpSources.flatMap((entry) => entry.tools),
      ],
    };
  }

  async runSourceAction(kind: ToolSourceKind, sourceId: string, action: PluginActionName): Promise<ToolSourceActionResult> {
    if (kind === 'mcp') {return this.mcpService.runGovernanceAction(sourceId, action as 'health-check' | 'reconnect' | 'reload');}
    if (kind === 'internal') {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    if (kind !== 'plugin') {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    const source = readToolSource(await this.listOverview(), kind, sourceId);
    if (!(source.supportedActions ?? []).includes(action)) {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    const result = await this.runtimePluginGovernanceService.runPluginAction({ action, pluginId: sourceId });
    return { accepted: result.accepted, action: result.action, sourceKind: source.kind, sourceId: result.pluginId, message: result.message };
  }

  async setSourceEnabled(kind: ToolSourceKind, sourceId: string, enabled: boolean): Promise<ToolSourceInfo> {
    if (kind === 'mcp') {
      await this.mcpService.setServerEnabled(sourceId, enabled);
      return readToolSource(await this.listOverview(), kind, sourceId);
    }
    if (kind === 'internal') {
      readToolSource(await this.listOverview(), kind, sourceId);
      this.sourceEnabledOverrides.set(`${kind}:${sourceId}`, enabled);
      return readToolSource(await this.listOverview(), kind, sourceId);
    }
    readToolSource(await this.listOverview(), kind, sourceId);
    this.sourceEnabledOverrides.set(`${kind}:${sourceId}`, enabled);
    return readToolSource(await this.listOverview(), kind, sourceId);
  }

  async setToolEnabled(toolId: string, enabled: boolean): Promise<ToolInfo> {
    readTool(await this.listOverview(), toolId);
    this.toolEnabledOverrides.set(toolId, enabled);
    return readTool(await this.listOverview(), toolId);
  }

  async buildToolSet(input: { abortSignal?: AbortSignal; allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext; excludedPluginId?: string }): Promise<Record<string, Tool> | undefined> {
    const tools = [
      ...await this.readEnabledSourceTools(input),
      ...await this.readInternalTools(input),
      ...await this.readNativeTools(input),
      this.readInvalidToolDefinition(),
    ];
    if (tools.length <= 1) {return undefined;}
    const toolSet: Record<string, Tool> = {};
    for (const entry of tools) {toolSet[entry.callName] = this.buildExecutableTool(entry);}
    return toolSet;
  }

  async listAvailableTools(input: { context: PluginCallContext; excludedPluginId?: string }): Promise<PluginAvailableToolSummary[]> {
    return [
      ...(await this.readEnabledSourceTools(input)),
      ...(await this.readInternalTools({ context: input.context })),
    ].filter((entry) => !entry.internal).map((entry) => entry.availableTool);
  }

  async executeRegisteredTool(input: {
    context: PluginCallContext;
    params: Record<string, unknown>;
    sourceId: string;
    sourceKind: ToolSourceKind;
    toolName: string;
  }): Promise<unknown> {
    if (input.sourceKind === 'plugin') {
      return this.runtimeHostPluginDispatchService.executeTool({
        context: input.context,
        params: input.params as never,
        pluginId: input.sourceId,
        toolName: input.toolName,
      });
    }
    if (input.sourceKind === 'mcp') {
      return this.mcpService.callTool({
        arguments: input.params,
        serverName: input.sourceId,
        toolName: input.toolName,
      });
    }
    if (input.sourceKind !== 'internal') {
      throw new BadRequestException(`暂不支持执行工具源 ${input.sourceKind}:${input.sourceId}`);
    }
    const definition = (await this.readInternalTools({ context: input.context }))
      .find((entry) => entry.sourceId === input.sourceId && entry.callName === input.toolName);
    if (!definition) {
      throw new NotFoundException(`Tool not found: ${input.sourceKind}:${input.sourceId}:${input.toolName}`);
    }
    return definition.execute(input.params);
  }

  private buildExecutableTool(entry: ExecutableToolDefinition): Tool {
    const toolDefinition: Tool = { description: entry.description, execute: async (args: Record<string, unknown>) => {
      try {
        const output = await entry.execute(args);
        return entry.wrapExecutionOutput ? normalizeToolExecutionOutput(output, entry.toModelOutput) : output;
      } catch (error) {
        if (entry.callName === this.invalidToolService.getToolName()) {throw error;}
        return createInvalidToolResult({ error: readToolExecutionErrorMessage(error), inputText: stringifyInvalidToolInput(args), phase: 'execute', tool: entry.callName });
      }
    }, inputSchema: paramSchemaToZod(entry.parameters) };
    toolDefinition.toModelOutput = async (event) => isInvalidToolResult(event.output)
      ? this.invalidToolService.toModelOutput({ ...event, output: event.output })
      : isPluginToolOutput(event.output)
        ? event.output.kind === 'tool:text' ? { type: 'text', value: event.output.value } : { type: 'json', value: event.output.value }
        : entry.toModelOutput
          ? entry.toModelOutput(event)
          : typeof event.output === 'string'
            ? { type: 'text', value: event.output }
            : { type: 'json', value: event.output ?? null };
    return toolDefinition;
  }

  private async readEnabledSourceTools(input: { allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext; excludedPluginId?: string }): Promise<ExecutableToolDefinition[]> {
    return (await this.listOverview()).tools
      .filter((entry) => entry.sourceKind !== 'internal')
      .filter((entry) => (!input.excludedPluginId || entry.pluginId !== input.excludedPluginId) && this.isToolEnabledForContext(entry, input.context) && (!input.allowedToolNames || input.allowedToolNames.includes(entry.callName)))
      .map((entry) => toExecutableToolDefinition(entry, input.context, input.assistantMessageId, this.mcpService, this.runtimeHostPluginDispatchService));
  }

  private async readNativeTools(input: { allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const skills = await this.skillToolService.listAvailableSkills();
    const tools = [
      readNativeToolDefinition(input.allowedToolNames, this.todoToolService.getToolName(), this.todoToolService.buildToolDescription(), this.todoToolService.getToolParameters(), async (args) => this.todoToolService.updateSessionTodo({ sessionId: input.context.conversationId, todos: Array.isArray(args.todos) ? args.todos as never : [], userId: input.context.userId }), this.todoToolService.toModelOutput),
      readNativeToolDefinition(input.allowedToolNames, this.webFetchToolService.getToolName(), this.webFetchToolService.buildToolDescription(), this.webFetchToolService.getToolParameters(), async (args) => this.webFetchToolService.fetch({ url: String(args.url ?? ''), ...(typeof args.format === 'string' ? { format: args.format as 'text' | 'markdown' | 'html' } : {}), ...(typeof args.timeout === 'number' ? { timeout: args.timeout } : {}) }), this.webFetchToolService.toModelOutput),
      skills.length === 0 ? undefined : readNativeToolDefinition(input.allowedToolNames, 'skill', this.skillToolService.buildToolDescription(skills), this.skillToolService.getToolParameters(), async (args) => this.skillToolService.loadSkill(String(args.name ?? '')), ({ output }) => this.skillToolService.toModelOutput(output as SkillLoadResult), { sourceId: 'skill-catalog', sourceKind: 'skill' }),
    ];
    return tools.filter((entry): entry is ExecutableToolDefinition => Boolean(entry));
  }

  private readInvalidToolDefinition(): ExecutableToolDefinition {
    const toolName = this.invalidToolService.getToolName();
    return { availableTool: { callName: toolName, description: this.invalidToolService.buildToolDescription(), name: toolName, parameters: this.invalidToolService.getToolParameters() }, callName: toolName, description: this.invalidToolService.buildToolDescription(), execute: async (args) => this.invalidToolService.execute({ error: String(args.error ?? ''), ...(typeof args.inputText === 'string' ? { inputText: args.inputText } : {}), phase: readInvalidToolPhase(args.phase), tool: String(args.tool ?? '') }), internal: true, parameters: this.invalidToolService.getToolParameters(), toModelOutput: this.invalidToolService.toModelOutput };
  }

  private buildPluginSources(): Array<{ source: ToolSourceInfo; tools: ToolInfo[] }> {
    return this.runtimePluginGovernanceService.listPlugins().filter((plugin) => plugin.connected && plugin.manifest.tools.length > 0).map((plugin) => {
      const sourceEnabled = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`) ?? plugin.defaultEnabled;
      const source: ToolSourceInfo = { kind: 'plugin', id: plugin.pluginId, label: plugin.manifest.name, enabled: sourceEnabled, health: plugin.connected ? 'healthy' : 'unknown', lastError: null, lastCheckedAt: plugin.lastSeenAt, totalTools: plugin.manifest.tools.length, enabledTools: 0, pluginId: plugin.pluginId, runtimeKind: plugin.manifest.runtime, supportedActions: this.runtimePluginGovernanceService.listSupportedActions(plugin.pluginId) as PluginActionName[] };
      const tools = plugin.manifest.tools.map((tool) => createPluginToolInfo(plugin, source, tool, this.toolEnabledOverrides.get(`plugin:${plugin.pluginId}:${tool.name}`) ?? sourceEnabled));
      source.enabledTools = tools.filter((tool) => tool.enabled).length;
      return { source, tools };
    });
  }

  private isToolEnabledForContext(tool: ToolInfo, context: PluginCallContext): boolean {
    if (tool.sourceKind === 'mcp' || tool.sourceKind === 'skill') {return tool.enabled;}
    if (tool.sourceKind === 'internal') {
      const sourceEnabled = this.sourceEnabledOverrides.get(`internal:${tool.sourceId}`) ?? true;
      return sourceEnabled && (this.toolEnabledOverrides.get(tool.toolId) ?? true);
    }
    const plugin = this.runtimePluginGovernanceService.listPlugins().find((entry) => entry.pluginId === tool.pluginId);
    if (!plugin) {return false;}
    const sourceEnabled = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`) ?? isPluginEnabledForContext({ conversations: { ...(plugin.conversationScopes ?? {}) }, defaultEnabled: plugin.defaultEnabled }, context);
    return sourceEnabled && (this.toolEnabledOverrides.get(tool.toolId) ?? true);
  }

  private buildInternalSources(): Array<{ source: ToolSourceInfo; tools: ToolInfo[] }> {
    const entries = [
      createInternalSourceEntry(this.runtimeToolsSettingsService.getSourceId(), 'Runtime Tools', this.readInternalRuntimeToolInfos(), this.sourceEnabledOverrides, this.toolEnabledOverrides),
      createInternalSourceEntry(this.subagentToolService.getSourceId(), this.subagentToolService.getSourceLabel(), this.subagentToolService.getToolInfos(), this.sourceEnabledOverrides, this.toolEnabledOverrides),
    ].filter((entry): entry is { source: ToolSourceInfo; tools: ToolInfo[] } => entry !== null);
    return entries.map((entry) => ({
      ...entry,
      source: {
        ...entry.source,
        enabledTools: entry.tools.filter((tool) => tool.enabled).length,
      },
    }));
  }

  private readInternalRuntimeToolInfos(): ToolInfo[] {
    const sourceId = this.runtimeToolsSettingsService.getSourceId();
    return [
      createInternalToolInfo(sourceId, this.bashToolService.getToolName(), this.bashToolService.buildToolDescription(), this.bashToolService.getToolParameters()),
      createInternalToolInfo(sourceId, this.readToolService.getToolName(), this.readToolService.buildToolDescription(), this.readToolService.getToolParameters()),
      createInternalToolInfo(sourceId, this.globToolService.getToolName(), this.globToolService.buildToolDescription(), this.globToolService.getToolParameters()),
      createInternalToolInfo(sourceId, this.grepToolService.getToolName(), this.grepToolService.buildToolDescription(), this.grepToolService.getToolParameters()),
      createInternalToolInfo(sourceId, this.writeToolService.getToolName(), this.writeToolService.buildToolDescription(), this.writeToolService.getToolParameters()),
      createInternalToolInfo(sourceId, this.editToolService.getToolName(), this.editToolService.buildToolDescription(), this.editToolService.getToolParameters()),
    ];
  }

  private async readInternalTools(input: { allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    return [
      ...await this.readInternalRuntimeTools(input),
      ...await this.readInternalSubagentTools(input),
    ];
  }

  private async readInternalRuntimeTools(input: { allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const sourceId = this.runtimeToolsSettingsService.getSourceId();
    const availableTools = this.readInternalRuntimeToolInfos()
      .filter((entry) => this.isToolEnabledForContext(entry, input.context))
      .filter((entry) => !input.allowedToolNames || input.allowedToolNames.includes(entry.callName));
    const configuredShellBackend = this.runtimeToolsSettingsService.readConfiguredShellBackend();
    const configuredFilesystemBackend = this.runtimeToolBackendService.getFilesystemBackendKind();
    const bashOutputOptions = this.runtimeToolsSettingsService.readBashOutputOptions();
    return availableTools.map((entry) => ({
      availableTool: {
        callName: entry.callName,
        description: entry.description,
        name: entry.name,
        parameters: entry.parameters,
        sourceId,
        sourceKind: 'internal' as const,
      },
      callName: entry.callName,
      description: entry.description,
      execute: async (args) => {
        const assistantMessageId = input.assistantMessageId;
        if (entry.callName === 'bash') {
          const runtimeInput = this.bashToolService.readInput(args, input.context.conversationId ?? undefined, configuredShellBackend);
          await this.reviewRuntimeToolAccess(input, assistantMessageId, entry.callName, await this.bashToolService.readRuntimeAccess(runtimeInput));
          return this.bashToolService.execute(runtimeInput);
        }
        if (entry.callName === 'read') {
          const runtimeInput = this.readToolService.readInput(args, input.context.conversationId ?? undefined, configuredFilesystemBackend, assistantMessageId);
          await this.reviewRuntimeToolAccess(input, assistantMessageId, entry.callName, this.readToolService.readRuntimeAccess(runtimeInput));
          return this.readToolService.execute(runtimeInput);
        }
        if (entry.callName === 'glob') {
          const runtimeInput = this.globToolService.readInput(args, input.context.conversationId ?? undefined, configuredFilesystemBackend);
          await this.reviewRuntimeToolAccess(input, assistantMessageId, entry.callName, this.globToolService.readRuntimeAccess(runtimeInput));
          return this.globToolService.execute(runtimeInput);
        }
        if (entry.callName === 'grep') {
          const runtimeInput = this.grepToolService.readInput(args, input.context.conversationId ?? undefined, configuredFilesystemBackend);
          await this.reviewRuntimeToolAccess(input, assistantMessageId, entry.callName, this.grepToolService.readRuntimeAccess(runtimeInput));
          return this.grepToolService.execute(runtimeInput);
        }
        if (entry.callName === 'write') {
          const runtimeInput = this.writeToolService.readInput(args, input.context.conversationId ?? undefined, configuredFilesystemBackend);
          await this.reviewRuntimeToolAccess(input, assistantMessageId, entry.callName, this.writeToolService.readRuntimeAccess(runtimeInput));
          return this.writeToolService.execute(runtimeInput);
        }
        const runtimeInput = this.editToolService.readInput(args, input.context.conversationId ?? undefined, configuredFilesystemBackend);
        await this.reviewRuntimeToolAccess(input, assistantMessageId, entry.callName, this.editToolService.readRuntimeAccess(runtimeInput));
        return this.editToolService.execute(runtimeInput);
      },
      parameters: entry.parameters,
      sourceId,
      sourceKind: 'internal',
      wrapExecutionOutput: true,
      ...(entry.callName === 'bash'
        ? {
            toModelOutput: async ({ output }) => ({
              type: 'text',
              value: renderRuntimeCommandTextOutput(output, bashOutputOptions),
            }),
          }
        : {
            toModelOutput: entry.callName === 'read'
              ? this.readToolService.toModelOutput
              : entry.callName === 'glob'
                ? this.globToolService.toModelOutput
                : entry.callName === 'grep'
                  ? this.grepToolService.toModelOutput
                  : entry.callName === 'write'
                    ? this.writeToolService.toModelOutput
                    : this.editToolService.toModelOutput,
          }),
    }));
  }

  private async readInternalSubagentTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const sourceId = this.subagentToolService.getSourceId();
    return this.subagentToolService.getToolInfos()
      .filter((entry) => this.isToolEnabledForContext(entry, input.context))
      .filter((entry) => !input.allowedToolNames || input.allowedToolNames.includes(entry.callName))
      .map((entry) => ({
        availableTool: {
          callName: entry.callName,
          description: entry.description,
          name: entry.name,
          parameters: entry.parameters,
          sourceId,
          sourceKind: 'internal',
        },
        callName: entry.callName,
        description: entry.description,
        execute: async (args) => this.subagentToolService.executeTool(entry.callName, args, input.context),
        parameters: entry.parameters,
        sourceId,
        sourceKind: 'internal',
      }));
  }

  private async reviewRuntimeToolAccess(
    input: { abortSignal?: AbortSignal; context: PluginCallContext },
    assistantMessageId: string | undefined,
    toolName: string,
    access: RuntimeToolAccessRequest,
  ): Promise<void> {
    await this.runtimeToolPermissionService.review({
      abortSignal: input.abortSignal,
      backend: this.runtimeToolBackendService.getBackendDescriptor(access.role, access.backendKind),
      conversationId: input.context.conversationId,
      ...(assistantMessageId ? { messageId: assistantMessageId } : {}),
      ...(access.metadata !== undefined ? { metadata: access.metadata as JsonValue } : {}),
      requiredOperations: access.requiredOperations,
      summary: access.summary,
      toolName,
    });
  }
}

function readNativeToolDefinition(
  allowedToolNames: string[] | undefined,
  toolName: string,
  description: string,
  parameters: Record<string, PluginParamSchema>,
  execute: (args: Record<string, unknown>) => Promise<unknown>,
  toModelOutput?: NonNullable<Tool['toModelOutput']>,
  source?: Pick<PluginAvailableToolSummary, 'sourceId' | 'sourceKind'>,
): ExecutableToolDefinition | undefined {
  if (allowedToolNames && !allowedToolNames.includes(toolName)) {return undefined;}
  return { availableTool: { callName: toolName, description, name: toolName, parameters, ...(source ?? {}) }, callName: toolName, description, execute, parameters, ...(toModelOutput ? { toModelOutput } : {}) };
}

function createInternalToolInfo(
  sourceId: string,
  toolName: string,
  description: string,
  parameters: Record<string, PluginParamSchema>,
): ToolInfo {
  return {
    callName: toolName,
    description,
    enabled: true,
    health: 'healthy' as const,
    lastCheckedAt: null,
    lastError: null,
    name: toolName,
    parameters,
    sourceId,
    sourceKind: 'internal' as const,
    sourceLabel: 'Runtime Tools',
    toolId: `internal:${sourceId}:${toolName}`,
  };
}

async function normalizeToolExecutionOutput(
  output: unknown,
  toModelOutput?: NonNullable<Tool['toModelOutput']>,
): Promise<unknown> {
  if (isPluginToolOutput(output) || isInvalidToolResult(output)) {
    return output;
  }
  if (typeof output === 'string') {
    return { kind: 'tool:text', value: output } satisfies PluginToolOutput;
  }
  if (!toModelOutput) {
    return output;
  }
  const modelOutput = await toModelOutput({ input: {}, output, toolCallId: '' });
  if (modelOutput.type !== 'json' && modelOutput.type !== 'text') {
    return output;
  }
  if (modelOutput.type === 'json') {
    return createWrappedToolOutput('tool:json', modelOutput.value as JsonValue, output);
  }
  return createWrappedToolOutput('tool:text', modelOutput.value, output);
}

function createWrappedToolOutput(
  kind: PluginToolOutput['kind'],
  value: JsonValue | string,
  output: unknown,
): PluginToolOutput {
  const record = typeof output === 'object' && output !== null && !Array.isArray(output)
    ? output as Record<string, JsonValue>
    : null;
  return {
    ...(record ?? {}),
    ...(output !== null && output !== undefined ? { data: output as JsonValue } : {}),
    kind,
    value,
  } as PluginToolOutput;
}

function createInternalSourceEntry(
  sourceId: string,
  label: string,
  tools: ToolInfo[],
  sourceEnabledOverrides: Map<string, boolean>,
  toolEnabledOverrides: Map<string, boolean>,
): { source: ToolSourceInfo; tools: ToolInfo[] } | null {
  if (tools.length === 0) {
    return null;
  }
  const sourceEnabled = sourceEnabledOverrides.get(`internal:${sourceId}`) ?? true;
  return {
    source: {
      enabled: sourceEnabled,
      enabledTools: 0,
      health: 'healthy',
      id: sourceId,
      kind: 'internal',
      label,
      lastCheckedAt: null,
      lastError: null,
      supportedActions: [],
      totalTools: tools.length,
    },
    tools: tools.map((tool) => ({
      ...tool,
      enabled: sourceEnabled && (toolEnabledOverrides.get(tool.toolId) ?? true),
    })),
  };
}

function createPluginToolInfo(plugin: RegisteredPluginRecord, source: ToolSourceInfo, tool: RegisteredPluginRecord['manifest']['tools'][number], enabled: boolean) {
  return { toolId: `plugin:${plugin.pluginId}:${tool.name}`, name: tool.name, callName: tool.name, description: tool.description, parameters: tool.parameters, enabled, sourceKind: 'plugin' as const, sourceId: plugin.pluginId, sourceLabel: plugin.manifest.name, health: source.health, lastError: source.lastError, lastCheckedAt: source.lastCheckedAt, pluginId: plugin.pluginId, runtimeKind: plugin.manifest.runtime } satisfies ToolInfo;
}

function toExecutableToolDefinition(entry: ToolInfo, context: PluginCallContext, assistantMessageId: string | undefined, mcpService: McpService, runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService): ExecutableToolDefinition {
  const toolContext = assistantMessageId ? { ...context, metadata: { ...(context.metadata ?? {}), assistantMessageId } } : context;
  return { availableTool: { callName: entry.callName, description: entry.description, name: entry.name, parameters: entry.parameters, pluginId: entry.pluginId, runtimeKind: entry.runtimeKind, sourceId: entry.sourceId, sourceKind: entry.sourceKind }, callName: entry.callName, description: entry.description, execute: async (args) => entry.sourceKind === 'mcp' ? mcpService.callTool({ arguments: args, serverName: entry.sourceId, toolName: entry.name }) : runtimeHostPluginDispatchService.executeTool({ context: toolContext, params: args as never, pluginId: entry.pluginId ?? entry.sourceId, toolName: entry.name }), parameters: entry.parameters };
}

function readToolSource(overview: ToolOverview, kind: ToolSourceKind, sourceId: string): ToolSourceInfo {
  const source = overview.sources.find((entry) => entry.kind === kind && entry.id === sourceId);
  if (!source) {throw new NotFoundException(`Tool source not found: ${kind}:${sourceId}`);}
  return source;
}

function readTool(overview: ToolOverview, toolId: string): ToolInfo {
  const tool = overview.tools.find((entry) => entry.toolId === toolId);
  if (!tool) {throw new NotFoundException(`Tool not found: ${toolId}`);}
  return tool;
}

function paramSchemaToZod(params: Record<string, PluginParamSchema>) {
  const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]));
  return z.object(Object.fromEntries(Object.entries(params).map(([key, schema]) => {
    const next = schema.type === 'number' ? z.number() : schema.type === 'boolean' ? z.boolean() : schema.type === 'array' ? z.array(jsonValueSchema) : schema.type === 'object' ? z.record(z.string(), jsonValueSchema) : z.string();
    return [key, schema.required === true ? next : next.optional()];
  })));
}

function readToolExecutionErrorMessage(error: unknown): string {
  if (error instanceof Error) {return error.message;}
  if (typeof error === 'string') {return error;}
  try { return JSON.stringify(error); } catch { return '工具执行失败'; }
}

function readInvalidToolPhase(value: unknown): 'execute' | 'resolve' | 'validate' { return value === 'resolve' || value === 'validate' || value === 'execute' ? value : 'execute'; }
function isPluginToolOutput(value: unknown): value is PluginToolOutput { return !!value && typeof value === 'object' && !Array.isArray(value) && (((value as Record<string, unknown>).kind === 'tool:text' && typeof (value as Record<string, unknown>).value === 'string') || (value as Record<string, unknown>).kind === 'tool:json'); }
