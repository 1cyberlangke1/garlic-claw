import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './ai-management/ai.controller';
import { AuthController } from './auth/auth.controller';
import { AutomationController } from './execution/automation/automation.controller';
import { CommandCatalogController } from './conversation/command-catalog.controller';
import { ConversationController } from './conversation/conversation.controller';
import { HealthController } from './health/health.controller';
import { McpController } from './execution/mcp/mcp.controller';
import { MemoryController } from './runtime/host/memory.controller';
import { PersonaController } from './persona/persona.controller';
import { PluginController } from './plugin/plugin.controller';
import { SkillController } from './execution/skill/skill.controller';
import { SubagentController } from './execution/subagent/subagent.controller';
import { ToolController } from './execution/tool/tool.controller';
import { AuthService } from './auth/auth.service';
import { BootstrapUserService } from './auth/bootstrap-user.service';
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
import { HostModule } from './runtime/host/host.module';
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
    HostModule,
    RuntimeKernelModule,
  ],
  controllers: [AiController, AuthController, AutomationController, CommandCatalogController, ConversationController, HealthController, McpController, MemoryController, PersonaController, PluginController, SkillController, SubagentController, ToolController],
  providers: [
    AuthService,
    BootstrapUserService,
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
