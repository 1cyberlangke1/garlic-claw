import { Controller, Get } from '@nestjs/common';
import type { PluginCommandCatalogVersion, PluginCommandOverview } from '@garlic-claw/shared';
import { ContextCommandCatalogService } from './context-command-catalog.service';

@Controller('command-catalog')
export class CommandCatalogController {
  constructor(private readonly contextCommandCatalogService: ContextCommandCatalogService) {}

  @Get('overview')
  getOverview(): PluginCommandOverview {
    return this.contextCommandCatalogService.getOverview();
  }

  @Get('version')
  getVersion(): PluginCommandCatalogVersion {
    return this.contextCommandCatalogService.getVersion();
  }
}
