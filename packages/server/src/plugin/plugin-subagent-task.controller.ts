import type {
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
} from '@garlic-claw/shared';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PluginSubagentTaskService } from './plugin-subagent-task.service';

@ApiTags('PluginSubagentTasks')
@ApiBearerAuth()
@Controller('plugin-subagent-tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class PluginSubagentTaskController {
  constructor(private readonly subagentTasks: PluginSubagentTaskService) {}

  @Get('overview')
  listOverview(): Promise<PluginSubagentTaskOverview> {
    return this.subagentTasks.listOverview();
  }

  @Get(':taskId')
  getTask(@Param('taskId') taskId: string): Promise<PluginSubagentTaskDetail> {
    return this.subagentTasks.getTaskOrThrow(taskId);
  }
}
