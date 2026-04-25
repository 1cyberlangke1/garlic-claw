import type { PluginActionName, PluginAvailableToolSummary, PluginCallContext, PluginParamSchema, PluginToolOutput, SkillLoadResult, ToolInfo, ToolOverview, ToolSourceActionResult, ToolSourceInfo, ToolSourceKind } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Tool } from 'ai';
import { z } from 'zod';
import { InvalidToolService } from '../invalid/invalid-tool.service';
import { createInvalidToolResult, isInvalidToolResult, stringifyInvalidToolInput } from '../invalid/invalid-tool-record';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeHostPluginDispatchService } from '../../runtime/host/runtime-host-plugin-dispatch.service';
import { isPluginEnabledForContext } from '../../runtime/kernel/runtime-plugin-hook-governance';
import { RuntimePluginGovernanceService } from '../../runtime/kernel/runtime-plugin-governance.service';
import { McpService } from '../mcp/mcp.service';
import { SkillToolService } from '../skill/skill-tool.service';
import { TodoToolService } from '../todo/todo-tool.service';
import { WebFetchToolService } from '../webfetch/webfetch-tool.service';

interface ExecutableToolDefinition {
  availableTool: PluginAvailableToolSummary;
  callName: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  internal?: boolean;
  parameters: Record<string, PluginParamSchema>;
  toModelOutput?: NonNullable<Tool['toModelOutput']>;
}

@Injectable()
export class ToolRegistryService {
  private readonly sourceEnabledOverrides = new Map<string, boolean>();
  private readonly toolEnabledOverrides = new Map<string, boolean>();

  constructor(
    private readonly mcpService: McpService,
    private readonly invalidToolService: InvalidToolService,
    private readonly todoToolService: TodoToolService,
    private readonly webFetchToolService: WebFetchToolService,
    private readonly skillToolService: SkillToolService,
    @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    @Inject(RuntimePluginGovernanceService) private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService,
  ) {}

  async listOverview(): Promise<ToolOverview> {
    const pluginSources = this.buildPluginSources();
    const mcpSources = this.mcpService.listToolSources();
    return { sources: [...pluginSources.map((entry) => entry.source), ...mcpSources.map((entry) => entry.source)], tools: [...pluginSources.flatMap((entry) => entry.tools), ...mcpSources.flatMap((entry) => entry.tools)] };
  }

  async runSourceAction(kind: ToolSourceKind, sourceId: string, action: PluginActionName): Promise<ToolSourceActionResult> {
    if (kind === 'mcp') {return this.mcpService.runGovernanceAction(sourceId, action as 'health-check' | 'reconnect' | 'reload');}
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
    const tools = [...await this.readEnabledTools(input), ...await this.readNativeTools(input), this.readInvalidToolDefinition()];
    if (tools.length <= 1) {return undefined;}
    const toolSet: Record<string, Tool> = {};
    for (const entry of tools) {toolSet[entry.callName] = this.buildExecutableTool(entry);}
    return toolSet;
  }

  async listAvailableTools(input: { context: PluginCallContext; excludedPluginId?: string }): Promise<PluginAvailableToolSummary[]> {
    return (await this.readEnabledTools(input)).filter((entry) => !entry.internal).map((entry) => entry.availableTool);
  }

  private buildExecutableTool(entry: ExecutableToolDefinition): Tool {
    const toolDefinition: Tool = { description: entry.description, execute: async (args: Record<string, unknown>) => {
      try { return await entry.execute(args); } catch (error) {
        if (entry.callName === this.invalidToolService.getToolName()) {throw error;}
        return createInvalidToolResult({ error: readToolExecutionErrorMessage(error), inputText: stringifyInvalidToolInput(args), phase: 'execute', tool: entry.callName });
      }
    }, inputSchema: paramSchemaToZod(entry.parameters) };
    toolDefinition.toModelOutput = async (event) => isInvalidToolResult(event.output)
      ? this.invalidToolService.toModelOutput({ ...event, output: event.output })
      : entry.toModelOutput
        ? entry.toModelOutput(event)
        : isPluginToolOutput(event.output)
          ? event.output.kind === 'tool:text' ? { type: 'text', value: event.output.value } : { type: 'json', value: event.output.value }
          : typeof event.output === 'string'
            ? { type: 'text', value: event.output }
            : { type: 'json', value: event.output ?? null };
    return toolDefinition;
  }

  private async readEnabledTools(input: { allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext; excludedPluginId?: string }): Promise<ExecutableToolDefinition[]> {
    return (await this.listOverview()).tools
      .filter((entry) => (!input.excludedPluginId || entry.pluginId !== input.excludedPluginId) && this.isToolEnabledForContext(entry, input.context) && (!input.allowedToolNames || input.allowedToolNames.includes(entry.callName)))
      .map((entry) => toExecutableToolDefinition(entry, input.context, input.assistantMessageId, this.mcpService, this.runtimeHostPluginDispatchService));
  }

  private async readNativeTools(input: { allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const skills = await this.skillToolService.listAvailableSkills();
    return [
      readNativeToolDefinition(input.allowedToolNames, this.todoToolService.getToolName(), this.todoToolService.buildToolDescription(), this.todoToolService.getToolParameters(), async (args) => this.todoToolService.updateSessionTodo({ sessionId: input.context.conversationId, todos: Array.isArray(args.todos) ? args.todos as never : [], userId: input.context.userId }), this.todoToolService.toModelOutput)!,
      readNativeToolDefinition(input.allowedToolNames, this.webFetchToolService.getToolName(), this.webFetchToolService.buildToolDescription(), this.webFetchToolService.getToolParameters(), async (args) => this.webFetchToolService.fetch({ url: String(args.url ?? ''), ...(typeof args.format === 'string' ? { format: args.format as 'text' | 'markdown' | 'html' } : {}), ...(typeof args.timeout === 'number' ? { timeout: args.timeout } : {}) }), this.webFetchToolService.toModelOutput)!,
      skills.length === 0 ? undefined : readNativeToolDefinition(input.allowedToolNames, 'skill', this.skillToolService.buildToolDescription(skills), this.skillToolService.getToolParameters(), async (args) => this.skillToolService.loadSkill(String(args.name ?? '')), ({ output }) => this.skillToolService.toModelOutput(output as SkillLoadResult), { sourceId: 'skill-catalog', sourceKind: 'skill' }),
    ].filter((entry): entry is ExecutableToolDefinition => Boolean(entry));
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
    const plugin = this.runtimePluginGovernanceService.listPlugins().find((entry) => entry.pluginId === tool.pluginId);
    if (!plugin) {return false;}
    const sourceEnabled = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`) ?? isPluginEnabledForContext({ conversations: { ...(plugin.conversationScopes ?? {}) }, defaultEnabled: plugin.defaultEnabled }, context);
    return sourceEnabled && (this.toolEnabledOverrides.get(tool.toolId) ?? true);
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
