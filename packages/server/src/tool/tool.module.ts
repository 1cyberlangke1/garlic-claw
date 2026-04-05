import { Module } from '@nestjs/common';
import { McpToolProvider } from './mcp-tool.provider';
import { PluginToolProvider } from './plugin-tool.provider';
import { SkillToolProvider } from './skill-tool.provider';
import { ToolAdminService } from './tool-admin.service';
import { ToolController } from './tool.controller';
import { ToolRegistryService } from './tool-registry.service';
import { ToolSettingsService } from './tool-settings.service';

@Module({
  controllers: [ToolController],
  providers: [
    ToolSettingsService,
    PluginToolProvider,
    McpToolProvider,
    SkillToolProvider,
    ToolRegistryService,
    ToolAdminService,
  ],
  exports: [
    ToolSettingsService,
    ToolRegistryService,
    ToolAdminService,
  ],
})
export class ToolModule {}
