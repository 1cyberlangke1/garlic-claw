import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HostModule } from '../runtime/host/host.module';
import { AutomationController } from './automation/automation.controller';
import { McpController } from './mcp/mcp.controller';
import { SkillController } from './skill/skill.controller';
import { SubagentController } from './subagent/subagent.controller';
import { ToolController } from './tool/tool.controller';

@Module({
  imports: [AuthModule, HostModule],
  controllers: [
    AutomationController,
    McpController,
    SkillController,
    SubagentController,
    ToolController,
  ],
})
export class ExecutionApiModule {}
