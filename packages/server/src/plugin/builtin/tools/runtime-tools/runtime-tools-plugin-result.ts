import type { JsonValue, PluginRuntimeEditResult, PluginRuntimePostWriteSummary, PluginRuntimeWriteResult } from '@garlic-claw/shared';
import { asJsonValue } from '../../../../runtime/host/runtime-host-values';
import { readRuntimeFilesystemPostWriteSummary } from '../../../../execution/file/runtime-file-post-write-report';

export function createRuntimeToolTextResult(value: string, data?: JsonValue) {
  return {
    kind: 'tool:text',
    ...(data !== undefined ? { data } : {}),
    value,
  } as const;
}

export function createRuntimeWriteToolData(result: PluginRuntimeWriteResult): JsonValue {
  const postWriteSummary = readRuntimePostWriteSummary(result.postWrite, result.path);
  return asJsonValue({
    created: result.created,
    diff: result.diff,
    lineCount: result.lineCount,
    path: result.path,
    postWriteSummary,
    size: result.size,
  });
}

export function createRuntimeEditToolData(result: PluginRuntimeEditResult): JsonValue {
  const postWriteSummary = readRuntimePostWriteSummary(result.postWrite, result.path);
  return asJsonValue({
    diff: result.diff,
    occurrences: result.occurrences,
    path: result.path,
    postWriteSummary,
    strategy: result.strategy,
  });
}

export function readRuntimePostWriteSummary(
  postWrite: PluginRuntimeWriteResult['postWrite'] | PluginRuntimeEditResult['postWrite'],
  targetPath: string,
): PluginRuntimePostWriteSummary {
  return readRuntimeFilesystemPostWriteSummary(postWrite, { targetPath });
}
