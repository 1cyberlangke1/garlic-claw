import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './adapters/http/ai/ai.controller';
import { AuthController } from './adapters/http/auth/auth.controller';
import { AutomationController } from './adapters/http/automation/automation.controller';
import { CommandCatalogController } from './adapters/http/command/command-catalog.controller';
import { ConversationController } from './adapters/http/conversation/conversation.controller';
import { HealthController } from './adapters/http/health/health.controller';
import { McpController } from './adapters/http/mcp/mcp.controller';
import { MemoryController } from './adapters/http/memory/memory.controller';
import { PersonaController } from './adapters/http/persona/persona.controller';
import { PluginController } from './adapters/http/plugin/plugin.controller';
import { SkillController } from './adapters/http/skill/skill.controller';
import { SubagentController } from './adapters/http/subagent/subagent.controller';
import { ToolController } from './adapters/http/tool/tool.controller';
import { AuthService } from './auth/auth.service';
import { BootstrapAdminService } from './auth/bootstrap-admin.service';
import { JwtAuthGuard } from './auth/http-auth';
import { RequestAuthService } from './auth/request-auth.service';
import { PluginGatewayWsModule } from './adapters/ws/plugin-gateway/plugin-gateway.module';
import { ContextCommandCatalogService } from './conversation/context-command-catalog.service';
import { ContextGovernanceService } from './conversation/context-governance.service';
import { ContextGovernanceSettingsService } from './conversation/context-governance-settings.service';
import { ConversationMessagePlanningService } from './conversation/conversation-message-planning.service';
import { ConversationMessageLifecycleService } from './conversation/conversation-message-lifecycle.service';
import { ConversationTaskService } from './conversation/conversation-task.service';
import { ProjectWorktreeOverlayModule } from './execution/project/project-worktree-overlay.module';
import { PluginModule } from './plugin/plugin.module';
import { RuntimeHostModule } from './runtime/host/runtime-host.module';
import { RuntimeKernelModule } from './runtime/kernel/runtime-kernel.module';
import { ServerWorkspaceLifecycleService } from './runtime/server-workspace-lifecycle.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    JwtModule.register({}),
    PluginGatewayWsModule,
    PluginModule,
    ProjectWorktreeOverlayModule,
    RuntimeHostModule,
    RuntimeKernelModule,
  ],
  controllers: [AiController, AuthController, AutomationController, CommandCatalogController, ConversationController, HealthController, McpController, MemoryController, PersonaController, PluginController, SkillController, SubagentController, ToolController],
  providers: [
    AuthService,
    BootstrapAdminService,
    ContextCommandCatalogService,
    ContextGovernanceService,
    ContextGovernanceSettingsService,
    ConversationMessageLifecycleService,
    ConversationMessagePlanningService,
    ConversationTaskService,
    JwtAuthGuard,
    RequestAuthService,
    ServerWorkspaceLifecycleService,
  ],
})
export class AppModule {}
