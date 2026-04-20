import { Module, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../execution/automation/automation-execution.service';
import { AutomationService } from '../../execution/automation/automation.service';
import { InvalidToolService } from '../../execution/invalid/invalid-tool.service';
import { McpConfigStoreService } from '../../execution/mcp/mcp-config-store.service';
import { McpService } from '../../execution/mcp/mcp.service';
import { SKILL_DISCOVERY_OPTIONS, SkillRegistryService } from '../../execution/skill/skill-registry.service';
import { SkillToolService } from '../../execution/skill/skill-tool.service';
import { TaskToolService } from '../../execution/task/task-tool.service';
import { TodoToolService } from '../../execution/todo/todo-tool.service';
import { WebFetchService } from '../../execution/webfetch/webfetch-service';
import { WebFetchToolService } from '../../execution/webfetch/webfetch-tool.service';
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
import { RuntimeHostService } from './runtime-host.service';
import { RuntimeHostSubagentRunnerService } from './runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from './runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentTaskStoreService } from './runtime-host-subagent-task-store.service';
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
    InvalidToolService,
    McpConfigStoreService,
    McpService,
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
    RuntimeHostKnowledgeService,
    RuntimeHostPluginDispatchService,
    RuntimeHostPluginRuntimeService,
    RuntimeHostService,
    RuntimeHostSubagentTypeRegistryService,
    RuntimeHostSubagentRunnerService,
    RuntimeHostSubagentSessionStoreService,
    RuntimeHostSubagentTaskStoreService,
    RuntimeHostUserContextService,
    SkillRegistryService,
    SkillToolService,
    TaskToolService,
    TodoToolService,
    WebFetchService,
    WebFetchToolService,
    ToolRegistryService,
  ],
  exports: [AiModelExecutionService, AiManagementService, AiProviderSettingsService, AiVisionService, AutomationService, InvalidToolService, McpService, PersonaService, PersonaStoreService, RuntimeEventLogService, RuntimeHostConversationMessageService, RuntimeHostConversationRecordService, RuntimeHostKnowledgeService, RuntimeHostPluginDispatchService, RuntimeHostPluginRuntimeService, RuntimeHostSubagentTypeRegistryService, RuntimeHostSubagentRunnerService, RuntimeHostSubagentSessionStoreService, RuntimeHostService, RuntimeHostUserContextService, SkillRegistryService, SkillToolService, TaskToolService, TodoToolService, ToolRegistryService, WebFetchService, WebFetchToolService],
})
export class RuntimeHostModule implements OnModuleInit {
  constructor(private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService) {}

  onModuleInit(): void {
    this.runtimeHostSubagentRunnerService.resumePendingTasks();
  }
}
