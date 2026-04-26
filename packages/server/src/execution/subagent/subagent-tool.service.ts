import { buildSubagentRunParams, buildSubagentStartParams, SUBAGENT_TOOL_DEFINITIONS } from '@garlic-claw/plugin-sdk/authoring';
import type { JsonObject, PluginCallContext, PluginParamSchema, ToolInfo } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { RuntimeHostSubagentRunnerService } from '../../runtime/host/runtime-host-subagent-runner.service';
import { INTERNAL_SUBAGENT_SOURCE_ID, SubagentSettingsService } from './subagent-settings.service';

const INTERNAL_SUBAGENT_SOURCE_LABEL = 'Subagent';
const SUBAGENT_TOOL_NAMES = new Set(['subagent', 'subagent_background']);

@Injectable()
export class SubagentToolService {
  constructor(
    @Inject(forwardRef(() => RuntimeHostSubagentRunnerService)) private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService,
    private readonly subagentSettingsService: SubagentSettingsService,
  ) {}

  getSourceId(): string {
    return INTERNAL_SUBAGENT_SOURCE_ID;
  }

  getSourceLabel(): string {
    return INTERNAL_SUBAGENT_SOURCE_LABEL;
  }

  getToolInfos(): ToolInfo[] {
    return SUBAGENT_TOOL_DEFINITIONS.map((tool) => ({
      callName: tool.name,
      description: tool.description,
      enabled: true,
      health: 'healthy',
      lastCheckedAt: null,
      lastError: null,
      name: tool.name,
      parameters: tool.parameters as Record<string, PluginParamSchema>,
      sourceId: this.getSourceId(),
      sourceKind: 'internal',
      sourceLabel: this.getSourceLabel(),
      toolId: `internal:${this.getSourceId()}:${tool.name}`,
    }));
  }

  async executeTool(toolName: string, args: Record<string, unknown>, context: PluginCallContext) {
    if (!SUBAGENT_TOOL_NAMES.has(toolName)) {
      throw new NotFoundException(`Internal subagent tool not found: ${toolName}`);
    }
    const config = this.subagentSettingsService.readSubagentConfig();
    const prompt = readRequiredPrompt(args.prompt, toolName);
    const description = readOptionalText(args.description);
    const sessionId = readOptionalText(args.sessionId);
    const subagentType = readOptionalText(args.subagentType);
    const params = toolName === 'subagent'
      ? buildSubagentRunParams({
        config,
        prompt,
        ...(description ? { description } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(subagentType ? { subagentType } : {}),
      })
      : buildSubagentStartParams({
        config,
        prompt,
        shouldWriteBack: readWriteBackFlag(args.writeBack, Boolean(context.conversationId)),
        conversationId: context.conversationId ?? undefined,
        ...(description ? { description } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(subagentType ? { subagentType } : {}),
      });
    return toolName === 'subagent'
      ? this.runtimeHostSubagentRunnerService.runSubagent(this.getSourceId(), context, params as unknown as JsonObject)
      : this.runtimeHostSubagentRunnerService.startSubagent(this.getSourceId(), this.getSourceLabel(), context, params as unknown as JsonObject);
  }
}

function readRequiredPrompt(value: unknown, toolName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${toolName}.prompt 必填`);
  }
  return value.trim();
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readWriteBackFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
