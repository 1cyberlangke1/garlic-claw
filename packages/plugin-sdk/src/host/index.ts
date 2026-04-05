import type {
  ActionConfig,
  AutomationEventDispatchInfo,
  AutomationInfo,
  HostCallPayload,
  JsonObject,
  JsonValue,
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginEventLevel,
  PluginEventListResult,
  PluginEventQuery,
  PluginKbEntryDetail,
  PluginKbEntrySummary,
  PluginMessageSendInfo,
  PluginMessageSendParams,
  PluginMessageTargetInfo,
  PluginPersonaCurrentInfo,
  PluginPersonaSummary,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
  PluginScopedStateScope,
  PluginSelfInfo,
  PluginSubagentTaskDetail,
  PluginSubagentTaskStartParams,
  PluginSubagentTaskSummary,
  PluginConversationSessionInfo,
  PluginConversationSessionKeepParams,
  PluginConversationSessionStartParams,
  PluginMessageHookInfo,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginSubagentRunParams,
  PluginSubagentRunResult,
  TriggerConfig,
} from '@garlic-claw/shared';

export interface PluginScopedStateOptions {
  scope?: PluginScopedStateScope;
}

export interface PluginGenerateTextParams {
  prompt: string;
  system?: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
  maxOutputTokens?: number;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
}

/**
 * 插件 Host API 门面。
 */
export interface PluginHostFacade {
  call(method: HostCallPayload['method'], params: JsonObject): Promise<JsonValue>;
  getCurrentProvider(): Promise<PluginProviderCurrentInfo>;
  listProviders(): Promise<PluginProviderSummary[]>;
  getProvider(providerId: string): Promise<PluginProviderSummary>;
  getProviderModel(
    providerId: string,
    modelId: string,
  ): Promise<PluginProviderModelSummary>;
  getConversation(): Promise<JsonValue>;
  getCurrentMessageTarget(): Promise<PluginMessageTargetInfo | null>;
  sendMessage(input: PluginMessageSendParams): Promise<PluginMessageSendInfo>;
  conversationSession: PluginConversationSessionController;
  startConversationSession(
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;
  getConversationSession(): Promise<PluginConversationSessionInfo | null>;
  keepConversationSession(
    input: PluginConversationSessionKeepParams,
  ): Promise<PluginConversationSessionInfo | null>;
  finishConversationSession(): Promise<boolean>;
  listKnowledgeBaseEntries(limit?: number): Promise<PluginKbEntrySummary[]>;
  searchKnowledgeBase(
    query: string,
    limit?: number,
  ): Promise<PluginKbEntryDetail[]>;
  getKnowledgeBaseEntry(entryId: string): Promise<PluginKbEntryDetail>;
  getCurrentPersona(): Promise<PluginPersonaCurrentInfo>;
  listPersonas(): Promise<PluginPersonaSummary[]>;
  getPersona(personaId: string): Promise<PluginPersonaSummary>;
  activatePersona(personaId: string): Promise<PluginPersonaCurrentInfo>;
  registerCron(descriptor: PluginCronDescriptor): Promise<PluginCronJobSummary>;
  listCrons(): Promise<PluginCronJobSummary[]>;
  deleteCron(jobId: string): Promise<boolean>;
  createAutomation(input: {
    name: string;
    trigger: TriggerConfig;
    actions: ActionConfig[];
  }): Promise<AutomationInfo>;
  listAutomations(): Promise<AutomationInfo[]>;
  toggleAutomation(
    automationId: string,
  ): Promise<{ id: string; enabled: boolean } | null>;
  runAutomation(
    automationId: string,
  ): Promise<{ status: string; results: JsonValue[] } | null>;
  emitAutomationEvent(event: string): Promise<AutomationEventDispatchInfo>;
  getPluginSelf(): Promise<PluginSelfInfo>;
  listLogs(query?: PluginEventQuery): Promise<PluginEventListResult>;
  writeLog(input: {
    level: PluginEventLevel;
    message: string;
    type?: string;
    metadata?: JsonObject;
  }): Promise<boolean>;
  searchMemories(query: string, limit?: number): Promise<JsonValue>;
  saveMemory(params: {
    content: string;
    category?: string;
    keywords?: string;
  }): Promise<JsonValue>;
  listConversationMessages(): Promise<JsonValue>;
  getStorage(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;
  setStorage(
    key: string,
    value: JsonValue,
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;
  deleteStorage(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;
  listStorage(
    prefix?: string,
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;
  getState(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;
  setState(
    key: string,
    value: JsonValue,
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;
  deleteState(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;
  listState(
    prefix?: string,
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;
  getConfig(key?: string): Promise<JsonValue>;
  getUser(): Promise<JsonValue>;
  setConversationTitle(title: string): Promise<JsonValue>;
  generate(params: PluginLlmGenerateParams): Promise<PluginLlmGenerateResult>;
  runSubagent(params: PluginSubagentRunParams): Promise<PluginSubagentRunResult>;
  startSubagentTask(
    params: PluginSubagentTaskStartParams,
  ): Promise<PluginSubagentTaskSummary>;
  listSubagentTasks(): Promise<PluginSubagentTaskSummary[]>;
  getSubagentTask(taskId: string): Promise<PluginSubagentTaskDetail>;
  generateText(params: PluginGenerateTextParams): Promise<JsonValue>;
}

export type PluginHostFacadeMethods = Omit<PluginHostFacade, 'conversationSession'>;

export interface PluginHostFacadeFactoryInput {
  call: PluginHostFacade['call'];
  callHost<T>(
    method: HostCallPayload['method'],
    params?: JsonObject,
  ): Promise<T>;
  conversationSessionController?: {
    start(
      input: PluginConversationSessionStartParams,
    ): Promise<PluginConversationSessionInfo>;
    get(): Promise<PluginConversationSessionInfo | null>;
    keep(
      input: PluginConversationSessionKeepParams,
    ): Promise<PluginConversationSessionInfo | null>;
    finish(): Promise<boolean>;
  };
}

/** 会话等待态控制器。 */
export interface PluginConversationSessionController {
  readonly conversationId: string | null;
  readonly session: PluginConversationSessionInfo | null;
  readonly timeoutMs: number | null;
  readonly startedAt: string | null;
  readonly expiresAt: string | null;
  readonly lastMatchedAt: string | null;
  readonly captureHistory: boolean;
  readonly historyMessages: PluginMessageHookInfo[];
  readonly metadata: JsonValue | undefined;
  start(
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;
  get(): Promise<PluginConversationSessionInfo | null>;
  sync(): Promise<PluginConversationSessionInfo | null>;
  keep(
    input: PluginConversationSessionKeepParams,
  ): Promise<PluginConversationSessionInfo | null>;
  finish(): Promise<boolean>;
}

export function createPluginHostFacade(
  input: PluginHostFacadeFactoryInput,
): PluginHostFacadeMethods {
  const {
    call,
    callHost,
    conversationSessionController,
  } = input;

  return {
    call,
    getCurrentProvider: () =>
      callHost<PluginProviderCurrentInfo>('provider.current.get'),
    listProviders: () => callHost<PluginProviderSummary[]>('provider.list'),
    getProvider: (providerId) =>
      callHost<PluginProviderSummary>('provider.get', {
        providerId,
      }),
    getProviderModel: (providerId, modelId) =>
      callHost<PluginProviderModelSummary>('provider.model.get', {
        providerId,
        modelId,
      }),
    getConversation: () => call('conversation.get', {}),
    getCurrentMessageTarget: () =>
      callHost<PluginMessageTargetInfo | null>('message.target.current.get'),
    sendMessage: (params) =>
      callHost<PluginMessageSendInfo>('message.send', buildPluginMessageSendParams(params)),
    startConversationSession: (params) =>
      conversationSessionController
        ? conversationSessionController.start(params)
        : callHost<PluginConversationSessionInfo>(
          'conversation.session.start',
          buildPluginConversationSessionStartParams(params),
        ),
    getConversationSession: () =>
      conversationSessionController
        ? conversationSessionController.get()
        : callHost<PluginConversationSessionInfo | null>('conversation.session.get'),
    keepConversationSession: (params) =>
      conversationSessionController
        ? conversationSessionController.keep(params)
        : callHost<PluginConversationSessionInfo | null>(
          'conversation.session.keep',
          buildPluginConversationSessionKeepParams(params),
        ),
    finishConversationSession: () =>
      conversationSessionController
        ? conversationSessionController.finish()
        : callHost<boolean>('conversation.session.finish'),
    listKnowledgeBaseEntries: (limit) =>
      callHost<PluginKbEntrySummary[]>(
        'kb.list',
        typeof limit === 'number' ? { limit } : {},
      ),
    searchKnowledgeBase: (query, limit = 5) =>
      callHost<PluginKbEntryDetail[]>('kb.search', {
        query,
        limit,
      }),
    getKnowledgeBaseEntry: (entryId) =>
      callHost<PluginKbEntryDetail>('kb.get', {
        entryId,
      }),
    getCurrentPersona: () =>
      callHost<PluginPersonaCurrentInfo>('persona.current.get'),
    listPersonas: () => callHost<PluginPersonaSummary[]>('persona.list'),
    getPersona: (personaId) =>
      callHost<PluginPersonaSummary>('persona.get', {
        personaId,
      }),
    activatePersona: (personaId) =>
      callHost<PluginPersonaCurrentInfo>('persona.activate', {
        personaId,
      }),
    registerCron: (descriptor) =>
      callHost<PluginCronJobSummary>(
        'cron.register',
        buildPluginRegisterCronParams(descriptor),
      ),
    listCrons: () => callHost<PluginCronJobSummary[]>('cron.list'),
    deleteCron: (jobId) =>
      callHost<boolean>('cron.delete', {
        jobId,
      }),
    createAutomation: (inputParams) =>
      callHost<AutomationInfo>(
        'automation.create',
        buildPluginCreateAutomationParams(inputParams),
      ),
    listAutomations: () => callHost<AutomationInfo[]>('automation.list'),
    toggleAutomation: (automationId) =>
      callHost<{ id: string; enabled: boolean } | null>('automation.toggle', {
        automationId,
      }),
    runAutomation: (automationId) =>
      callHost<{ status: string; results: JsonValue[] } | null>('automation.run', {
        automationId,
      }),
    emitAutomationEvent: (event) =>
      callHost<AutomationEventDispatchInfo>('automation.event.emit', {
        event,
      }),
    getPluginSelf: () => callHost<PluginSelfInfo>('plugin.self.get'),
    listLogs: (query = {}) =>
      callHost<PluginEventListResult>('log.list', {
        ...(toHostJsonValue(query) as JsonObject),
      }),
    writeLog: ({ level, message, type, metadata }) =>
      callHost<boolean>('log.write', {
        level,
        message,
        ...(type ? { type } : {}),
        ...(metadata ? { metadata: toHostJsonValue(metadata) } : {}),
      }),
    searchMemories: (query, limit = 10) =>
      call('memory.search', {
        query,
        limit,
      }),
    saveMemory: ({ content, category, keywords }) =>
      call('memory.save', {
        content,
        ...(category ? { category } : {}),
        ...(keywords ? { keywords } : {}),
      }),
    listConversationMessages: () =>
      call('conversation.messages.list', {}),
    getStorage: (key, options) =>
      call('storage.get', {
        key,
        ...toScopedStateParams(options),
      }),
    setStorage: (key, value, options) =>
      call('storage.set', {
        key,
        value,
        ...toScopedStateParams(options),
      }),
    deleteStorage: (key, options) =>
      call('storage.delete', {
        key,
        ...toScopedStateParams(options),
      }),
    listStorage: (prefix, options) =>
      call('storage.list', {
        ...(prefix ? { prefix } : {}),
        ...toScopedStateParams(options),
      }),
    getState: (key, options) =>
      call('state.get', {
        key,
        ...toScopedStateParams(options),
      }),
    setState: (key, value, options) =>
      call('state.set', {
        key,
        value,
        ...toScopedStateParams(options),
      }),
    deleteState: (key, options) =>
      call('state.delete', {
        key,
        ...toScopedStateParams(options),
      }),
    listState: (prefix, options) =>
      call('state.list', {
        ...(prefix ? { prefix } : {}),
        ...toScopedStateParams(options),
      }),
    getConfig: (key) =>
      call('config.get', key ? { key } : {}),
    getUser: () => call('user.get', {}),
    setConversationTitle: (title) =>
      call('conversation.title.set', {
        title,
      }),
    generate: (params) =>
      callHost<PluginLlmGenerateResult>('llm.generate', buildPluginGenerateParams(params)),
    runSubagent: (params) =>
      callHost<PluginSubagentRunResult>('subagent.run', buildPluginRunSubagentParams(params)),
    startSubagentTask: (params) =>
      callHost<PluginSubagentTaskSummary>(
        'subagent.task.start',
        buildPluginStartSubagentTaskParams(params),
      ),
    listSubagentTasks: () =>
      callHost<PluginSubagentTaskSummary[]>('subagent.task.list'),
    getSubagentTask: (taskId) =>
      callHost<PluginSubagentTaskDetail>('subagent.task.get', {
        taskId,
      }),
    generateText: (params) =>
      call('llm.generate-text', buildPluginGenerateTextParams(params)),
  };
}

export function buildPluginMessageSendParams(
  input: PluginMessageSendParams,
): JsonObject {
  return {
    ...(input.target ? { target: toHostJsonValue(input.target) } : {}),
    ...(typeof input.content === 'string' ? { content: input.content } : {}),
    ...(input.parts ? { parts: toHostJsonValue(input.parts) } : {}),
    ...(typeof input.provider === 'string' ? { provider: input.provider } : {}),
    ...(typeof input.model === 'string' ? { model: input.model } : {}),
  };
}

export function buildPluginConversationSessionStartParams(
  input: PluginConversationSessionStartParams,
): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.captureHistory === 'boolean'
      ? { captureHistory: input.captureHistory }
      : {}),
    ...(typeof input.metadata !== 'undefined' ? { metadata: input.metadata } : {}),
  };
}

export function buildPluginConversationSessionKeepParams(
  input: PluginConversationSessionKeepParams,
): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.resetTimeout === 'boolean'
      ? { resetTimeout: input.resetTimeout }
      : {}),
  };
}

export function buildPluginRegisterCronParams(
  descriptor: PluginCronDescriptor,
): JsonObject {
  return {
    name: descriptor.name,
    cron: descriptor.cron,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(typeof descriptor.enabled === 'boolean' ? { enabled: descriptor.enabled } : {}),
    ...(typeof descriptor.data !== 'undefined' ? { data: descriptor.data } : {}),
  };
}

export function buildPluginCreateAutomationParams(input: {
  name: string;
  trigger: TriggerConfig;
  actions: ActionConfig[];
}): JsonObject {
  return {
    name: input.name,
    trigger: toHostJsonValue(input.trigger),
    actions: toHostJsonValue(input.actions),
  };
}

export function buildPluginGenerateParams(
  input: PluginLlmGenerateParams,
): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
  };
}

export function buildPluginRunSubagentParams(
  input: PluginSubagentRunParams,
): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
  };
}

export function buildPluginStartSubagentTaskParams(
  input: PluginSubagentTaskStartParams,
): JsonObject {
  return {
    messages: toHostJsonValue(input.messages),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
    ...(input.writeBack ? { writeBack: toHostJsonValue(input.writeBack) } : {}),
  };
}

export function buildPluginGenerateTextParams(
  input: PluginGenerateTextParams,
): JsonObject {
  return {
    prompt: input.prompt,
    ...(input.system ? { system: input.system } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

/**
 * 将 Host API 参数归一化为 JSON，并跳过显式 undefined 字段。
 * @param value 原始值
 * @returns 适合 Host API 的 JSON 值
 */
export function toHostJsonValue(value: unknown): JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) {
      if (typeof item === 'undefined') {
        continue;
      }
      result.push(toHostJsonValue(item));
    }
    return result;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const result: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'undefined') {
        continue;
      }
      result[key] = toHostJsonValue(entry);
    }
    return result;
  }

  return String(value);
}

export function toScopedStateParams(
  options?: PluginScopedStateOptions,
): JsonObject {
  return options?.scope
    ? {
        scope: options.scope,
      }
    : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
