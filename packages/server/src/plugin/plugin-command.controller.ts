import type { PluginCommandOverview } from '@garlic-claw/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PluginCommandService } from './plugin-command.service';

@ApiTags('PluginCommands')
@ApiBearerAuth()
@Controller('plugin-commands')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class PluginCommandController {
  constructor(private readonly pluginCommands: PluginCommandService) {}

  @Get('overview')
  listOverview(): Promise<PluginCommandOverview> {
    return this.pluginCommands.listOverview();
  }
}
