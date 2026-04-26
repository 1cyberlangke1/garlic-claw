import type { PluginSubagentDetail, PluginSubagentOverview, PluginSubagentTypeSummary } from '@garlic-claw/shared';
import { Controller, Delete, Get, Param } from '@nestjs/common';
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

  @Get(':sessionId')
  getSubagent(@Param('sessionId') sessionId: string): PluginSubagentDetail {
    return this.runtimeHostSubagentRunnerService.getSubagentOrThrow(sessionId);
  }

  @Delete(':sessionId')
  removeSubagent(@Param('sessionId') sessionId: string): Promise<boolean> {
    return this.runtimeHostSubagentRunnerService.removeSubagentSession(sessionId);
  }
}
