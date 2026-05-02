import { buildSubagentCloseParams, buildSubagentSendInputParams, buildSubagentSpawnParams, buildSubagentWaitParams, SUBAGENT_TOOL_DEFINITIONS } from '@garlic-claw/plugin-sdk/authoring';
import type { JsonObject, PluginCallContext, PluginParamSchema, ToolInfo } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { SubagentRunnerService } from '../../runtime/host/subagent-runner.service';
import { INTERNAL_SUBAGENT_SOURCE_ID, SubagentSettingsService } from './subagent-settings.service';

const INTERNAL_SUBAGENT_SOURCE_LABEL = 'Subagent';
const SUBAGENT_TOOL_NAMES = new Set(['spawn_subagent', 'wait_subagent', 'send_input_subagent', 'interrupt_subagent', 'close_subagent']);

@Injectable()
export class SubagentToolService {
  constructor(
    @Inject(forwardRef(() => SubagentRunnerService)) private readonly runtimeHostSubagentRunnerService: SubagentRunnerService,
    private readonly subagentSettingsService: SubagentSettingsService,
  ) {}

  getSourceId(): string {
    return INTERNAL_SUBAGENT_SOURCE_ID;
  }

  getSourceLabel(): string {
    return INTERNAL_SUBAGENT_SOURCE_LABEL;
  }

  getToolInfos(): ToolInfo[] {
    const sourceId = this.getSourceId();
    const sourceLabel = this.getSourceLabel();
    const tools: ToolInfo[] = SUBAGENT_TOOL_DEFINITIONS.map((tool) => ({
      callName: tool.name,
      description: tool.description,
      enabled: true,
      name: tool.name,
      parameters: tool.parameters as Record<string, PluginParamSchema>,
      sourceId,
      sourceKind: 'internal' as const,
      sourceLabel,
      toolId: `internal:${sourceId}:${tool.name}`,
    }));
    return tools;
  }

  async executeTool(toolName: string, args: Record<string, unknown>, context: PluginCallContext) {
    if (!SUBAGENT_TOOL_NAMES.has(toolName)) {
      throw new NotFoundException(`Internal subagent tool not found: ${toolName}`);
    }
    const config = this.subagentSettingsService.readSubagentConfig();
    if (toolName === 'wait_subagent') {
      return this.runtimeHostSubagentRunnerService.waitSubagent(this.getSourceId(), buildSubagentWaitParams({
        conversationId: readRequiredText(args.conversationId, toolName),
        ...(typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : {}),
      }));
    }
    if (toolName === 'interrupt_subagent') {
      return this.runtimeHostSubagentRunnerService.interruptSubagent(this.getSourceId(), readRequiredText(args.conversationId, toolName), context.userId);
    }
    if (toolName === 'close_subagent') {
      return this.runtimeHostSubagentRunnerService.closeSubagent(this.getSourceId(), buildSubagentCloseParams({
        conversationId: readRequiredText(args.conversationId, toolName),
      }), context.userId);
    }
    if (toolName === 'send_input_subagent') {
      return this.runtimeHostSubagentRunnerService.sendInputSubagent(this.getSourceId(), context, buildSubagentSendInputParams({
        config,
        conversationId: readRequiredText(args.conversationId, toolName),
        description: readOptionalText(args.description) ?? null,
        modelId: readOptionalText(args.modelId) ?? null,
        name: readOptionalText(args.name) ?? null,
        prompt: readRequiredText(args.prompt, toolName),
        providerId: readOptionalText(args.providerId) ?? null,
      }));
    }
    return this.runtimeHostSubagentRunnerService.spawnSubagent(
      this.getSourceId(),
      this.getSourceLabel(),
      context,
      buildSubagentSpawnParams({
        config,
        description: readOptionalText(args.description) ?? null,
        modelId: readOptionalText(args.modelId) ?? null,
        name: readOptionalText(args.name) ?? null,
        prompt: readRequiredText(args.prompt, toolName),
        providerId: readOptionalText(args.providerId) ?? null,
        subagentType: readOptionalText(args.subagentType) ?? null,
      }) as unknown as JsonObject,
    );
  }
}

function readRequiredText(value: unknown, toolName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${toolName} 缺少必填字符串参数`);
  }
  return value.trim();
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
