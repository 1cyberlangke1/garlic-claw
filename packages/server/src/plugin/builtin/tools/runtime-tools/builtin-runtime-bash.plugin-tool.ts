import type { PluginToolHandler } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginCapability } from '@garlic-claw/shared';
import { BASH_TOOL_PARAMETERS } from '../../../../execution/bash/bash-tool.service';
import { renderRuntimeCommandTextOutput } from '../../../../execution/runtime/runtime-command-output';
import { readRuntimeToolsBashOutputOptions, readRuntimeToolsConfiguredShellBackend } from './runtime-tools-plugin-config';
import {
  executeBuiltinRuntimeCommand,
  readBuiltinRuntimeOptionalString,
  readBuiltinRuntimeOptionalTimeout,
  readBuiltinRuntimeRequiredString,
  readBuiltinRuntimeStoredConfig,
} from './runtime-tools-plugin-runtime';
import { createRuntimeToolTextResult } from './runtime-tools-plugin-result';

export const BUILTIN_RUNTIME_BASH_TOOL_CAPABILITY: PluginCapability = {
  name: 'bash',
  description: [
    '在当前 session 的执行后端中执行命令。',
    '命令语法跟随当前 shell backend：bash / WSL 使用 bash，Windows PowerShell backend 使用 PowerShell。',
    '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。',
    '每次调用都应写成自包含命令，不要假设 shell 状态会跨调用延续。',
    '优先使用 workdir 指定目录，不要把 cd 写进命令里。',
    '读取、搜索或编辑文件时优先使用 read / glob / grep / write / edit，不要用 bash 代替。',
  ].join('\n'),
  parameters: BASH_TOOL_PARAMETERS,
};

export const runBuiltinRuntimeBashTool: PluginToolHandler<PluginHostFacadeMethods> = async (params, context) => {
  const config = await context.host.getConfig();
  const shellBackend = readRuntimeToolsConfiguredShellBackend(readBuiltinRuntimeStoredConfig(context));
  const timeout = readBuiltinRuntimeOptionalTimeout(params.timeout);
  const workdir = readBuiltinRuntimeOptionalString(params.workdir);
  const result = await executeBuiltinRuntimeCommand(context, {
    ...(shellBackend ? { backendKind: shellBackend } : {}),
    command: readBuiltinRuntimeRequiredString(params.command, 'bash.command'),
    description: readBuiltinRuntimeRequiredString(params.description, 'bash.description'),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(workdir ? { workdir } : {}),
  });
  return createRuntimeToolTextResult(
    renderRuntimeCommandTextOutput(result, readRuntimeToolsBashOutputOptions(config)),
  );
};
