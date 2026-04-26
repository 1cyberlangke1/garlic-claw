import { type JsonObject, type JsonValue, type PluginCallContext, type PluginHostMethod, type PluginLlmMessage, type PluginLlmTransportMode } from '@garlic-claw/shared';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { createSingleUserProfile } from '../../auth/single-user-auth';
import { AutomationService } from '../../execution/automation/automation.service';
import { PersonaService } from '../../persona/persona.service';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';
import { buildPluginSelfSummary, createPluginConfigSnapshot } from '../../plugin/persistence/plugin-read-model';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from './runtime-host-conversation-record.service';
import { PLUGIN_HOST_METHOD_PERMISSION_MAP } from './runtime-host.constants';
import { RuntimeHostKnowledgeService } from './runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from './runtime-host-plugin-runtime.service';
import { RuntimeHostRuntimeToolService } from './runtime-host-runtime-tool.service';
import { RuntimeHostSubagentRunnerService } from './runtime-host-subagent-runner.service';
import { RuntimeHostUserContextService } from './runtime-host-user-context.service';
import { asJsonValue, readJsonObject, readOptionalString, readPluginLlmMessages, readRequiredString, requireContextField, type AssistantCustomBlockEntry } from './runtime-host-values';

type RuntimeHostCallHandler = (input: RuntimeHostCallInput) => JsonValue | Promise<JsonValue>;
type RuntimeHostLlmMethod = 'llm.generate' | 'llm.generate-text';
type RuntimeHostStoreAction = 'deleteStoreValue' | 'getStoreValue' | 'listStoreValues' | 'setStoreValue';
type RuntimeHostRuntimeToolAction = 'editFile' | 'executeCommand' | 'globPaths' | 'grepContent' | 'readPath' | 'writeFile';

interface RuntimeHostCallInput { context: PluginCallContext; params: JsonObject; plugin: RegisteredPluginRecord; pluginId: string; }

const RUNTIME_HOST_STORE_METHODS = [
  ['state.delete', 'state', 'deleteStoreValue'], ['state.get', 'state', 'getStoreValue'], ['state.list', 'state', 'listStoreValues'], ['state.set', 'state', 'setStoreValue'],
  ['storage.delete', 'storage', 'deleteStoreValue'], ['storage.get', 'storage', 'getStoreValue'], ['storage.list', 'storage', 'listStoreValues'], ['storage.set', 'storage', 'setStoreValue'],
] as const satisfies ReadonlyArray<readonly [PluginHostMethod, 'state' | 'storage', RuntimeHostStoreAction]>;

const RUNTIME_HOST_TOOL_METHODS = [
  ['runtime.command.execute', 'executeCommand'], ['runtime.fs.edit', 'editFile'], ['runtime.fs.glob', 'globPaths'],
  ['runtime.fs.grep', 'grepContent'], ['runtime.fs.read', 'readPath'], ['runtime.fs.write', 'writeFile'],
] as const satisfies ReadonlyArray<readonly [PluginHostMethod, RuntimeHostRuntimeToolAction]>;

@Injectable()
export class RuntimeHostService implements OnModuleInit {
  private readonly callHandlers: Record<PluginHostMethod, RuntimeHostCallHandler>;
  constructor(private readonly pluginBootstrapService: PluginBootstrapService, private readonly automationService: AutomationService, private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService, private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService, private readonly aiModelExecutionService: AiModelExecutionService, private readonly aiManagementService: AiManagementService, private readonly runtimeHostKnowledgeService: RuntimeHostKnowledgeService, private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService, private readonly runtimeHostPluginRuntimeService: RuntimeHostPluginRuntimeService, private readonly runtimeHostRuntimeToolService: RuntimeHostRuntimeToolService, private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService, private readonly runtimeHostUserContextService: RuntimeHostUserContextService, private readonly personaService: PersonaService) {
    this.callHandlers = this.buildCallHandlers();
  }
  onModuleInit(): void { this.runtimeHostPluginDispatchService.registerHostCaller((input) => this.call(input)); }

  async call(input: {
    context: PluginCallContext;
    method: PluginHostMethod;
    params: JsonObject;
    pluginId: string;
  }): Promise<JsonValue> {
    const handler = this.callHandlers[input.method];
    if (!handler) {throw new BadRequestException(`Host API ${input.method} is not implemented in the current server runtime`);}
    const plugin = this.pluginBootstrapService.getPlugin(input.pluginId);
    this.assertHostPermission(plugin, input.method);
    if (input.context.conversationId && input.context.activePersonaId) {
      this.runtimeHostConversationRecordService.rememberConversationActivePersona(input.context.conversationId, input.context.activePersonaId);
    }
    return handler({ ...input, plugin });
  }
  private assertHostPermission(plugin: RegisteredPluginRecord, method: PluginHostMethod): void {
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[method];
    if (!requiredPermission || plugin.manifest.permissions.includes(requiredPermission)) {return;}
    throw new ForbiddenException(`Plugin ${plugin.pluginId} is missing permission ${requiredPermission}`);
  }

  private buildCallHandlers(): Record<PluginHostMethod, RuntimeHostCallHandler> {
    const conversationId = (input: RuntimeHostCallInput) => requireContextField(input.context, 'conversationId');
    const userId = (input: RuntimeHostCallInput) => requireContextField(input.context, 'userId');
    const personaId = (input: RuntimeHostCallInput) => readRequiredString(input.params, 'personaId');
    const llm = (method: RuntimeHostLlmMethod): RuntimeHostCallHandler => ({ context, params, plugin }) =>
      this.executeLlmGenerate(plugin, context, params, method);
    const storeHandlers = Object.fromEntries(RUNTIME_HOST_STORE_METHODS.map(([method, surface, action]) => [
      method,
      (input: RuntimeHostCallInput) => this.runtimeHostPluginRuntimeService[action](surface, input.pluginId, input.context, input.params),
    ])) as Partial<Record<PluginHostMethod, RuntimeHostCallHandler>>;
    const toolHandlers = Object.fromEntries(RUNTIME_HOST_TOOL_METHODS.map(([method, action]) => [
      method,
      async ({ context, params }: RuntimeHostCallInput) => asJsonValue(await this.runtimeHostRuntimeToolService[action](context, params)),
    ])) as Partial<Record<PluginHostMethod, RuntimeHostCallHandler>>;
    return {
      'automation.create': (input) => this.automationService.create(userId(input), input.params),
      'automation.event.emit': async (input) => asJsonValue(await this.automationService.emitEvent(userId(input), readRequiredString(input.params, 'event'))),
      'automation.list': (input) => this.automationService.listByUser(userId(input)),
      'automation.run': (input) => this.automationService.run(userId(input), readRequiredString(input.params, 'automationId')),
      'automation.toggle': (input) => this.automationService.toggle(userId(input), readRequiredString(input.params, 'automationId')),
      'config.get': (input) => {
        const snapshot = createPluginConfigSnapshot(input.plugin).values;
        const key = readOptionalString(input.params, 'key');
        return !key ? snapshot : Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key] : null;
      },
      'cron.delete': (input) => this.runtimeHostPluginRuntimeService.deleteCronJob(input.pluginId, input.params),
      'cron.list': (input) => this.runtimeHostPluginRuntimeService.listCronJobs(input.pluginId),
      'cron.register': (input) => this.runtimeHostPluginRuntimeService.registerCronJob(input.pluginId, input.params),
      'conversation.get': (input) => this.runtimeHostConversationRecordService.readConversationSummary(conversationId(input)),
      'conversation.history.get': (input) => this.runtimeHostConversationRecordService.readConversationHistory(conversationId(input), userId(input)),
      'conversation.history.preview': (input) => this.runtimeHostConversationRecordService.previewConversationHistory(conversationId(input), input.params, userId(input)),
      'conversation.history.replace': (input) => this.runtimeHostConversationRecordService.replaceConversationHistory(conversationId(input), input.params, userId(input)),
      'conversation.messages.list': (input) => this.runtimeHostConversationRecordService.requireConversation(conversationId(input)).messages.map((message) => structuredClone(message)),
      'conversation.session.finish': (input) => this.runtimeHostConversationRecordService.finishPluginConversationSession(input.pluginId, conversationId(input)),
      'conversation.session.get': (input) => this.runtimeHostConversationRecordService.getConversationSession(input.pluginId, input.context),
      'conversation.session.keep': (input) => this.runtimeHostConversationRecordService.keepConversationSession(input.pluginId, input.context, input.params),
      'conversation.session.start': (input) => this.runtimeHostConversationRecordService.startConversationSession(input.pluginId, input.context, input.params),
      'conversation.title.set': (input) => this.runtimeHostConversationRecordService.writeConversationTitle(conversationId(input), readRequiredString(input.params, 'title')),
      'kb.get': (input) => this.runtimeHostKnowledgeService.getKbEntry(input.params),
      'kb.list': (input) => this.runtimeHostKnowledgeService.listKbEntries(input.params),
      'kb.search': (input) => this.runtimeHostKnowledgeService.searchKbEntries(input.params),
      'llm.generate': llm('llm.generate'),
      'llm.generate-text': llm('llm.generate-text'),
      'log.list': (input) => this.runtimeHostPluginRuntimeService.listPluginLogs(input.pluginId, input.params),
      'log.write': (input) => this.runtimeHostPluginRuntimeService.writePluginLog(input.pluginId, input.params),
      'memory.save': (input) => this.runtimeHostUserContextService.saveMemory(input.context, input.params),
      'memory.search': (input) => this.runtimeHostUserContextService.searchMemories(input.context, input.params),
      'message.send': (input) => this.runtimeHostConversationMessageService.sendMessage(input.context, input.params),
      'message.target.current.get': (input) => this.runtimeHostConversationRecordService.readCurrentMessageTarget(conversationId(input)),
      'persona.activate': (input) => asJsonValue(this.personaService.activatePersona({ conversationId: conversationId(input), personaId: personaId(input), userId: input.context.userId })),
      'persona.current.get': (input) => asJsonValue(this.personaService.readCurrentPersona({ context: input.context, ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}) })),
      'persona.get': (input) => asJsonValue(this.personaService.readPersona(readRequiredString(input.params, 'personaId'))),
      'persona.list': () => asJsonValue(this.personaService.listPersonas()),
      'plugin.self.get': (input) => buildPluginSelfSummary(input.plugin),
      'provider.current.get': (input) => input.context.activeProviderId && input.context.activeModelId ? { modelId: input.context.activeModelId, providerId: input.context.activeProviderId, source: 'context' } : asJsonValue(this.aiManagementService.getDefaultProviderSelection()),
      'provider.get': (input) => asJsonValue(this.aiManagementService.getProviderSummary(String(input.params.providerId))),
      'provider.list': () => asJsonValue(this.aiManagementService.listProviders()),
      'provider.model.get': (input) => asJsonValue(this.aiManagementService.getProviderModelSummary(String(input.params.providerId), String(input.params.modelId))),
      'subagent.get': (input) => asJsonValue(this.runtimeHostSubagentRunnerService.getSubagent(input.pluginId, readRequiredString(input.params, 'sessionId'))),
      'subagent.list': (input) => asJsonValue(this.runtimeHostSubagentRunnerService.listSubagents(input.pluginId)),
      'subagent.run': (input) => this.runtimeHostSubagentRunnerService.runSubagent(input.pluginId, input.context, input.params),
      'subagent.start': (input) => this.runtimeHostSubagentRunnerService.startSubagent(input.pluginId, input.plugin.manifest.name, input.context, input.params),
      'user.get': (input) => { if (!input.context.userId) {throw new NotFoundException('User not found: unknown');} return asJsonValue(createSingleUserProfile()); },
      ...toolHandlers,
      ...storeHandlers,
    } as Record<PluginHostMethod, RuntimeHostCallHandler>;
  }

  private async executeLlmGenerate(plugin: RegisteredPluginRecord, context: PluginCallContext, params: JsonObject, method: RuntimeHostLlmMethod): Promise<JsonValue> {
    const request = readRuntimeHostLlmRequest({ context, method, params, plugin });
    const result = await this.aiModelExecutionService.generateText({
      allowFallbackChatModels: true,
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      transportMode: request.transportMode,
      variant: request.variant,
    });
    const metadata = readRuntimeHostLlmMetadata(result.providerId, result.customBlockOrigin ?? 'ai-sdk.response-body', result.customBlocks);
    const base = {
      ...(metadata ? { metadata } : {}),
      modelId: result.modelId,
      providerId: result.providerId,
      text: result.text,
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    };
    return method === 'llm.generate-text' ? asJsonValue(base) : asJsonValue({
      ...(result.finishReason !== undefined ? { finishReason: result.finishReason } : {}),
      message: { content: result.text, ...(metadata ? { metadata } : {}), role: 'assistant' }, ...base, toolCalls: [], toolResults: [],
    });
  }
}
function readRuntimeHostLlmRequest(input: {
  context: PluginCallContext;
  method: RuntimeHostLlmMethod;
  params: JsonObject;
  plugin: RegisteredPluginRecord;
}): {
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  messages: PluginLlmMessage[];
  modelId?: string;
  providerOptions?: JsonObject;
  providerId?: string;
  system?: string;
  transportMode?: PluginLlmTransportMode;
  variant?: string;
} {
  const llmOverride = input.plugin.llmPreference.mode === 'override' ? input.plugin.llmPreference : null;
  const headers = readJsonObject(input.params.headers);
  const providerOptions = readJsonObject(input.params.providerOptions);
  const modelId = readOptionalString(input.params, 'modelId') ?? llmOverride?.modelId ?? input.context.activeModelId;
  const providerId = readOptionalString(input.params, 'providerId') ?? llmOverride?.providerId ?? input.context.activeProviderId;
  const system = readOptionalString(input.params, 'system');
  const transportMode = readTransportMode(input.params);
  const variant = readOptionalString(input.params, 'variant');
  return {
    ...(headers ? { headers: headers as Record<string, string> } : {}),
    ...(typeof input.params.maxOutputTokens === 'number' ? { maxOutputTokens: input.params.maxOutputTokens } : {}),
    messages: input.method === 'llm.generate-text'
      ? [{ content: readRequiredString(input.params, 'prompt'), role: 'user' }]
      : readPluginLlmMessages(input.params.messages, 'llm.generate messages must be a non-empty array', (message) => new Error(message)),
    ...(modelId ? { modelId } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(providerId ? { providerId } : {}),
    ...(system ? { system } : {}),
    ...(transportMode ? { transportMode } : {}),
    ...(variant ? { variant } : {}),
  };
}
function readRuntimeHostLlmMetadata(
  providerId: string,
  origin: 'ai-sdk.raw' | 'ai-sdk.response-body',
  blocks: AssistantCustomBlockEntry[] | undefined,
): JsonValue | null {
  return blocks?.length
    ? asJsonValue({ customBlocks: blocks.map((block) => createRuntimeHostCustomBlock(providerId, origin, block)) })
    : null;
}
function createRuntimeHostCustomBlock(providerId: string, origin: 'ai-sdk.raw' | 'ai-sdk.response-body', block: AssistantCustomBlockEntry): JsonValue {
  const title = block.key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ') || block.key;
  const base = {
    id: `custom-field:${block.key}`,
    source: { key: block.key, origin, providerId },
    state: 'done',
    title,
  };
  return asJsonValue(block.kind === 'text' ? { ...base, kind: 'text', text: block.value } : { ...base, data: block.value, kind: 'json' });
}
function readTransportMode(params: JsonObject): PluginLlmTransportMode | null {
  const value = readOptionalString(params, 'transportMode');
  if (!value) {return null;}
  if (value === 'generate' || value === 'stream-collect') {return value;}
  throw new BadRequestException('transportMode must be generate or stream-collect');
}
