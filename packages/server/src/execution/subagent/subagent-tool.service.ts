import { buildSubagentRunParams, buildSubagentStartParams, SUBAGENT_TOOL_DEFINITIONS } from '@garlic-claw/plugin-sdk/authoring';
import type { JsonObject, PluginCallContext, PluginParamSchema, ToolInfo } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { RuntimeHostSubagentRunnerService } from '../../runtime/host/runtime-host-subagent-runner.service';
import { INTERNAL_SUBAGENT_SOURCE_ID, SubagentSettingsService } from './subagent-settings.service';

const INTERNAL_SUBAGENT_SOURCE_LABEL = 'Subagent';
const SUBAGENT_TOOL_NAMES = new Set(['subagent', 'subagent_background', 'cancel_subagent']);

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
    if (toolName === 'cancel_subagent') {
      const sid = readRequiredPrompt(args.sessionId, toolName);
      const removed = await this.runtimeHostSubagentRunnerService.removeSubagentSession(sid);
      return { cancelled: removed, sessionId: sid };
    }
    const config = this.subagentSettingsService.readSubagentConfig();
    const prompt = readRequiredPrompt(args.prompt, toolName);
    const description = readOptionalText(args.description);
    const sessionId = readOptionalText(args.sessionId);
    const subagentType = readOptionalText(args.subagentType);
    const base = { config, prompt, ...(description ? { description } : {}), ...(sessionId ? { sessionId } : {}), ...(subagentType ? { subagentType } : {}) };
    return toolName === 'subagent'
      ? this.runtimeHostSubagentRunnerService.runSubagent(this.getSourceId(), context, buildSubagentRunParams(base) as unknown as JsonObject)
      : this.runtimeHostSubagentRunnerService.startSubagent(this.getSourceId(), this.getSourceLabel(), context, buildSubagentStartParams({ ...base, shouldWriteBack: readWriteBackFlag(args.writeBack, Boolean(context.conversationId)), conversationId: context.conversationId ?? undefined }) as unknown as JsonObject);
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
