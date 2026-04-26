import type { PluginToolHandler } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginCapability } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import { renderRuntimeFilesystemDiffLines } from '../../../../execution/file/runtime-file-diff-report';
import { renderRuntimeFilesystemPostWriteLines } from '../../../../execution/file/runtime-file-post-write-report';
import { EDIT_TOOL_PARAMETERS } from '../../../../execution/edit/edit-tool.service';
import {
  editBuiltinRuntimeFile,
  readBuiltinRuntimeRequiredString,
  readBuiltinRuntimeRequiredText,
} from './runtime-tools-plugin-runtime';
import { createRuntimeEditToolData, createRuntimeToolTextResult } from './runtime-tools-plugin-result';

export const BUILTIN_RUNTIME_EDIT_TOOL_CAPABILITY: PluginCapability = {
  name: 'edit',
  description: [
    '在当前 backend 可见路径内对文本文件执行字符串替换。',
    '修改前必须先拿到该文件的当前内容；可先用 read 读取，或沿用同一 session 中最近一次成功 write/edit 后记录的当前版本。',
    '若文件自上次读取或修改后发生变化，需要重新读取。',
    '如果 oldString 找不到会报错；匹配到多个位置时请提供更多上下文或使用 replaceAll。',
  ].join('\n'),
  parameters: EDIT_TOOL_PARAMETERS,
};

export const runBuiltinRuntimeEditTool: PluginToolHandler<PluginHostFacadeMethods> = async (params, context) => {
  const oldString = readBuiltinRuntimeRequiredText(params.oldString, 'edit.oldString');
  const newString = readBuiltinRuntimeRequiredText(params.newString, 'edit.newString');
  if (oldString === newString) {
    throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
  }
  const result = await editBuiltinRuntimeFile(context, {
    filePath: readBuiltinRuntimeRequiredString(params.filePath, 'edit.filePath'),
    newString,
    oldString,
    ...(typeof params.replaceAll === 'boolean' ? { replaceAll: params.replaceAll } : {}),
  });
  return createRuntimeToolTextResult(renderRuntimeEditToolOutput(result, params.replaceAll === true), createRuntimeEditToolData(result));
};

function renderRuntimeEditToolOutput(
  result: Awaited<ReturnType<typeof editBuiltinRuntimeFile>>,
  replaceAll: boolean,
): string {
  return [
    '<edit_result>',
    `Path: ${result.path}`,
    `Occurrences: ${result.occurrences}`,
    `Mode: ${replaceAll ? 'replace-all' : 'replace-one'}`,
    `Strategy: ${result.strategy}`,
    `Diff: +${result.diff.additions} / -${result.diff.deletions}`,
    `Line delta: ${result.diff.beforeLineCount} -> ${result.diff.afterLineCount}`,
    ...renderRuntimeFilesystemDiffLines(result.diff),
    ...renderRuntimeFilesystemPostWriteLines(result.postWrite, { targetPath: result.path }),
    '</edit_result>',
  ].join('\n');
}
