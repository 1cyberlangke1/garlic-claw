import type { JsonValue, PluginCallContext, PluginRuntimeCommandResult, PluginRuntimeEditResult, PluginRuntimeGlobResult, PluginRuntimeGrepResult, PluginRuntimeReadResult, PluginRuntimeWriteResult, RuntimeBackendKind } from '@garlic-claw/shared';
import type { PluginAuthorExecutionContext } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import { BadRequestException } from '@nestjs/common';
import { ProjectWorktreeSearchOverlayService } from '../../../../execution/project/project-worktree-search-overlay.service';
import { readRuntimeClaimedPathInstructionReminder, readRuntimePathInstructionReminder } from '../../../../execution/read/read-path-instruction';
import { RuntimeBackendRoutingService } from '../../../../execution/runtime/runtime-backend-routing.service';
import { RuntimeCommandService } from '../../../../execution/runtime/runtime-command.service';
import { RuntimeFileFreshnessService } from '../../../../execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../../../execution/runtime/runtime-filesystem-backend.service';
import { readRuntimeShellCommandHints } from '../../../../execution/runtime/runtime-shell-command-hints';
import { RuntimeSessionEnvironmentService } from '../../../../execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../../../execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../../../execution/runtime/runtime-tool-permission.service';
import { asJsonValue } from '../../../../runtime/host/runtime-host-values';

const DEFAULT_READ_LIMIT = 2000, MAX_READ_LIMIT = 2000, MAX_READ_LINE_LENGTH = 2000, MAX_GLOB_RESULTS = 100, MAX_GREP_MATCHES = 100, MAX_GREP_LINE_LENGTH = 2000;

type BuiltinRuntimeToolsExecutionContext = PluginAuthorExecutionContext<PluginHostFacadeMethods>;
type BuiltinRuntimeToolsName = 'bash' | 'edit' | 'glob' | 'grep' | 'read' | 'write';
type BuiltinRuntimeFilesystemToolName = Exclude<BuiltinRuntimeToolsName, 'bash'>;
type BuiltinRuntimeSearchToolName = Extract<BuiltinRuntimeFilesystemToolName, 'glob' | 'grep'>;
type BuiltinRuntimeMutationToolName = Extract<BuiltinRuntimeFilesystemToolName, 'edit' | 'write'>;
type BuiltinRuntimeToolOperation = 'command.execute' | 'file.edit' | 'file.list' | 'file.read' | 'file.write' | 'network.access';
type BuiltinRuntimeSearchResult = { basePath: string; matches?: Array<string | { virtualPath: string }> };
interface BuiltinRuntimeToolsHost extends PluginHostFacadeMethods { runtimeTools: BuiltinRuntimeToolsServices; }

interface BuiltinRuntimeToolsServices {
  projectWorktreeSearchOverlayService?: ProjectWorktreeSearchOverlayService;
  runtimeBackendRoutingService: RuntimeBackendRoutingService;
  runtimeCommandService: RuntimeCommandService;
  runtimeFileFreshnessService: RuntimeFileFreshnessService;
  runtimeFilesystemBackendService: RuntimeFilesystemBackendService;
  runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService;
  runtimeToolBackendService: RuntimeToolBackendService;
  runtimeToolPermissionService: RuntimeToolPermissionService;
  storedConfig: JsonValue;
}

interface BuiltinRuntimeToolsState { assistantMessageId?: string; services: BuiltinRuntimeToolsServices; sessionId: string; }
interface BuiltinRuntimeFilesystemState extends BuiltinRuntimeToolsState { backendKind: RuntimeBackendKind; }

export async function executeBuiltinRuntimeCommand(
  context: BuiltinRuntimeToolsExecutionContext,
  input: {
    backendKind?: RuntimeBackendKind;
    command: string;
    description: string;
    timeout?: number;
    workdir?: string;
  },
): Promise<PluginRuntimeCommandResult> {
  const state = readBuiltinRuntimeState(context, 'bash');
  const backendKind = readBuiltinRuntimeShellBackend(state.services, input.backendKind);
  const visibleRoot = readBuiltinRuntimeVisibleRoot(state.services);
  const commandHints = await readRuntimeShellCommandHints({ backendKind, command: input.command, visibleRoot, ...(input.workdir ? { workdir: input.workdir } : {}) });

  await reviewBuiltinRuntimeToolAccess(state, 'bash', {
    backendKind,
    metadata: {
      command: input.command,
      description: input.description,
      ...(input.workdir ? { workdir: input.workdir } : {}),
      ...(commandHints.metadata ? { commandHints: asJsonValue(commandHints.metadata) } : {}),
    },
    requiredOperations: ['command.execute', ...(commandHints.metadata?.usesNetworkCommand ? ['network.access' as const] : [])],
    role: 'shell',
    summary: [`${input.description} (${input.workdir ?? visibleRoot})`, ...(commandHints.summary ? [commandHints.summary] : [])].join('；'),
  });

  return state.services.runtimeCommandService.executeCommand({
    backendKind,
    command: input.command,
    description: input.description,
    sessionId: state.sessionId,
    ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
    ...(input.workdir ? { workdir: input.workdir } : {}),
  });
}

export async function readBuiltinRuntimePath(
  context: BuiltinRuntimeToolsExecutionContext,
  input: {
    filePath: string;
    limit?: number;
    offset?: number;
  },
): Promise<PluginRuntimeReadResult> {
  const state = readBuiltinRuntimeFilesystemState(context, 'read');
  const limit = input.limit ?? DEFAULT_READ_LIMIT;
  const offset = input.offset ?? 1;
  if (limit > MAX_READ_LIMIT) throw new BadRequestException(`read.limit 不能超过 ${MAX_READ_LIMIT}`);

  await reviewBuiltinRuntimeToolAccess(state, 'read', {
    backendKind: state.backendKind,
    metadata: {
      filePath: input.filePath,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
    },
    requiredOperations: ['file.read'],
    role: 'filesystem',
    summary: `读取路径 ${input.filePath}`,
  });

  const readResult = await state.services.runtimeFilesystemBackendService.readPathRange(state.sessionId, { limit, maxLineLength: MAX_READ_LINE_LENGTH, offset, path: input.filePath }, state.backendKind);
  if (readResult.type !== 'file') return { freshnessReminders: [], loaded: [], readResult, reminderEntries: [] };

  await state.services.runtimeFileFreshnessService.rememberRead(state.sessionId, readResult.path, state.backendKind, {
    lineCount: readResult.lines.length,
    offset: readResult.offset,
    totalLines: readResult.totalLines,
    truncated: readResult.truncated,
  });

  const reminder = await readRuntimePathInstructionReminder({ backendKind: state.backendKind, path: readResult.path, sessionId: state.sessionId, visibleRoot: readBuiltinRuntimeVisibleRoot(state.services) }, state.services.runtimeFilesystemBackendService);
  const claimedReminder = readRuntimeClaimedPathInstructionReminder({
    assistantMessageId: state.assistantMessageId,
    claimPaths: state.services.runtimeFileFreshnessService.claimReadInstructionPaths.bind(state.services.runtimeFileFreshnessService),
    reminder,
    sessionId: state.sessionId,
  });

  return {
    freshnessReminders: state.services.runtimeFileFreshnessService.buildReadSystemReminder(state.sessionId, { excludePath: readResult.path, limit: 5 }),
    loaded: claimedReminder.loadedPaths,
    readResult,
    reminderEntries: claimedReminder.entries,
  };
}

export async function globBuiltinRuntimePaths(
  context: BuiltinRuntimeToolsExecutionContext,
  input: {
    path?: string;
    pattern: string;
  },
): Promise<PluginRuntimeGlobResult> {
  const { overlay, result } = await runBuiltinRuntimeSearch(context, 'glob', {
    metadata: {
      pattern: input.pattern,
      ...(input.path ? { path: input.path } : {}),
    },
    requiredOperations: ['file.list'],
    run: (state) => state.services.runtimeFilesystemBackendService.globPaths(state.sessionId, { maxResults: MAX_GLOB_RESULTS, pattern: input.pattern, ...(input.path ? { path: input.path } : {}) }, state.backendKind),
    summary: (state) => `按 glob 搜索路径 ${input.path ?? readBuiltinRuntimeVisibleRoot(state.services)}`,
  });
  return { globResult: result, overlay };
}

export async function grepBuiltinRuntimeContent(
  context: BuiltinRuntimeToolsExecutionContext,
  input: {
    include?: string;
    path?: string;
    pattern: string;
  },
): Promise<PluginRuntimeGrepResult> {
  const { overlay, result } = await runBuiltinRuntimeSearch(context, 'grep', {
    metadata: {
      pattern: input.pattern,
      ...(input.include ? { include: input.include } : {}),
      ...(input.path ? { path: input.path } : {}),
    },
    requiredOperations: ['file.read', 'file.list'],
    run: (state) => state.services.runtimeFilesystemBackendService.grepText(state.sessionId, { maxLineLength: MAX_GREP_LINE_LENGTH, maxMatches: MAX_GREP_MATCHES, pattern: input.pattern, ...(input.include ? { include: input.include } : {}), ...(input.path ? { path: input.path } : {}) }, state.backendKind),
    summary: (state) => `按正则搜索路径 ${input.path ?? readBuiltinRuntimeVisibleRoot(state.services)}`,
  });
  return { grepResult: result, overlay };
}

export async function writeBuiltinRuntimeFile(
  context: BuiltinRuntimeToolsExecutionContext,
  input: {
    content: string;
    filePath: string;
  },
): Promise<PluginRuntimeWriteResult> {
  return runBuiltinRuntimeMutation(context, 'write', input.filePath, {
    metadata: { filePath: input.filePath },
    requiredOperations: ['file.write'],
    run: (state) => state.services.runtimeFilesystemBackendService.writeTextFile(state.sessionId, input.filePath, input.content, state.backendKind),
    summary: `写入路径 ${input.filePath}`,
  });
}

export async function editBuiltinRuntimeFile(
  context: BuiltinRuntimeToolsExecutionContext,
  input: {
    filePath: string;
    newString: string;
    oldString: string;
    replaceAll?: boolean;
  },
): Promise<PluginRuntimeEditResult> {
  return runBuiltinRuntimeMutation(context, 'edit', input.filePath, {
    metadata: {
      filePath: input.filePath,
      ...(input.replaceAll !== undefined ? { replaceAll: input.replaceAll } : {}),
    },
    requiredOperations: ['file.edit'],
    run: (state) => state.services.runtimeFilesystemBackendService.editTextFile(state.sessionId, { filePath: input.filePath, newString: input.newString, oldString: input.oldString, ...(input.replaceAll !== undefined ? { replaceAll: input.replaceAll } : {}) }, state.backendKind),
    summary: `修改路径 ${input.filePath}`,
  });
}

export function readBuiltinRuntimeRequiredString(value: unknown, fieldName: string): string {
  const resolved = typeof value === 'string' ? value.trim() : '';
  if (!resolved) throw new BadRequestException(`${fieldName} 不能为空`);
  return resolved;
}

export function readBuiltinRuntimeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${fieldName} 必须是字符串`);
  return value;
}

export function readBuiltinRuntimeOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new BadRequestException(`${fieldName} 必须是大于 0 的整数`);
  return value;
}

export function readBuiltinRuntimeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readBuiltinRuntimeOptionalTimeout(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new BadRequestException('bash.timeout 必须是大于 0 的毫秒数');
  return value;
}

export function readBuiltinRuntimeStoredConfig(context: BuiltinRuntimeToolsExecutionContext): JsonValue {
  return readBuiltinRuntimeServices(context).storedConfig;
}

async function runBuiltinRuntimeSearch<T extends BuiltinRuntimeSearchResult>(
  context: BuiltinRuntimeToolsExecutionContext,
  toolName: BuiltinRuntimeSearchToolName,
  input: {
    metadata?: JsonValue;
    requiredOperations: BuiltinRuntimeToolOperation[];
    run: (state: BuiltinRuntimeFilesystemState) => Promise<T>;
    summary: string | ((state: BuiltinRuntimeFilesystemState) => string);
  },
): Promise<{ overlay: string[]; result: T }> {
  const state = readBuiltinRuntimeFilesystemState(context, toolName);
  await reviewBuiltinRuntimeToolAccess(state, toolName, {
    backendKind: state.backendKind,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    requiredOperations: input.requiredOperations,
    role: 'filesystem',
    summary: typeof input.summary === 'string' ? input.summary : input.summary(state),
  });
  const result = await input.run(state);
  return { overlay: await readBuiltinRuntimeSearchOverlay(state.services, state.sessionId, result), result };
}

async function runBuiltinRuntimeMutation<T extends { path: string }>(
  context: BuiltinRuntimeToolsExecutionContext,
  toolName: BuiltinRuntimeMutationToolName,
  filePath: string,
  input: {
    metadata?: JsonValue;
    requiredOperations: BuiltinRuntimeToolOperation[];
    run: (state: BuiltinRuntimeFilesystemState) => Promise<T>;
    summary: string;
  },
): Promise<T> {
  const state = readBuiltinRuntimeFilesystemState(context, toolName);
  await reviewBuiltinRuntimeToolAccess(state, toolName, {
    backendKind: state.backendKind,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    requiredOperations: input.requiredOperations,
    role: 'filesystem',
    summary: input.summary,
  });
  return state.services.runtimeFileFreshnessService.withWriteFreshnessGuard(state.sessionId, filePath, () => input.run(state), state.backendKind);
}

async function reviewBuiltinRuntimeToolAccess(
  state: BuiltinRuntimeToolsState,
  toolName: BuiltinRuntimeToolsName,
  input: {
    backendKind: RuntimeBackendKind;
    metadata?: JsonValue;
    requiredOperations: BuiltinRuntimeToolOperation[];
    role: 'filesystem' | 'shell';
    summary: string;
  },
): Promise<void> {
  if (input.requiredOperations.length === 0) return;
  await state.services.runtimeToolPermissionService.review({
    backend: state.services.runtimeToolBackendService.getBackendDescriptor(input.role, input.backendKind),
    conversationId: state.sessionId,
    ...(state.assistantMessageId ? { messageId: state.assistantMessageId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    requiredOperations: input.requiredOperations,
    summary: input.summary,
    toolName,
  });
}

function readBuiltinRuntimeState(
  context: BuiltinRuntimeToolsExecutionContext,
  toolName: BuiltinRuntimeToolsName,
): BuiltinRuntimeToolsState {
  return {
    assistantMessageId: readBuiltinRuntimeAssistantMessageId(context.callContext),
    services: readBuiltinRuntimeServices(context),
    sessionId: readBuiltinRuntimeSessionId(context.callContext, toolName),
  };
}

function readBuiltinRuntimeFilesystemState(
  context: BuiltinRuntimeToolsExecutionContext,
  toolName: BuiltinRuntimeFilesystemToolName,
): BuiltinRuntimeFilesystemState {
  const state = readBuiltinRuntimeState(context, toolName);
  return { ...state, backendKind: state.services.runtimeToolBackendService.getFilesystemBackendKind() };
}

function readBuiltinRuntimeServices(
  context: BuiltinRuntimeToolsExecutionContext,
): BuiltinRuntimeToolsServices {
  const host = context.host as PluginHostFacadeMethods & Partial<BuiltinRuntimeToolsHost>;
  if (!host.runtimeTools) throw new Error('builtin runtime tools services unavailable');
  return host.runtimeTools;
}

async function readBuiltinRuntimeSearchOverlay(
  services: BuiltinRuntimeToolsServices,
  sessionId: string,
  result: BuiltinRuntimeSearchResult,
): Promise<string[]> {
  return services.projectWorktreeSearchOverlayService?.buildSearchOverlay({ basePath: result.basePath, matches: result.matches, sessionId }) ?? [];
}

function readBuiltinRuntimeVisibleRoot(services: BuiltinRuntimeToolsServices): string {
  return services.runtimeSessionEnvironmentService.getDescriptor().visibleRoot;
}

function readBuiltinRuntimeShellBackend(
  services: BuiltinRuntimeToolsServices,
  configuredBackendKind?: RuntimeBackendKind,
): RuntimeBackendKind {
  if (configuredBackendKind) return services.runtimeToolBackendService.getShellBackendKind(configuredBackendKind);
  const backendKind = services.runtimeBackendRoutingService.getConfiguredShellBackendKind();
  return backendKind ? services.runtimeToolBackendService.getShellBackendKind(backendKind) : 'native-shell';
}

function readBuiltinRuntimeSessionId(
  context: PluginCallContext,
  toolName: BuiltinRuntimeToolsName,
): string {
  if (context.conversationId) return context.conversationId;
  throw new BadRequestException(`${toolName} 工具只能在 session 上下文中使用`);
}

function readBuiltinRuntimeAssistantMessageId(context: PluginCallContext): string | undefined {
  const metadata = context.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const messageId = metadata.assistantMessageId;
  return typeof messageId === 'string' && messageId.trim() ? messageId.trim() : undefined;
}
