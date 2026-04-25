import path from 'node:path';
import type { RuntimeBackendKind } from '@garlic-claw/shared';
import type { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';

const MAX_READ_PATH_INSTRUCTION_CHARS = 4000;

export interface RuntimeReadPathInstructionEntry {
  content: string;
  path: string;
}

export interface RuntimeReadPathInstructionReminder {
  entries: RuntimeReadPathInstructionEntry[];
}

export interface RuntimeClaimedReadPathInstructionReminder {
  entries: RuntimeReadPathInstructionEntry[];
  loadedPaths: string[];
}

export async function readRuntimePathInstructionReminder(
  input: {
    backendKind: RuntimeBackendKind;
    path: string;
    sessionId: string;
    visibleRoot: string;
  },
  runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
): Promise<RuntimeReadPathInstructionReminder> {
  if (
    typeof runtimeFilesystemBackendService.statPath !== 'function'
    || typeof runtimeFilesystemBackendService.readTextFile !== 'function'
  ) {
    return { entries: [] };
  }
  const entries: RuntimeReadPathInstructionEntry[] = [];
  for (const agentPath of readRuntimeAncestorAgentPaths(input.path, input.visibleRoot)) {
    const stat = await runtimeFilesystemBackendService.statPath(input.sessionId, agentPath, input.backendKind);
    if (!stat.exists || stat.type !== 'file') {
      continue;
    }
    const textFile = await runtimeFilesystemBackendService.readTextFile(input.sessionId, agentPath, input.backendKind);
    entries.push({
      content: textFile.content.length <= MAX_READ_PATH_INSTRUCTION_CHARS
        ? textFile.content
        : `${textFile.content.slice(0, MAX_READ_PATH_INSTRUCTION_CHARS)}\n... (AGENTS.md 内容已截断，必要时请直接 read 该文件确认完整指令)`,
      path: textFile.path,
    });
  }
  return { entries };
}

export function renderRuntimePathInstructionReminder(entries: RuntimeReadPathInstructionEntry[]): string[] {
  return entries.length === 0
    ? []
    : [
      '<system-reminder>',
      '该路径命中以下 AGENTS.md 指令，请一并遵守：',
      ...entries.map((entry) => [`<agents path="${entry.path}">`, entry.content, '</agents>'].join('\n')),
      '</system-reminder>',
    ];
}

export function readRuntimeClaimedPathInstructionReminder(input: {
  assistantMessageId?: string;
  claimPaths?: (sessionId: string, paths: string[], assistantMessageId?: string) => string[];
  reminder: RuntimeReadPathInstructionReminder;
  sessionId: string;
}): RuntimeClaimedReadPathInstructionReminder {
  const loadedPaths = input.claimPaths
    ? input.claimPaths(
      input.sessionId,
      input.reminder.entries.map((entry) => entry.path),
      input.assistantMessageId,
    )
    : input.reminder.entries.map((entry) => entry.path);
  const loadedSet = new Set(loadedPaths);
  return {
    entries: input.reminder.entries.filter((entry) => loadedSet.has(entry.path)),
    loadedPaths,
  };
}

function readRuntimeAncestorAgentPaths(filePath: string, visibleRoot: string): string[] {
  const agentPaths: string[] = [];
  for (
    let currentDirectory = path.posix.dirname(filePath);
    currentDirectory !== visibleRoot && currentDirectory !== '.' && currentDirectory !== '/';
    currentDirectory = path.posix.dirname(currentDirectory)
  ) {
    agentPaths.push(path.posix.join(currentDirectory, 'AGENTS.md'));
  }
  return agentPaths.reverse();
}
