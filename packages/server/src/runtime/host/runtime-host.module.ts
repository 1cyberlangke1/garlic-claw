import { Module, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../execution/automation/automation-execution.service';
import { AutomationService } from '../../execution/automation/automation.service';
import { BashToolService } from '../../execution/bash/bash-tool.service';
import { EditToolService } from '../../execution/edit/edit-tool.service';
import { RuntimeHostFilesystemBackendService } from '../../execution/file/runtime-host-filesystem-backend.service';
import { GlobToolService } from '../../execution/glob/glob-tool.service';
import { GrepToolService } from '../../execution/grep/grep-tool.service';
import { InvalidToolService } from '../../execution/invalid/invalid-tool.service';
import { McpService } from '../../execution/mcp/mcp.service';
import { ProjectWorktreeOverlayModule } from '../../execution/project/project-worktree-overlay.module';
import { ProjectWorktreeSearchOverlayService } from '../../execution/project/project-worktree-search-overlay.service';
import { ReadToolService } from '../../execution/read/read-tool.service';
import { RuntimeCommandService } from '../../execution/runtime/runtime-command.service';
import { RUNTIME_BACKENDS } from '../../execution/runtime/runtime-backend.constants';
import { RuntimeBackendRoutingService } from '../../execution/runtime/runtime-backend-routing.service';
import { RuntimeCommandCaptureService } from '../../execution/runtime/runtime-command-capture.service';
import { RuntimeFileFreshnessService } from '../../execution/runtime/runtime-file-freshness.service';
import { RUNTIME_FILESYSTEM_BACKENDS } from '../../execution/runtime/runtime-filesystem-backend.constants';
import { RuntimeFilesystemBackendService } from '../../execution/runtime/runtime-filesystem-backend.service';
import { RuntimeFilesystemPostWriteService } from '../../execution/runtime/runtime-filesystem-post-write.service';
import { RuntimeJustBashService } from '../../execution/runtime/runtime-just-bash.service';
import { RuntimeNativeShellService } from '../../execution/runtime/runtime-native-shell.service';
import { RuntimeSessionEnvironmentService } from '../../execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../execution/runtime/runtime-tool-permission.service';
import { RuntimeWslShellService } from '../../execution/runtime/runtime-wsl-shell.service';
import { SkillToolService } from '../../execution/skill/skill-tool.service';
import { TodoToolService } from '../../execution/todo/todo-tool.service';
import { WebFetchService } from '../../execution/webfetch/webfetch-service';
import { WebFetchToolService } from '../../execution/webfetch/webfetch-tool.service';
import { WriteToolService } from '../../execution/write/write-tool.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { PersonaService } from '../../persona/persona.service';
import { PluginModule } from '../../plugin/plugin.module';
import { RuntimeGatewayModule } from '../gateway/runtime-gateway.module';
import { RuntimeKernelModule } from '../kernel/runtime-kernel.module';
import { AiVisionService } from '../../vision/ai-vision.service';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from './runtime-host-conversation-record.service';
import { RuntimeHostConversationTodoService } from './runtime-host-conversation-todo.service';
import { RuntimeHostKnowledgeService } from './runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from './runtime-host-plugin-runtime.service';
import { RuntimeHostRuntimeToolService } from './runtime-host-runtime-tool.service';
import { RuntimeHostService } from './runtime-host.service';
import { RuntimeHostSubagentRunnerService } from './runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from './runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService } from './runtime-host-subagent-store.service';
import { RuntimeHostUserContextService } from './runtime-host-user-context.service';
import { RuntimeEventLogService } from '../log/runtime-event-log.service';

@Module({
  imports: [PluginModule, RuntimeGatewayModule, RuntimeKernelModule, ProjectWorktreeOverlayModule],
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
    McpService,
    PersonaService,
    ProjectWorktreeSearchOverlayService,
    AiVisionService,
    RuntimeHostConversationMessageService,
    RuntimeHostConversationRecordService,
    RuntimeHostConversationTodoService,
    RuntimeEventLogService,
    {
      provide: RUNTIME_BACKENDS,
      useFactory: (
        runtimeJustBashService: RuntimeJustBashService,
        runtimeNativeShellService: RuntimeNativeShellService,
        runtimeWslShellService: RuntimeWslShellService,
      ) => process.platform === 'win32'
        ? [runtimeJustBashService, runtimeNativeShellService, runtimeWslShellService]
        : [runtimeJustBashService, runtimeNativeShellService],
      inject: [RuntimeJustBashService, RuntimeNativeShellService, RuntimeWslShellService],
    },
    {
      provide: RUNTIME_FILESYSTEM_BACKENDS,
      useFactory: (runtimeHostFilesystemBackendService: RuntimeHostFilesystemBackendService) => [runtimeHostFilesystemBackendService],
      inject: [RuntimeHostFilesystemBackendService],
    },
    RuntimeCommandService,
    RuntimeCommandCaptureService,
    RuntimeBackendRoutingService,
    RuntimeFileFreshnessService,
    RuntimeFilesystemBackendService,
    RuntimeFilesystemPostWriteService,
    RuntimeToolBackendService,
    RuntimeToolPermissionService,
    RuntimeWslShellService,
    RuntimeHostKnowledgeService,
    RuntimeHostPluginDispatchService,
    RuntimeHostPluginRuntimeService,
    RuntimeHostRuntimeToolService,
    RuntimeHostService,
    RuntimeHostSubagentStoreService,
    RuntimeHostSubagentRunnerService,
    RuntimeHostSubagentSessionStoreService,
    RuntimeHostUserContextService,
    RuntimeJustBashService,
    RuntimeNativeShellService,
    RuntimeSessionEnvironmentService,
    RuntimeHostFilesystemBackendService,
    ReadToolService,
    SkillToolService,
    TodoToolService,
    WebFetchService,
    WebFetchToolService,
    WriteToolService,
    ToolRegistryService,
  ],
  exports: [AiModelExecutionService, AiManagementService, AiProviderSettingsService, AiVisionService, AutomationService, BashToolService, EditToolService, GlobToolService, GrepToolService, InvalidToolService, McpService, PersonaService, ProjectWorktreeSearchOverlayService, RuntimeCommandService, RuntimeCommandCaptureService, RuntimeBackendRoutingService, RuntimeEventLogService, RuntimeFileFreshnessService, RuntimeFilesystemBackendService, RuntimeFilesystemPostWriteService, RuntimeHostConversationMessageService, RuntimeHostConversationRecordService, RuntimeHostConversationTodoService, RuntimeHostFilesystemBackendService, RuntimeHostKnowledgeService, RuntimeHostPluginDispatchService, RuntimeHostPluginRuntimeService, RuntimeHostRuntimeToolService, RuntimeHostSubagentStoreService, RuntimeHostSubagentRunnerService, RuntimeHostSubagentSessionStoreService, RuntimeHostService, RuntimeHostUserContextService, RuntimeJustBashService, RuntimeNativeShellService, RuntimeSessionEnvironmentService, RuntimeToolBackendService, RuntimeToolPermissionService, RuntimeWslShellService, ReadToolService, SkillToolService, TodoToolService, ToolRegistryService, WebFetchService, WebFetchToolService, WriteToolService],
})
export class RuntimeHostModule implements OnModuleInit {
  constructor(private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService) {}

  onModuleInit(): void {
    this.runtimeHostSubagentRunnerService.resumePendingSubagents();
  }
}
