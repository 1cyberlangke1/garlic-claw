import type { PluginManifest, PluginRuntimeCommandResult } from '@garlic-claw/shared';
import { BASH_TOOL_PARAMETERS } from '../../../execution/bash/bash-tool.service';
import { EDIT_TOOL_PARAMETERS } from '../../../execution/edit/edit-tool.service';
import { GLOB_TOOL_PARAMETERS } from '../../../execution/glob/glob-tool.service';
import { GREP_TOOL_PARAMETERS } from '../../../execution/grep/grep-tool.service';
import { READ_TOOL_PARAMETERS } from '../../../execution/read/read-tool.service';
import { WRITE_TOOL_PARAMETERS } from '../../../execution/write/write-tool.service';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

const RUNTIME_TOOLS_MANIFEST: PluginManifest = {
  id: 'builtin.runtime-tools',
  name: 'Runtime Tools',
  version: '1.0.0',
  runtime: 'local',
  description: '暴露当前 runtime backend 的命令与文件系统工具。',
  permissions: ['runtime:command', 'runtime:read', 'runtime:write'],
  tools: [
    {
      name: 'bash',
      description: [
        '在当前 session 的执行后端中执行 bash 命令。',
        '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。',
        '每次调用都应写成自包含命令，不要假设 shell 状态会跨调用延续。',
      ].join('\n'),
      parameters: BASH_TOOL_PARAMETERS,
    },
    {
      name: 'read',
      description: [
        '读取当前 backend 可见路径内的文本文件，或列出目录内容。',
        '该工具不执行命令，只负责稳定读取文件系统内容。',
      ].join('\n'),
      parameters: READ_TOOL_PARAMETERS,
    },
    {
      name: 'glob',
      description: [
        '在当前 backend 可见路径内按 glob 模式列出文件。',
        '结果返回 backend 可见路径，不执行任何命令。',
      ].join('\n'),
      parameters: GLOB_TOOL_PARAMETERS,
    },
    {
      name: 'grep',
      description: [
        '在当前 backend 可见路径内按正则搜索文本文件内容。',
        '会跳过二进制文件；include 可进一步限制参与搜索的文件。',
      ].join('\n'),
      parameters: GREP_TOOL_PARAMETERS,
    },
    {
      name: 'write',
      description: [
        '在当前 backend 可见路径内整文件写入内容。',
        '如果文件已存在会完整覆盖；如果文件不存在会自动创建父目录。',
      ].join('\n'),
      parameters: WRITE_TOOL_PARAMETERS,
    },
    {
      name: 'edit',
      description: [
        '在当前 backend 可见路径内对文本文件执行精确字符串替换。',
        '如果 oldString 找不到会报错；匹配到多个位置时请提供更多上下文或使用 replaceAll。',
      ].join('\n'),
      parameters: EDIT_TOOL_PARAMETERS,
    },
  ],
};

export const BUILTIN_RUNTIME_TOOLS_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-required',
    canDisable: false,
    defaultEnabled: true,
  },
  manifest: RUNTIME_TOOLS_MANIFEST,
  tools: {
    bash: async (params, context) => renderToolTextOutput(formatBashOutput(await context.host.executeRuntimeCommand({
      command: String(params.command ?? ''),
      description: String(params.description ?? ''),
      ...(typeof params.timeout === 'number' ? { timeout: params.timeout } : {}),
      ...(typeof params.workdir === 'string' ? { workdir: params.workdir } : {}),
    }))),
    read: async (params, context) => renderToolTextOutput((await context.host.readRuntimePath({
      filePath: String(params.filePath ?? ''),
      ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
      ...(typeof params.offset === 'number' ? { offset: params.offset } : {}),
    })).output),
    glob: async (params, context) => renderToolTextOutput((await context.host.globRuntimePaths({
      pattern: String(params.pattern ?? ''),
      ...(typeof params.path === 'string' ? { path: params.path } : {}),
    })).output),
    grep: async (params, context) => renderToolTextOutput((await context.host.grepRuntimeContent({
      pattern: String(params.pattern ?? ''),
      ...(typeof params.include === 'string' ? { include: params.include } : {}),
      ...(typeof params.path === 'string' ? { path: params.path } : {}),
    })).output),
    write: async (params, context) => renderToolTextOutput((await context.host.writeRuntimeFile({
      content: String(params.content ?? ''),
      filePath: String(params.filePath ?? ''),
    })).output),
    edit: async (params, context) => renderToolTextOutput((await context.host.editRuntimeFile({
      filePath: String(params.filePath ?? ''),
      newString: String(params.newString ?? ''),
      oldString: String(params.oldString ?? ''),
      ...(typeof params.replaceAll === 'boolean' ? { replaceAll: params.replaceAll } : {}),
    })).output),
  },
};

function renderToolTextOutput(value: string) {
  return {
    kind: 'tool:text',
    value,
  } as const;
}

function formatBashOutput(result: PluginRuntimeCommandResult): string {
  return [
    '<bash_result>',
    `cwd: ${result.cwd}`,
    `exit_code: ${result.exitCode}`,
    '<stdout>',
    result.stdout || '(empty)',
    '</stdout>',
    '<stderr>',
    result.stderr || '(empty)',
    '</stderr>',
    '</bash_result>',
  ].join('\n');
}
