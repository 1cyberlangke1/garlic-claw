import type {
  JsonObject,
  PluginActionName,
  PluginAvailableToolSummary,
  PluginCallContext,
  PluginParamSchema,
  SkillLoadResult,
  ToolInfo,
  ToolOverview,
  ToolSourceActionResult,
  ToolSourceInfo,
  ToolSourceKind,
} from '@garlic-claw/shared';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Tool } from 'ai';
import { z } from 'zod';
import { InvalidToolService } from '../invalid/invalid-tool.service';
import { createInvalidToolResult, isInvalidToolResult, stringifyInvalidToolInput } from '../invalid/invalid-tool-record';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeHostPluginDispatchService } from '../../runtime/host/runtime-host-plugin-dispatch.service';
import { isPluginEnabledForContext } from '../../runtime/kernel/runtime-plugin-hook-governance';
import { RuntimePluginGovernanceService } from '../../runtime/kernel/runtime-plugin-governance.service';
import { McpService } from '../mcp/mcp.service';
import { EditToolService } from '../edit/edit-tool.service';
import { SkillToolService } from '../skill/skill-tool.service';
import { TaskToolService } from '../task/task-tool.service';
import { TodoToolService } from '../todo/todo-tool.service';
import { WebFetchToolService } from '../webfetch/webfetch-tool.service';
import { BashToolService } from '../bash/bash-tool.service';
import { ReadToolService } from '../read/read-tool.service';
import { GlobToolService } from '../glob/glob-tool.service';
import { GrepToolService } from '../grep/grep-tool.service';
import { WriteToolService } from '../write/write-tool.service';
import { RuntimeToolBackendService } from '../runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../runtime/runtime-tool-permission.service';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';

interface ExecutableToolDefinition {
  availableTool: PluginAvailableToolSummary;
  callName: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  internal?: boolean;
  parameters: Record<string, PluginParamSchema>;
  runtimePermission?: RuntimePermissionDefinition;
  toModelOutput?: NonNullable<Tool['toModelOutput']>;
}

interface RuntimePermissionDefinition {
  readAccess: (args: Record<string, unknown>, context: PluginCallContext) => RuntimeToolAccessRequest;
}

@Injectable()
export class ToolRegistryService {
  private readonly sourceEnabledOverrides = new Map<string, boolean>();
  private readonly toolEnabledOverrides = new Map<string, boolean>();

  constructor(private readonly mcpService: McpService, private readonly invalidToolService: InvalidToolService, private readonly todoToolService: TodoToolService, private readonly webFetchToolService: WebFetchToolService, private readonly skillToolService: SkillToolService, private readonly taskToolService: TaskToolService, private readonly bashToolService: BashToolService, private readonly readToolService: ReadToolService, private readonly globToolService: GlobToolService, private readonly grepToolService: GrepToolService, private readonly writeToolService: WriteToolService, private readonly editToolService: EditToolService, private readonly runtimeToolBackendService: RuntimeToolBackendService, private readonly runtimeToolPermissionService: RuntimeToolPermissionService, private readonly moduleRef: ModuleRef, @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService, @Inject(RuntimePluginGovernanceService) private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService) {}

  async listOverview(): Promise<ToolOverview> { const allSources = [this.buildPluginSources(), this.mcpService.listToolSources()] as const; return { sources: allSources.flatMap((entries) => entries.map((entry) => entry.source)), tools: allSources.flatMap((entries) => entries.flatMap((entry) => entry.tools)) }; }

  async runSourceAction(kind: ToolSourceKind, sourceId: string, action: PluginActionName): Promise<ToolSourceActionResult> {
    if (kind === 'mcp') {return this.mcpService.runGovernanceAction(sourceId, action as 'health-check' | 'reconnect' | 'reload');}
    if (kind !== 'plugin') {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    const source = readSourceOrThrow(await this.listOverview(), kind, sourceId);
    if (!(source.supportedActions ?? []).includes(action)) {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    const result = await this.runtimePluginGovernanceService.runPluginAction({ action, pluginId: sourceId });
    return {
      accepted: result.accepted,
      action: result.action,
      sourceKind: source.kind,
      sourceId: result.pluginId,
      message: result.message,
    };
  }

  async setSourceEnabled(kind: ToolSourceKind, sourceId: string, enabled: boolean): Promise<ToolSourceInfo> {
    if (kind === 'mcp') { await this.mcpService.setServerEnabled(sourceId, enabled); return readSourceOrThrow(await this.listOverview(), kind, sourceId); }
    readSourceOrThrow(await this.listOverview(), kind, sourceId);
    this.sourceEnabledOverrides.set(`${kind}:${sourceId}`, enabled);
    return readSourceOrThrow(await this.listOverview(), kind, sourceId);
  }

  async setToolEnabled(toolId: string, enabled: boolean): Promise<ToolInfo> {
    readToolOrThrow(await this.listOverview(), toolId);
    this.toolEnabledOverrides.set(toolId, enabled);
    return readToolOrThrow(await this.listOverview(), toolId);
  }

  async buildToolSet(input: { abortSignal?: AbortSignal; allowedToolNames?: string[]; assistantMessageId?: string; context: PluginCallContext; excludedPluginId?: string }): Promise<Record<string, Tool> | undefined> {
    const tools = await this.readExecutableTools(input);
    if (tools.length === 0) {return undefined;}
    const toolsWithInvalid = [...tools, this.readInternalInvalidTool()];
    const toolSet: Record<string, unknown> = {};
    for (const entry of toolsWithInvalid) {
      const toolDefinition: Tool = {
        description: entry.description,
        execute: async (args: Record<string, unknown>) => {
          try {
            await this.reviewRuntimeToolPermission(entry, args, input);
            return await entry.execute(args);
          } catch (error) {
            if (entry.callName === this.invalidToolService.getToolName()) {
              throw error;
            }
            return createInvalidToolResult({
              error: readToolExecutionErrorMessage(error),
              inputText: stringifyInvalidToolInput(args),
              phase: 'execute',
              tool: entry.callName,
            });
          }
        },
        inputSchema: paramSchemaToZod(entry.parameters),
      };
      toolDefinition.toModelOutput = async (event) => {
        if (isInvalidToolResult(event.output)) {
          return this.invalidToolService.toModelOutput({
            ...event,
            output: event.output,
          });
        }
        if (!entry.toModelOutput) {
          return typeof event.output === 'string'
            ? { type: 'text', value: event.output }
            : { type: 'json', value: event.output ?? null };
        }
        return entry.toModelOutput(event);
      };
      toolSet[entry.callName] = toolDefinition;
    }

    return toolSet as Record<string, Tool>;
  }

  async listAvailableTools(input: { context: PluginCallContext; excludedPluginId?: string }): Promise<PluginAvailableToolSummary[]> {
    return (await this.readExecutableTools(input))
      .filter((entry) => !entry.internal)
      .map((entry) => entry.availableTool);
  }

  private async readExecutableTools(input: { allowedToolNames?: string[]; context: PluginCallContext; excludedPluginId?: string }): Promise<ExecutableToolDefinition[]> {
    return [
      ...await this.readEnabledTools(input),
      ...await this.readNativeTaskTools(input),
      ...await this.readNativeTodoTools(input),
      ...await this.readNativeWebFetchTools(input),
      ...await this.readNativeBashTools(input),
      ...await this.readNativeReadTools(input),
      ...await this.readNativeGlobTools(input),
      ...await this.readNativeGrepTools(input),
      ...await this.readNativeWriteTools(input),
      ...await this.readNativeEditTools(input),
      ...await this.readNativeSkillTools(input),
    ];
  }

  private async readEnabledTools(input: { allowedToolNames?: string[]; context: PluginCallContext; excludedPluginId?: string }): Promise<ExecutableToolDefinition[]> {
    return (await this.listOverview()).tools
      .filter((entry) => (entry.sourceKind !== 'plugin' || entry.pluginId !== input.excludedPluginId) && this.isToolEnabledForContext(entry, input.context) && (input.allowedToolNames ? input.allowedToolNames.includes(entry.callName) : true))
      .map((entry) => toExecutableToolDefinition(entry, input.context, this.mcpService, this.runtimeHostPluginDispatchService));
  }

  private async readNativeTodoTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.todoToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.todoToolService.buildToolDescription(),
        name: toolName,
        parameters: this.todoToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.todoToolService.buildToolDescription(),
      execute: async (args) => this.todoToolService.updateSessionTodo({
        sessionId: input.context.conversationId,
        todos: Array.isArray(args.todos) ? args.todos as never : [],
        userId: input.context.userId,
      }),
      parameters: this.todoToolService.getToolParameters(),
      toModelOutput: this.todoToolService.toModelOutput,
    }];
  }

  private async readNativeTaskTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.taskToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.taskToolService.buildToolDescription(),
        name: toolName,
        parameters: this.taskToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.taskToolService.buildToolDescription(),
      execute: async (args) => {
        const taskInput = this.taskToolService.readInput(args);
        const { RuntimeHostSubagentRunnerService } = await import('../../runtime/host/runtime-host-subagent-runner.service');
        const runner = this.moduleRef.get(RuntimeHostSubagentRunnerService, { strict: false });
        if (!runner) {
          throw new Error('RuntimeHostSubagentRunnerService is not available');
        }
        const result = await runner.runSubagent('native.task', input.context, this.taskToolService.buildSubagentParams(taskInput) as unknown as JsonObject);
        const sessionId = (result as Record<string, unknown>).sessionId;
        if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
          throw new Error('subagent.run did not return sessionId');
        }
        return {
          description: taskInput.description,
          sessionId,
          ...(typeof (result as Record<string, unknown>).sessionMessageCount === 'number' ? { sessionMessageCount: (result as Record<string, unknown>).sessionMessageCount as number } : {}),
          ...(taskInput.subagentType ? { subagentType: taskInput.subagentType } : {}),
          text: String((result as Record<string, unknown>).text ?? ''),
        };
      },
      parameters: this.taskToolService.getToolParameters(),
      toModelOutput: this.taskToolService.toModelOutput,
    }];
  }

  private async readNativeWebFetchTools(input: { allowedToolNames?: string[] }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.webFetchToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.webFetchToolService.buildToolDescription(),
        name: toolName,
        parameters: this.webFetchToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.webFetchToolService.buildToolDescription(),
      execute: async (args) => this.webFetchToolService.fetch({
        url: String(args.url ?? ''),
        ...(typeof args.format === 'string' ? { format: args.format as 'text' | 'markdown' | 'html' } : {}),
        ...(typeof args.timeout === 'number' ? { timeout: args.timeout } : {}),
      }),
      parameters: this.webFetchToolService.getToolParameters(),
      toModelOutput: this.webFetchToolService.toModelOutput,
    }];
  }

  private async readNativeBashTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.bashToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.bashToolService.buildToolDescription(),
        name: toolName,
        parameters: this.bashToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.bashToolService.buildToolDescription(),
      execute: async (args) => this.bashToolService.execute(this.bashToolService.readInput(args, input.context.conversationId)),
      parameters: this.bashToolService.getToolParameters(),
      runtimePermission: {
        readAccess: (args) => this.bashToolService.readRuntimeAccess(args, input.context.conversationId),
      },
      toModelOutput: this.bashToolService.toModelOutput,
    }];
  }

  private async readNativeReadTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.readToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.readToolService.buildToolDescription(),
        name: toolName,
        parameters: this.readToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.readToolService.buildToolDescription(),
      execute: async (args) => this.readToolService.execute(this.readToolService.readInput(args, input.context.conversationId)),
      parameters: this.readToolService.getToolParameters(),
      runtimePermission: {
        readAccess: (args) => this.readToolService.readRuntimeAccess(args, input.context.conversationId),
      },
      toModelOutput: this.readToolService.toModelOutput,
    }];
  }

  private async readNativeGlobTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.globToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.globToolService.buildToolDescription(),
        name: toolName,
        parameters: this.globToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.globToolService.buildToolDescription(),
      execute: async (args) => this.globToolService.execute(this.globToolService.readInput(args, input.context.conversationId)),
      parameters: this.globToolService.getToolParameters(),
      runtimePermission: {
        readAccess: (args) => this.globToolService.readRuntimeAccess(args, input.context.conversationId),
      },
      toModelOutput: this.globToolService.toModelOutput,
    }];
  }

  private async readNativeGrepTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.grepToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.grepToolService.buildToolDescription(),
        name: toolName,
        parameters: this.grepToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.grepToolService.buildToolDescription(),
      execute: async (args) => this.grepToolService.execute(this.grepToolService.readInput(args, input.context.conversationId)),
      parameters: this.grepToolService.getToolParameters(),
      runtimePermission: {
        readAccess: (args) => this.grepToolService.readRuntimeAccess(args, input.context.conversationId),
      },
      toModelOutput: this.grepToolService.toModelOutput,
    }];
  }

  private async readNativeWriteTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.writeToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.writeToolService.buildToolDescription(),
        name: toolName,
        parameters: this.writeToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.writeToolService.buildToolDescription(),
      execute: async (args) => this.writeToolService.execute(this.writeToolService.readInput(args, input.context.conversationId)),
      parameters: this.writeToolService.getToolParameters(),
      runtimePermission: {
        readAccess: (args) => this.writeToolService.readRuntimeAccess(args, input.context.conversationId),
      },
      toModelOutput: this.writeToolService.toModelOutput,
    }];
  }

  private async readNativeEditTools(input: { allowedToolNames?: string[]; context: PluginCallContext }): Promise<ExecutableToolDefinition[]> {
    const toolName = this.editToolService.getToolName();
    if (input.allowedToolNames && !input.allowedToolNames.includes(toolName)) {return [];}
    return [{
      availableTool: {
        callName: toolName,
        description: this.editToolService.buildToolDescription(),
        name: toolName,
        parameters: this.editToolService.getToolParameters(),
      },
      callName: toolName,
      description: this.editToolService.buildToolDescription(),
      execute: async (args) => this.editToolService.execute(this.editToolService.readInput(args, input.context.conversationId)),
      parameters: this.editToolService.getToolParameters(),
      runtimePermission: {
        readAccess: (args) => this.editToolService.readRuntimeAccess(args, input.context.conversationId),
      },
      toModelOutput: this.editToolService.toModelOutput,
    }];
  }

  private async readNativeSkillTools(input: { allowedToolNames?: string[]; context?: PluginCallContext; excludedPluginId?: string }): Promise<ExecutableToolDefinition[]> {
    const skills = await this.skillToolService.listAvailableSkills();
    if (skills.length === 0) {return [];}
    if (input.allowedToolNames && !input.allowedToolNames.includes('skill')) {return [];}
    return [{
      availableTool: {
        callName: 'skill',
        description: this.skillToolService.buildToolDescription(skills),
        name: 'skill',
        parameters: this.skillToolService.getToolParameters(),
        sourceId: 'skill-catalog',
        sourceKind: 'skill',
      },
      callName: 'skill',
      description: this.skillToolService.buildToolDescription(skills),
      execute: async (args) => this.skillToolService.loadSkill(String(args.name ?? '')),
      parameters: this.skillToolService.getToolParameters(),
      toModelOutput: ({ output }) => this.skillToolService.toModelOutput(output as SkillLoadResult),
    }];
  }

  private readInternalInvalidTool(): ExecutableToolDefinition {
    return {
      availableTool: {
        callName: this.invalidToolService.getToolName(),
        description: this.invalidToolService.buildToolDescription(),
        name: this.invalidToolService.getToolName(),
        parameters: this.invalidToolService.getToolParameters(),
      },
      callName: this.invalidToolService.getToolName(),
      description: this.invalidToolService.buildToolDescription(),
      execute: async (args) => this.invalidToolService.execute({
        error: String(args.error ?? ''),
        ...(typeof args.inputText === 'string' ? { inputText: args.inputText } : {}),
        phase: readInvalidToolPhase(args.phase),
        tool: String(args.tool ?? ''),
      }),
      internal: true,
      parameters: this.invalidToolService.getToolParameters(),
      toModelOutput: this.invalidToolService.toModelOutput,
    };
  }

  private buildPluginSources(): Array<{ source: ToolSourceInfo; tools: ToolInfo[] }> {
    return this.runtimePluginGovernanceService.listPlugins()
      .filter((plugin) => plugin.connected && plugin.manifest.tools.length > 0)
      .map((plugin) => {
        const sourceEnabled = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`) ?? plugin.defaultEnabled;
        const source: ToolSourceInfo = { kind: 'plugin', id: plugin.pluginId, label: plugin.manifest.name, enabled: sourceEnabled, health: plugin.connected ? 'healthy' : 'unknown', lastError: null, lastCheckedAt: plugin.lastSeenAt, totalTools: plugin.manifest.tools.length, enabledTools: 0, pluginId: plugin.pluginId, runtimeKind: plugin.manifest.runtime, supportedActions: this.runtimePluginGovernanceService.listSupportedActions(plugin.pluginId) as PluginActionName[] };
        const tools = plugin.manifest.tools.map((tool: typeof plugin.manifest.tools[number]) => createPluginToolInfo(plugin, source, tool, this.toolEnabledOverrides.get(`plugin:${plugin.pluginId}:${tool.name}`) ?? sourceEnabled));
        source.enabledTools = tools.filter((tool: ToolInfo) => tool.enabled).length;
        return { source, tools };
      });
  }

  private isToolEnabledForContext(tool: ToolInfo, context: PluginCallContext): boolean {
    if (tool.sourceKind === 'mcp') {return tool.enabled;}
    if (tool.sourceKind === 'skill') {return tool.enabled;}
    const plugin = this.runtimePluginGovernanceService.listPlugins().find((entry) => entry.pluginId === tool.pluginId);
    if (!plugin) {return false;}

    const sourceOverride = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`);
    const sourceEnabled = sourceOverride ?? isPluginEnabledForContext({
      conversations: { ...(plugin.conversationScopes ?? {}) },
      defaultEnabled: plugin.defaultEnabled,
    }, context);
    return sourceEnabled && (this.toolEnabledOverrides.get(tool.toolId) ?? true);
  }

  private async reviewRuntimeToolPermission(
    entry: ExecutableToolDefinition,
    args: Record<string, unknown>,
    input: {
      abortSignal?: AbortSignal;
      assistantMessageId?: string;
      context: PluginCallContext;
    },
  ): Promise<void> {
    if (!entry.runtimePermission) {
      return;
    }
    const access = entry.runtimePermission.readAccess(args, input.context);
    const requiredCapabilities = access.requiredCapabilities;
    if (requiredCapabilities.length === 0) {
      return;
    }
    const backend = this.runtimeToolBackendService.getBackendDescriptor(access.role);
    const requiresApproval = requiredCapabilities.some(
      (capability) => backend.permissionPolicy[capability] === 'ask',
    );
    if (requiresApproval && !input.context.conversationId) {
      throw new ForbiddenException('当前上下文没有 conversationId，无法完成 runtime 权限审批');
    }
    await this.runtimeToolPermissionService.review({
      abortSignal: input.abortSignal,
      backend,
      conversationId: input.context.conversationId,
      ...(input.assistantMessageId ? { messageId: input.assistantMessageId } : {}),
      ...(access.metadata !== undefined ? { metadata: access.metadata } : {}),
      requiredCapabilities,
      summary: access.summary,
      toolName: entry.callName,
    });
  }
}

function createPluginToolInfo(plugin: RegisteredPluginRecord, source: ToolSourceInfo, tool: RegisteredPluginRecord['manifest']['tools'][number], enabled: boolean) {
  return {
    toolId: `plugin:${plugin.pluginId}:${tool.name}`,
    name: tool.name,
    callName: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    enabled,
    sourceKind: 'plugin' as const,
    sourceId: plugin.pluginId,
    sourceLabel: plugin.manifest.name,
    health: source.health,
    lastError: source.lastError,
    lastCheckedAt: source.lastCheckedAt,
    pluginId: plugin.pluginId,
    runtimeKind: plugin.manifest.runtime,
  } satisfies ToolInfo;
}

function toExecutableToolDefinition(entry: ToolInfo, context: PluginCallContext, mcpService: McpService, runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService): ExecutableToolDefinition {
  return {
    availableTool: {
      callName: entry.callName,
      description: entry.description,
      name: entry.name,
      parameters: entry.parameters,
      pluginId: entry.pluginId,
      runtimeKind: entry.runtimeKind,
      sourceId: entry.sourceId,
      sourceKind: entry.sourceKind,
    },
    callName: entry.callName,
    description: entry.description,
    execute: async (args: Record<string, unknown>) =>
      entry.sourceKind === 'mcp'
        ? mcpService.callTool({ arguments: args, serverName: entry.sourceId, toolName: entry.name })
        : runtimeHostPluginDispatchService.executeTool({
            context,
            params: args as never,
            pluginId: entry.pluginId ?? entry.sourceId,
            toolName: entry.name,
          }),
    parameters: entry.parameters,
  };
}

function readSourceOrThrow(overview: ToolOverview, kind: ToolSourceKind, sourceId: string): ToolSourceInfo {
  const source = overview.sources.find((entry) => entry.kind === kind && entry.id === sourceId);
  if (source) {return source;}
  throw new NotFoundException(`Tool source not found: ${kind}:${sourceId}`);
}

function readToolOrThrow(overview: ToolOverview, toolId: string): ToolInfo {
  const tool = overview.tools.find((entry) => entry.toolId === toolId);
  if (tool) {return tool;}
  throw new NotFoundException(`Tool not found: ${toolId}`);
}

function paramSchemaToZod(params: Record<string, PluginParamSchema>) {
  const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(jsonValueSchema),
      z.record(z.string(), jsonValueSchema),
    ]));
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, schema] of Object.entries(params)) {
    let next: z.ZodTypeAny;
    switch (schema.type) {
      case 'number': next = z.number(); break;
      case 'boolean': next = z.boolean(); break;
      case 'array': next = z.array(jsonValueSchema); break;
      case 'object': next = z.record(z.string(), jsonValueSchema); break;
      default: next = z.string();
    }
    shape[key] = schema.required === true ? next : next.optional();
  }
  return z.object(shape);
}

function readToolExecutionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return '工具执行失败';
  }
}

function readInvalidToolPhase(value: unknown): 'execute' | 'resolve' | 'validate' {
  return value === 'resolve' || value === 'validate' || value === 'execute'
    ? value
    : 'execute';
}
