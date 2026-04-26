import type { PluginToolHandler } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginCapability } from '@garlic-claw/shared';
import { renderRuntimeFilesystemDiffLines } from '../../../../execution/file/runtime-file-diff-report';
import { renderRuntimeFilesystemPostWriteLines } from '../../../../execution/file/runtime-file-post-write-report';
import { WRITE_TOOL_PARAMETERS } from '../../../../execution/write/write-tool.service';
import {
  readBuiltinRuntimeRequiredString,
  readBuiltinRuntimeRequiredText,
  writeBuiltinRuntimeFile,
} from './runtime-tools-plugin-runtime';
import { createRuntimeToolTextResult, createRuntimeWriteToolData } from './runtime-tools-plugin-result';

export const BUILTIN_RUNTIME_WRITE_TOOL_CAPABILITY: PluginCapability = {
  name: 'write',
  description: [
    '在当前 backend 可见路径内整文件写入内容。',
    '如果文件不存在会自动创建父目录。',
    '如果文件已存在，必须先拿到该文件的当前内容；可先用 read 读取，或沿用同一 session 中最近一次成功 write/edit 后记录的当前版本。',
    '如果文件自上次读取或修改后又发生变化，需要重新 read。',
  ].join('\n'),
  parameters: WRITE_TOOL_PARAMETERS,
};

export const runBuiltinRuntimeWriteTool: PluginToolHandler<PluginHostFacadeMethods> = async (params, context) => {
  const result = await writeBuiltinRuntimeFile(context, {
    content: readBuiltinRuntimeRequiredText(params.content, 'write.content'),
    filePath: readBuiltinRuntimeRequiredString(params.filePath, 'write.filePath'),
  });
  return createRuntimeToolTextResult(renderRuntimeWriteToolOutput(result), createRuntimeWriteToolData(result));
};

function renderRuntimeWriteToolOutput(result: Awaited<ReturnType<typeof writeBuiltinRuntimeFile>>): string {
  return [
    '<write_result>',
    `Path: ${result.path}`,
    `Status: ${result.created ? 'created' : 'overwritten'}`,
    `Lines: ${result.lineCount}`,
    `Size: ${formatWriteSize(result.size)}`,
    ...(result.diff ? [
      `Diff: +${result.diff.additions} / -${result.diff.deletions}`,
      `Line delta: ${result.diff.beforeLineCount} -> ${result.diff.afterLineCount}`,
    ] : []),
    ...renderRuntimeFilesystemDiffLines(result.diff),
    ...renderRuntimeFilesystemPostWriteLines(result.postWrite, { targetPath: result.path }),
    '</write_result>',
  ].join('\n');
}

function formatWriteSize(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
