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
    const input = this.bashToolService.readInput(params, context.conversationId);
    await this.reviewAccess(context, this.bashToolService.getToolName(), this.bashToolService.readRuntimeAccess(params, context.conversationId));
    return this.bashToolService.execute(input);
  }

  async readPath(context: PluginCallContext, params: JsonObject) {
    const input = this.readToolService.readInput(params, context.conversationId);
    await this.reviewAccess(context, this.readToolService.getToolName(), this.readToolService.readRuntimeAccess(params, context.conversationId));
    return this.readToolService.execute(input);
  }

  async globPaths(context: PluginCallContext, params: JsonObject) {
    const input = this.globToolService.readInput(params, context.conversationId);
    await this.reviewAccess(context, this.globToolService.getToolName(), this.globToolService.readRuntimeAccess(params, context.conversationId));
    return this.globToolService.execute(input);
  }

  async grepContent(context: PluginCallContext, params: JsonObject) {
    const input = this.grepToolService.readInput(params, context.conversationId);
    await this.reviewAccess(context, this.grepToolService.getToolName(), this.grepToolService.readRuntimeAccess(params, context.conversationId));
    return this.grepToolService.execute(input);
  }

  async writeFile(context: PluginCallContext, params: JsonObject) {
    const input = this.writeToolService.readInput(params, context.conversationId);
    await this.reviewAccess(context, this.writeToolService.getToolName(), this.writeToolService.readRuntimeAccess(params, context.conversationId));
    return this.writeToolService.execute(input);
  }

  async editFile(context: PluginCallContext, params: JsonObject) {
    const input = this.editToolService.readInput(params, context.conversationId);
    await this.reviewAccess(context, this.editToolService.getToolName(), this.editToolService.readRuntimeAccess(params, context.conversationId));
    return this.editToolService.execute(input);
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
    const backend = this.runtimeToolBackendService.getBackendDescriptor(access.role);
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
