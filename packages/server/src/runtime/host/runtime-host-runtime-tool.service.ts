import type { JsonObject, PluginCallContext } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { BashToolService } from '../../execution/bash/bash-tool.service';
import { EditToolService } from '../../execution/edit/edit-tool.service';
import { GlobToolService } from '../../execution/glob/glob-tool.service';
import { GrepToolService } from '../../execution/grep/grep-tool.service';
import { ReadToolService } from '../../execution/read/read-tool.service';
import { RuntimeToolBackendService } from '../../execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../execution/runtime/runtime-tool-permission.service';
import type { RuntimeToolAccessRequest } from '../../execution/runtime/runtime-tool-access';
import { WriteToolService } from '../../execution/write/write-tool.service';
import { readJsonObject, readOptionalString } from './runtime-host-values';

interface RuntimeHostToolDefinition<TInput, TResult> {
  execute(input: TInput): Promise<TResult>;
  getToolName(): string;
  readInput(
    args: Record<string, unknown>,
    sessionId?: string,
    backendKind?: string,
  ): TInput;
  readRuntimeAccess(input: TInput): RuntimeToolAccessRequest;
}

@Injectable()
export class RuntimeHostRuntimeToolService {
  constructor(
    private readonly bashToolService: BashToolService,
    private readonly readToolService: ReadToolService,
    private readonly globToolService: GlobToolService,
    private readonly grepToolService: GrepToolService,
    private readonly writeToolService: WriteToolService,
    private readonly editToolService: EditToolService,
    private readonly runtimeToolBackendService: RuntimeToolBackendService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
  ) {}

  async executeCommand(context: PluginCallContext, params: JsonObject) {
    return this.runShellTool(context, params, this.bashToolService);
  }

  async readPath(context: PluginCallContext, params: JsonObject) {
    return this.runFilesystemTool(context, params, this.readToolService);
  }

  async globPaths(context: PluginCallContext, params: JsonObject) {
    return this.runFilesystemTool(context, params, this.globToolService);
  }

  async grepContent(context: PluginCallContext, params: JsonObject) {
    return this.runFilesystemTool(context, params, this.grepToolService);
  }

  async writeFile(context: PluginCallContext, params: JsonObject) {
    return this.runFilesystemTool(context, params, this.writeToolService);
  }

  async editFile(context: PluginCallContext, params: JsonObject) {
    return this.runFilesystemTool(context, params, this.editToolService);
  }

  private async runFilesystemTool<TInput, TResult>(
    context: PluginCallContext,
    params: JsonObject,
    tool: RuntimeHostToolDefinition<TInput, TResult>,
  ): Promise<TResult> {
    const backendKind = this.runtimeToolBackendService.getFilesystemBackendKind();
    return this.runPreparedTool(context, params, tool, backendKind);
  }

  private async runPreparedTool<TInput, TResult>(
    context: PluginCallContext,
    params: JsonObject,
    tool: RuntimeHostToolDefinition<TInput, TResult>,
    backendKind: string,
  ): Promise<TResult> {
    const input = tool.readInput(params, context.conversationId, backendKind);
    await this.reviewAccess(context, tool.getToolName(), tool.readRuntimeAccess(input));
    return tool.execute(input);
  }

  private async runShellTool<TInput, TResult>(
    context: PluginCallContext,
    params: JsonObject,
    tool: RuntimeHostToolDefinition<TInput, TResult>,
  ): Promise<TResult> {
    const backendKind = this.runtimeToolBackendService.getShellBackendKind(
      readOptionalString(params, 'backendKind') ?? undefined,
    );
    return this.runPreparedTool(context, params, tool, backendKind);
  }

  private async reviewAccess(
    context: PluginCallContext,
    toolName: string,
    access: RuntimeToolAccessRequest,
  ): Promise<void> {
    const requiredOperations = access.requiredOperations;
    if (requiredOperations.length === 0) {
      return;
    }
    const backend = this.runtimeToolBackendService.getBackendDescriptor(access.role, access.backendKind);
    const metadata = readJsonObject(context.metadata);
    const assistantMessageId = metadata ? readOptionalString(metadata, 'assistantMessageId') : null;
    await this.runtimeToolPermissionService.review({
      backend,
      conversationId: context.conversationId,
      ...(access.metadata !== undefined ? { metadata: access.metadata } : {}),
      ...(assistantMessageId ? { messageId: assistantMessageId } : {}),
      requiredOperations,
      summary: access.summary,
      toolName,
    });
  }
}
