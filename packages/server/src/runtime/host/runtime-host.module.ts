import { Module, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../execution/automation/automation-execution.service';
import { AutomationService } from '../../execution/automation/automation.service';
import { BashToolService } from '../../execution/bash/bash-tool.service';
import { EditToolService } from '../../execution/edit/edit-tool.service';
import { RuntimeWorkspaceFileService } from '../../execution/file/runtime-workspace-file.service';
import { GlobToolService } from '../../execution/glob/glob-tool.service';
import { GrepToolService } from '../../execution/grep/grep-tool.service';
import { InvalidToolService } from '../../execution/invalid/invalid-tool.service';
import { McpConfigStoreService } from '../../execution/mcp/mcp-config-store.service';
import { McpService } from '../../execution/mcp/mcp.service';
import { ProjectWorktreeFileService } from '../../execution/project/project-worktree-file.service';
import { ReadToolService } from '../../execution/read/read-tool.service';
import { RuntimeCommandService } from '../../execution/runtime/runtime-command.service';
import { RUNTIME_BACKENDS } from '../../execution/runtime/runtime-backend.constants';
import { RuntimeJustBashService } from '../../execution/runtime/runtime-just-bash.service';
import { RuntimeToolBackendService } from '../../execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../execution/runtime/runtime-tool-permission.service';
import { RuntimeWorkspaceBackendService } from '../../execution/runtime/runtime-workspace-backend.service';
import { RUNTIME_WORKSPACE_BACKENDS } from '../../execution/runtime/runtime-workspace-backend.constants';
import { RuntimeWorkspaceService } from '../../execution/runtime/runtime-workspace.service';
import { SKILL_DISCOVERY_OPTIONS, SkillRegistryService } from '../../execution/skill/skill-registry.service';
import { SkillToolService } from '../../execution/skill/skill-tool.service';
import { TodoToolService } from '../../execution/todo/todo-tool.service';
import { WebFetchService } from '../../execution/webfetch/webfetch-service';
import { WebFetchToolService } from '../../execution/webfetch/webfetch-tool.service';
import { WriteToolService } from '../../execution/write/write-tool.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { PersonaService } from '../../persona/persona.service';
import { PersonaStoreService } from '../../persona/persona-store.service';
import { PluginModule } from '../../plugin/plugin.module';
import { RuntimeGatewayModule } from '../gateway/runtime-gateway.module';
import { RuntimeKernelModule } from '../kernel/runtime-kernel.module';
import { AiVisionService } from '../../vision/ai-vision.service';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from './runtime-host-conversation-record.service';
import { RuntimeHostKnowledgeService } from './runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from './runtime-host-plugin-runtime.service';
import { RuntimeHostRuntimeToolService } from './runtime-host-runtime-tool.service';
import { RuntimeHostService } from './runtime-host.service';
import { RuntimeHostSubagentRunnerService } from './runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from './runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService } from './runtime-host-subagent-store.service';
import { RuntimeHostSubagentTypeRegistryService } from './runtime-host-subagent-type-registry.service';
import { RuntimeHostUserContextService } from './runtime-host-user-context.service';
import { RuntimeEventLogService } from '../log/runtime-event-log.service';

@Module({
  imports: [PluginModule, RuntimeGatewayModule, RuntimeKernelModule],
  providers: [
    AiModelExecutionService,
    AiManagementService,
    AiProviderSettingsService,
    AutomationExecutionService,
    AutomationService,
    BashToolService,
    EditToolService,
    GlobToolService,
    GrepToolService,
    InvalidToolService,
    McpConfigStoreService,
    McpService,
    ProjectWorktreeFileService,
    PersonaService,
    PersonaStoreService,
    {
      provide: SKILL_DISCOVERY_OPTIONS,
      useValue: {},
    },
    AiVisionService,
    RuntimeHostConversationMessageService,
    RuntimeHostConversationRecordService,
    RuntimeEventLogService,
    {
      provide: RUNTIME_BACKENDS,
      useFactory: (runtimeJustBashService: RuntimeJustBashService) => [runtimeJustBashService],
      inject: [RuntimeJustBashService],
    },
    {
      provide: RUNTIME_WORKSPACE_BACKENDS,
      useFactory: (runtimeWorkspaceFileService: RuntimeWorkspaceFileService) => [runtimeWorkspaceFileService],
      inject: [RuntimeWorkspaceFileService],
    },
    RuntimeCommandService,
    RuntimeToolBackendService,
    RuntimeToolPermissionService,
    RuntimeWorkspaceBackendService,
    RuntimeHostKnowledgeService,
    RuntimeHostPluginDispatchService,
    RuntimeHostPluginRuntimeService,
    RuntimeHostRuntimeToolService,
    RuntimeHostService,
    RuntimeHostSubagentStoreService,
    RuntimeHostSubagentTypeRegistryService,
    RuntimeHostSubagentRunnerService,
    RuntimeHostSubagentSessionStoreService,
    RuntimeHostUserContextService,
    RuntimeJustBashService,
    RuntimeWorkspaceFileService,
    RuntimeWorkspaceService,
    ReadToolService,
    SkillRegistryService,
    SkillToolService,
    TodoToolService,
    WebFetchService,
    WebFetchToolService,
    WriteToolService,
    ToolRegistryService,
  ],
  exports: [AiModelExecutionService, AiManagementService, AiProviderSettingsService, AiVisionService, AutomationService, BashToolService, EditToolService, GlobToolService, GrepToolService, InvalidToolService, McpService, PersonaService, PersonaStoreService, ProjectWorktreeFileService, RuntimeCommandService, RuntimeEventLogService, RuntimeHostConversationMessageService, RuntimeHostConversationRecordService, RuntimeHostKnowledgeService, RuntimeHostPluginDispatchService, RuntimeHostPluginRuntimeService, RuntimeHostRuntimeToolService, RuntimeHostSubagentStoreService, RuntimeHostSubagentTypeRegistryService, RuntimeHostSubagentRunnerService, RuntimeHostSubagentSessionStoreService, RuntimeHostService, RuntimeHostUserContextService, RuntimeJustBashService, RuntimeToolBackendService, RuntimeToolPermissionService, RuntimeWorkspaceBackendService, RuntimeWorkspaceFileService, RuntimeWorkspaceService, ReadToolService, SkillRegistryService, SkillToolService, TodoToolService, ToolRegistryService, WebFetchService, WebFetchToolService, WriteToolService],
})
export class RuntimeHostModule implements OnModuleInit {
  constructor(private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService) {}

  onModuleInit(): void {
    this.runtimeHostSubagentRunnerService.resumePendingSubagents();
  }
}
