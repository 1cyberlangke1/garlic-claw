import type { PluginSubagentDetail, PluginSubagentOverview, PluginSubagentTypeSummary } from '@garlic-claw/shared';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { SubagentRunnerService } from '../../runtime/host/subagent-runner.service';

@Controller('subagents')
export class SubagentController {
  constructor(private readonly subagentRunner: SubagentRunnerService) {}

  @Get('overview')
  listOverview(): PluginSubagentOverview {
    return this.subagentRunner.listOverview();
  }

  @Get('types')
  listTypes(): PluginSubagentTypeSummary[] {
    return this.subagentRunner.listTypes();
  }

  @Get(':conversationId')
  getSubagent(@Param('conversationId') conversationId: string): PluginSubagentDetail {
    return this.subagentRunner.getSubagentOrThrow(conversationId);
  }

  @Post(':conversationId/close')
  async closeSubagent(@Param('conversationId') conversationId: string) {
    const subagent = this.subagentRunner.getSubagentOrThrow(conversationId);
    await this.subagentRunner.closeSubagent(subagent.pluginId, { conversationId });
    return this.subagentRunner.getSubagentOrThrow(conversationId);
  }
}
