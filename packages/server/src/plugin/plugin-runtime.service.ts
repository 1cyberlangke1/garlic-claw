import type {
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookPayload,
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPayload,
  ChatWaitingModelHookPayload,
  ConversationCreatedHookPayload,
  ConversationSessionRecord,
  HostCallPayload,
  MessageCreatedHookPayload,
  MessageDeletedHookPayload,
  MessageReceivedHookPayload,
  MessageUpdatedHookPayload,
  PluginActionName,
  PluginCallContext,
  PluginCapability,
  PluginConversationSessionInfo,
  PluginErrorHookPayload,
  PluginHookName,
  PluginLoadedHookPayload,
  PluginManifest,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimeKind,
  PluginRuntimePressureSnapshot,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginUnloadedHookPayload,
  ResponseAfterSendHookPayload,
  ResponseBeforeSendHookPayload,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookPayload,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
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
import {
  buildPluginRuntimeRecord,
  collectConversationSessionIdsOwnedByPlugin,
  refreshPluginRuntimeRecordGovernance,
} from './plugin-runtime-record.helpers';
import type {
  AutomationBeforeRunExecutionResult,
  ChatBeforeModelExecutionResult,
  MessageReceivedExecutionResult,
  PluginRuntimeRecord,
  PluginTransport,
  ToolBeforeCallExecutionResult,
} from './plugin-runtime.types';
import type { PluginGovernanceSnapshot } from './plugin.service';

type HookPayloadInput<TPayload> = {
  context: PluginCallContext;
  payload: TPayload;
};

type RuntimeHookInvoker = (input: {
  pluginId: string;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
  recordFailure?: boolean;
}) => Promise<JsonValue | null | undefined>;

type RuntimeJsonHookInvoker = (input: {
  pluginId: string;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: unknown;
}) => Promise<JsonValue | null | undefined>;

type MutationHookInput<TPayload> = {
  records: Iterable<PluginRuntimeRecord>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: RuntimeHookInvoker;
};

type SubagentHookInput<TPayload> = {
  records: Iterable<PluginRuntimeRecord>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: RuntimeJsonHookInvoker;
};

@Injectable()
export class PluginRuntimeService {
  private readonly records = new Map<string, PluginRuntimeRecord>();
  private readonly conversationSessions = new Map<string, ConversationSessionRecord>();
  private readonly invokeHook: RuntimeHookInvoker = (input) => this.invokePluginHook(input);
  private readonly invokeJsonPluginHook: RuntimeJsonHookInvoker = (input) =>
    this.invokePluginHook({
      ...input,
      payload: input.payload as JsonValue,
    });

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
    this.records.set(input.manifest.id, buildPluginRuntimeRecord(input));
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

    const disabledConversationIds = refreshPluginRuntimeRecordGovernance({
      record,
      governance,
      conversationSessions: this.conversationSessions.values(),
    });
    for (const conversationId of disabledConversationIds) {
      this.conversationSessions.delete(conversationId);
    }
  }

  unregisterPlugin(pluginId: string): void {
    this.records.delete(pluginId);
    for (const conversationId of collectConversationSessionIdsOwnedByPlugin(
      this.conversationSessions.values(),
      pluginId,
    )) {
      this.conversationSessions.delete(conversationId);
    }
  }

  listTools(context?: PluginCallContext): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    tool: PluginCapability;
  }> {
    return this.runtimeGovernanceFacade.listTools(this.records, context);
  }

  listPlugins(): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
    manifest: PluginManifest;
    supportedActions: PluginActionName[];
    runtimePressure: PluginRuntimePressureSnapshot;
  }> {
    return this.runtimeGovernanceFacade.listPlugins(this.records);
  }

  getRuntimePressure(pluginId: string): PluginRuntimePressureSnapshot | null {
    return this.runtimeGovernanceFacade.getRuntimePressure(this.records, pluginId);
  }

  listConversationSessions(pluginId?: string): PluginConversationSessionInfo[] {
    return this.runtimeGovernanceFacade.listConversationSessions(
      this.conversationSessions,
      pluginId,
    );
  }

  finishConversationSessionForGovernance(
    pluginId: string,
    conversationId: string,
  ): boolean {
    return this.runtimeGovernanceFacade.finishConversationSessionForGovernance(
      this.conversationSessions,
      pluginId,
      conversationId,
    );
  }

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

  checkPluginHealth(pluginId: string): Promise<{ ok: boolean }> {
    return this.runtimeGovernanceFacade.checkPluginHealth(this.records, pluginId);
  }

  executeTool(input: {
    pluginId: string;
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }): Promise<JsonValue> {
    return this.runtimeTransportFacade.executeTool({
      records: this.records,
      pluginId: input.pluginId,
      toolName: input.toolName,
      params: input.params,
      context: input.context,
      skipLifecycleHooks: input.skipLifecycleHooks,
      runToolBeforeCallHooks: (hookInput) => this.runToolBeforeCallHooks(hookInput),
      runToolAfterCallHooks: (hookInput) => this.runToolAfterCallHooks(hookInput),
      dispatchPluginErrorHook: this.createPluginErrorDispatcher(input.context),
    });
  }

  invokeRoute(input: {
    pluginId: string;
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> {
    return this.runtimeTransportFacade.invokeRoute({
      records: this.records,
      pluginId: input.pluginId,
      request: input.request,
      context: input.context,
      dispatchPluginErrorHook: this.createPluginErrorDispatcher(input.context),
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
      runSubagentRequest: (subagentInput) => this.executeSubagentRequest({
        pluginId: subagentInput.pluginId,
        context: subagentInput.context,
        request: subagentInput.request as PluginSubagentRequest,
      }),
    });
  }

  listSupportedActions(pluginId: string): PluginActionName[] {
    return this.runtimeGovernanceFacade.listSupportedActions(this.records, pluginId);
  }

  invokePluginHook(input: {
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
    recordFailure?: boolean;
  }): Promise<JsonValue | null | undefined> {
    return this.runtimeTransportFacade.invokePluginHook({
      records: this.records,
      pluginId: input.pluginId,
      hookName: input.hookName,
      context: input.context,
      payload: input.payload,
      recordFailure: input.recordFailure,
      dispatchPluginErrorHook: this.createPluginErrorDispatcher(input.context),
    });
  }

  runChatBeforeModelHooks(
    input: HookPayloadInput<ChatBeforeModelHookPayload>,
  ): Promise<ChatBeforeModelExecutionResult> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeInboundHooksFacade.runChatBeforeModelHooks(hookInput));
  }

  runMessageReceivedHooks(
    input: HookPayloadInput<MessageReceivedHookPayload>,
  ): Promise<MessageReceivedExecutionResult> {
    return this.runtimeInboundHooksFacade.runMessageReceivedHooks({
      records: this.records,
      conversationSessions: this.conversationSessions,
      context: input.context,
      payload: input.payload,
      invokeHook: this.invokeHook,
    });
  }

  runChatWaitingModelHooks(
    input: HookPayloadInput<ChatWaitingModelHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('chat:waiting-model', input);
  }

  runChatAfterModelHooks(
    input: HookPayloadInput<ChatAfterModelHookPayload>,
  ): Promise<ChatAfterModelHookPayload> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeMessageHooksFacade.runChatAfterModelHooks(hookInput));
  }

  runConversationCreatedHooks(
    input: HookPayloadInput<ConversationCreatedHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('conversation:created', input);
  }

  runMessageCreatedHooks(
    input: HookPayloadInput<MessageCreatedHookPayload>,
  ): Promise<MessageCreatedHookPayload> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeMessageHooksFacade.runMessageCreatedHooks(hookInput));
  }

  runMessageUpdatedHooks(
    input: HookPayloadInput<MessageUpdatedHookPayload>,
  ): Promise<MessageUpdatedHookPayload> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeMessageHooksFacade.runMessageUpdatedHooks(hookInput));
  }

  runMessageDeletedHooks(
    input: HookPayloadInput<MessageDeletedHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('message:deleted', input);
  }

  runAutomationBeforeRunHooks(
    input: HookPayloadInput<AutomationBeforeRunHookPayload>,
  ): Promise<AutomationBeforeRunExecutionResult> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeOperationHooksFacade.runAutomationBeforeRunHooks(hookInput));
  }

  runAutomationAfterRunHooks(
    input: HookPayloadInput<AutomationAfterRunHookPayload>,
  ): Promise<AutomationAfterRunHookPayload> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeOperationHooksFacade.runAutomationAfterRunHooks(hookInput));
  }

  runToolBeforeCallHooks(
    input: HookPayloadInput<ToolBeforeCallHookPayload>,
  ): Promise<ToolBeforeCallExecutionResult> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeOperationHooksFacade.runToolBeforeCallHooks(hookInput));
  }

  runToolAfterCallHooks(
    input: HookPayloadInput<ToolAfterCallHookPayload>,
  ): Promise<ToolAfterCallHookPayload> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeOperationHooksFacade.runToolAfterCallHooks(hookInput));
  }

  runResponseBeforeSendHooks(
    input: HookPayloadInput<ResponseBeforeSendHookPayload>,
  ): Promise<ResponseBeforeSendHookPayload> {
    return this.runMutationHook(input, (hookInput) =>
      this.runtimeOperationHooksFacade.runResponseBeforeSendHooks(hookInput));
  }

  runResponseAfterSendHooks(
    input: HookPayloadInput<ResponseAfterSendHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('response:after-send', input);
  }

  runSubagentBeforeRunHooks(
    input: HookPayloadInput<SubagentBeforeRunHookPayload>,
  ): Promise<
    | { action: 'continue'; payload: SubagentBeforeRunHookPayload }
    | { action: 'short-circuit'; result: PluginSubagentRunResult }
  > {
    return this.runSubagentHook(input, (hookInput) =>
      this.runtimeSubagentFacade.runBeforeHooks(hookInput));
  }

  runSubagentAfterRunHooks(
    input: HookPayloadInput<SubagentAfterRunHookPayload>,
  ): Promise<SubagentAfterRunHookPayload> {
    return this.runSubagentHook(input, (hookInput) =>
      this.runtimeSubagentFacade.runAfterHooks(hookInput));
  }

  runPluginLoadedHooks(
    input: HookPayloadInput<PluginLoadedHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('plugin:loaded', input);
  }

  runPluginUnloadedHooks(
    input: HookPayloadInput<PluginUnloadedHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('plugin:unloaded', input);
  }

  runPluginErrorHooks(
    input: HookPayloadInput<PluginErrorHookPayload>,
  ): Promise<void> {
    return this.dispatchBroadcastHook('plugin:error', input);
  }

  executeSubagentRequest(input: {
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
  }): Promise<PluginSubagentRunResult> {
    return this.runtimeSubagentFacade.executeRequest({
      records: this.records.values(),
      pluginId: input.pluginId,
      context: input.context,
      request: input.request,
      invokeHook: this.invokeJsonPluginHook,
      runAfterHooks: (afterInput) => this.runSubagentAfterRunHooks(afterInput),
    });
  }

  private createPluginErrorDispatcher(context: PluginCallContext) {
    return (payload: PluginErrorHookPayload) => this.runPluginErrorHooks({
      context,
      payload,
    });
  }

  private runMutationHook<TResult, TPayload>(
    input: HookPayloadInput<TPayload>,
    runner: (input: MutationHookInput<TPayload>) => Promise<TResult> | TResult,
  ): Promise<TResult> {
    return Promise.resolve(runner({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: this.invokeHook,
    }));
  }

  private runSubagentHook<TResult, TPayload>(
    input: HookPayloadInput<TPayload>,
    runner: (input: SubagentHookInput<TPayload>) => Promise<TResult> | TResult,
  ): Promise<TResult> {
    return Promise.resolve(runner({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: this.invokeJsonPluginHook,
    }));
  }

  private dispatchBroadcastHook(
    hookName: PluginHookName,
    input: HookPayloadInput<unknown>,
  ): Promise<void> {
    return this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName,
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }
}
