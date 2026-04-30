import type { PluginSubagentDetail, PluginSubagentOverview, PluginSubagentTypeSummary } from '@garlic-claw/shared';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { RuntimeHostSubagentRunnerService } from '../../../runtime/host/runtime-host-subagent-runner.service';

@Controller('subagents')
export class SubagentController {
  constructor(private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService) {}

  @Get('overview')
  listOverview(): PluginSubagentOverview {
    return this.runtimeHostSubagentRunnerService.listOverview();
  }

  @Get('types')
  listTypes(): PluginSubagentTypeSummary[] {
    return this.runtimeHostSubagentRunnerService.listTypes();
  }

  @Get(':conversationId')
  getSubagent(@Param('conversationId') conversationId: string): PluginSubagentDetail {
    return this.runtimeHostSubagentRunnerService.getSubagentOrThrow(conversationId);
  }

  @Post(':conversationId/close')
  closeSubagent(@Param('conversationId') conversationId: string) {
    const subagent = this.runtimeHostSubagentRunnerService.getSubagentOrThrow(conversationId);
    return this.runtimeHostSubagentRunnerService.closeSubagent(subagent.pluginId, { conversationId });
  }
}
