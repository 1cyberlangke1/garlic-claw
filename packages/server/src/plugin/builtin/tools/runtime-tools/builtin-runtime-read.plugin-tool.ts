import type { PluginToolHandler } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginCapability } from '@garlic-claw/shared';
import { READ_TOOL_PARAMETERS } from '../../../../execution/read/read-tool.service';
import { renderAssetReadOutput, renderDirectoryReadOutput, renderFileReadOutput } from '../../../../execution/read/read-result-render';
import { renderRuntimePathInstructionReminder } from '../../../../execution/read/read-path-instruction';
import {
  readBuiltinRuntimeOptionalPositiveInteger,
  readBuiltinRuntimePath,
  readBuiltinRuntimeRequiredString,
} from './runtime-tools-plugin-runtime';
import { createRuntimeToolTextResult } from './runtime-tools-plugin-result';

export const BUILTIN_RUNTIME_READ_TOOL_CAPABILITY: PluginCapability = {
  name: 'read',
  description: [
    '读取当前 backend 可见路径内的文本文件，或列出目录内容。',
    '该工具不执行命令，只负责稳定读取文件系统内容。',
  ].join('\n'),
  parameters: READ_TOOL_PARAMETERS,
};

export const runBuiltinRuntimeReadTool: PluginToolHandler<PluginHostFacadeMethods> = async (params, context) => {
  const limit = readBuiltinRuntimeOptionalPositiveInteger(params.limit, 'read.limit');
  const offset = readBuiltinRuntimeOptionalPositiveInteger(params.offset, 'read.offset');
  const result = await readBuiltinRuntimePath(context, {
    filePath: readBuiltinRuntimeRequiredString(params.filePath, 'read.filePath'),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  });
  return createRuntimeToolTextResult(
    renderRuntimeReadToolOutput(result),
    { loaded: result.loaded },
  );
};

function renderRuntimeReadToolOutput(result: Awaited<ReturnType<typeof readBuiltinRuntimePath>>): string {
  if (result.readResult.type === 'directory') {
    return renderDirectoryReadOutput(result.readResult);
  }
  if (result.readResult.type === 'binary' || result.readResult.type === 'image' || result.readResult.type === 'pdf') {
    return renderAssetReadOutput(result.readResult);
  }
  if (result.readResult.type !== 'file') {
    throw new Error(`Unsupported read result type: ${String(result.readResult.type)}`);
  }
  return renderFileReadOutput(
    result.readResult,
    [
      ...renderRuntimePathInstructionReminder(result.reminderEntries),
      ...result.freshnessReminders,
    ],
    { maxReadBytesLabel: '50 KB' },
  );
}
