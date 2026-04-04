import {
  collectDisabledConversationSessionIds,
  runHookFamilyChain,
} from '@garlic-claw/shared';
import type {
  AllBroadcastHookFamily,
  ConversationSessionRecord,
  HookChainRunnerMap,
  HookFamilyInput,
  HostCallPayload,
  InboundHookFamily,
  MessageHookFamily,
  OperationHookFamily,
  PluginActionName,
  PluginCallContext,
  PluginErrorHookPayload,
  PluginHookName,
  PluginManifest,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimeKind,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  SubagentHookFamily,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { PluginRuntimeBroadcastFacade } from './plugin-runtime-broadcast.facade';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeInboundHooksFacade } from './plugin-runtime-inbound-hooks.facade';
import { PluginRuntimeMessageHooksFacade } from './plugin-runtime-message-hooks.facade';
import { PluginRuntimeOperationHooksFacade } from './plugin-runtime-operation-hooks.facade';
import { PluginRuntimeSubagentFacade } from './plugin-runtime-subagent.facade';
import { PluginRuntimeTransportFacade } from './plugin-runtime-transport.facade';
import type { AutomationBeforeRunExecutionResult, ChatBeforeModelExecutionResult, MessageReceivedExecutionResult, PluginRuntimeRecord, PluginTransport, ToolBeforeCallExecutionResult } from './plugin-runtime.types';
import type { PluginGovernanceSnapshot } from './plugin.service';

type RuntimeHookInvoker<TPayload = JsonValue> = (input: {
  pluginId: string;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: TPayload;
  recordFailure?: boolean;
}) => Promise<JsonValue | null | undefined>;
type RuntimeHookFamily =
  & InboundHookFamily<ChatBeforeModelExecutionResult, MessageReceivedExecutionResult>
  & MessageHookFamily
  & OperationHookFamily<AutomationBeforeRunExecutionResult, ToolBeforeCallExecutionResult>
  & SubagentHookFamily;

const DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS = 6;

function resolveMaxConcurrentExecutions(
  governance: Pick<PluginGovernanceSnapshot, 'resolvedConfig'>,
): number {
  const raw = governance.resolvedConfig.maxConcurrentExecutions;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(32, Math.max(1, Math.trunc(raw)));
  }

  return DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS;
}

@Injectable()
export class PluginRuntimeService {
  private readonly records = new Map<string, PluginRuntimeRecord>();
  private readonly conversationSessions = new Map<string, ConversationSessionRecord>();
  private readonly dispatchPluginErrorHook = (input: { context: PluginCallContext; payload: PluginErrorHookPayload }) =>
    this.runBroadcastHook({ hookName: 'plugin:error', ...input });
  private readonly transportRuntime = { records: this.records, dispatchPluginErrorHook: this.dispatchPluginErrorHook };
  private readonly invokeHook: RuntimeHookInvoker = (input) => this.invokePluginHook(input);
  private readonly hookRunners: HookChainRunnerMap<
    RuntimeHookFamily,
    RuntimeHookInvoker,
    PluginRuntimeRecord
  > = {
    'chat:before-model': (input) =>
      this.runtimeInboundHooksFacade.runChatBeforeModelHooks(input),
    'message:received': (input) =>
      this.runtimeInboundHooksFacade.runMessageReceivedHooks({
        records: this.records,
        conversationSessions: this.conversationSessions,
        context: input.context,
        payload: input.payload,
        invokeHook: input.invokeHook,
      }),
    'chat:after-model': (input) =>
      this.runtimeMessageHooksFacade.runChatAfterModelHooks(input),
    'message:created': (input) =>
      this.runtimeMessageHooksFacade.runMessageCreatedHooks(input),
    'message:updated': (input) =>
      this.runtimeMessageHooksFacade.runMessageUpdatedHooks(input),
    'automation:before-run': (input) =>
      this.runtimeOperationHooksFacade.runAutomationBeforeRunHooks(input),
    'automation:after-run': (input) =>
      this.runtimeOperationHooksFacade.runAutomationAfterRunHooks(input),
    'tool:before-call': (input) =>
      this.runtimeOperationHooksFacade.runToolBeforeCallHooks(input),
    'tool:after-call': (input) =>
      this.runtimeOperationHooksFacade.runToolAfterCallHooks(input),
    'response:before-send': (input) =>
      this.runtimeOperationHooksFacade.runResponseBeforeSendHooks(input),
    'subagent:before-run': (input) => this.runtimeSubagentFacade.runBeforeHooks(input),
    'subagent:after-run': (input) => this.runtimeSubagentFacade.runAfterHooks(input),
  };

  constructor(
    private readonly runtimeBroadcastFacade: PluginRuntimeBroadcastFacade,
    private readonly runtimeGovernanceFacade: PluginRuntimeGovernanceFacade,
    private readonly runtimeHostFacade: PluginRuntimeHostFacade,
    private readonly runtimeInboundHooksFacade: PluginRuntimeInboundHooksFacade,
    private readonly runtimeMessageHooksFacade: PluginRuntimeMessageHooksFacade,
    private readonly runtimeOperationHooksFacade: PluginRuntimeOperationHooksFacade,
    private readonly runtimeSubagentFacade: PluginRuntimeSubagentFacade,
    private readonly runtimeTransportFacade: PluginRuntimeTransportFacade,
  ) {}

  async registerPlugin(input: {
    manifest: PluginManifest;
    runtimeKind: PluginRuntimeKind;
    deviceType?: string;
    transport: PluginTransport;
    governance?: PluginGovernanceSnapshot;
  }): Promise<PluginManifest> {
    const governance = input.governance ?? {
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {},
      },
    };
    this.records.set(input.manifest.id, {
      manifest: input.manifest,
      runtimeKind: input.runtimeKind,
      deviceType: input.deviceType ?? input.runtimeKind,
      transport: input.transport,
      governance,
      activeExecutions: 0,
      maxConcurrentExecutions: resolveMaxConcurrentExecutions(governance),
    });
    return input.manifest;
  }

  refreshPluginGovernance(
    pluginId: string,
    governance: PluginGovernanceSnapshot,
  ): void {
    const record = this.records.get(pluginId);
    if (!record) {
      return;
    }

    record.governance = governance;
    record.maxConcurrentExecutions = resolveMaxConcurrentExecutions(governance);
    const disabledConversationIds = collectDisabledConversationSessionIds({
      sessions: this.conversationSessions.values(),
      pluginId: record.manifest.id,
      scope: governance.scope,
    });
    for (const conversationId of disabledConversationIds) {
      this.conversationSessions.delete(conversationId);
    }
  }

  unregisterPlugin(pluginId: string): void {
    this.records.delete(pluginId);
    for (const [conversationId, session] of this.conversationSessions.entries()) {
      if (session.pluginId === pluginId) {
        this.conversationSessions.delete(conversationId);
      }
    }
  }

  listTools(context?: PluginCallContext) { return this.runtimeGovernanceFacade.listTools(this.records, context); }

  listPlugins() { return this.runtimeGovernanceFacade.listPlugins(this.records); }

  getRuntimePressure(pluginId: string) { return this.runtimeGovernanceFacade.getRuntimePressure(this.records, pluginId); }

  listConversationSessions(pluginId?: string) {
    return this.runtimeGovernanceFacade.listConversationSessions(this.conversationSessions, pluginId);
  }

  finishConversationSessionForGovernance(
    pluginId: string,
    conversationId: string,
  ): boolean { return this.runtimeGovernanceFacade.finishConversationSessionForGovernance(this.conversationSessions, pluginId, conversationId); }

  async runPluginAction(input: {
    pluginId: string;
    action: Exclude<PluginActionName, 'health-check'>;
  }): Promise<void> {
    await this.runtimeGovernanceFacade.runPluginAction({
      records: this.records,
      pluginId: input.pluginId,
      action: input.action,
    });
  }

  checkPluginHealth(pluginId: string) { return this.runtimeGovernanceFacade.checkPluginHealth(this.records, pluginId); }

  executeTool(input: {
    pluginId: string;
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }): Promise<JsonValue> {
    return this.runtimeTransportFacade.executeTool({
      ...this.transportRuntime,
      pluginId: input.pluginId,
      toolName: input.toolName,
      params: input.params,
      context: input.context,
      skipLifecycleHooks: input.skipLifecycleHooks,
      runToolBeforeCallHooks: (hookInput) => this.runHook({
        hookName: 'tool:before-call',
        ...hookInput,
      }),
      runToolAfterCallHooks: (hookInput) => this.runHook({
        hookName: 'tool:after-call',
        ...hookInput,
      }),
    });
  }

  invokeRoute(input: {
    pluginId: string;
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> {
    return this.runtimeTransportFacade.invokeRoute({
      ...this.transportRuntime,
      pluginId: input.pluginId,
      request: input.request,
      context: input.context,
    });
  }

  callHost(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue> {
    return this.runtimeHostFacade.call({
      records: this.records,
      conversationSessions: this.conversationSessions,
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
      runSubagentRequest: this.executeSubagentRequest.bind(this),
    });
  }

  listSupportedActions(pluginId: string) { return this.runtimeGovernanceFacade.listSupportedActions(this.records, pluginId); }

  invokePluginHook(input: {
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
    recordFailure?: boolean;
  }): Promise<JsonValue | null | undefined> {
    return this.runtimeTransportFacade.invokePluginHook({
      ...this.transportRuntime,
      pluginId: input.pluginId,
      hookName: input.hookName,
      context: input.context,
      payload: input.payload,
      recordFailure: input.recordFailure,
    });
  }

  runHook<TName extends keyof RuntimeHookFamily>(
    input: HookFamilyInput<RuntimeHookFamily, TName>,
  ): Promise<RuntimeHookFamily[TName][1]> {
    return runHookFamilyChain({
      records: this.records.values(),
      hook: input,
      invokeHook: this.invokeHook,
      runners: this.hookRunners,
    });
  }

  runBroadcastHook<TName extends keyof AllBroadcastHookFamily>(
    input: HookFamilyInput<AllBroadcastHookFamily, TName>,
  ): Promise<void> {
    return this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: input.hookName,
      context: input.context,
      payload: input.payload,
      invokeHook: this.invokeHook,
    });
  }

  executeSubagentRequest(input: {
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
  }): Promise<PluginSubagentRunResult> {
    return this.runtimeSubagentFacade.executeRequest({ records: this.records.values(), pluginId: input.pluginId, context: input.context, request: input.request, invokeHook: this.invokeHook });
  }
}
