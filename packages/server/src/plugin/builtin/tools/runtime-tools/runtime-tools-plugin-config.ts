import type { JsonValue, PluginConfigOptionSchema, PluginConfigSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import type { RuntimeCommandTextOutputOptions } from '../../../../execution/runtime/runtime-command-output';

export const RUNTIME_TOOLS_CONFIG_SCHEMA: PluginConfigSchema = {
  type: 'object',
  items: {
    shellBackend: {
      type: 'string',
      description: 'bash 执行后端',
      hint: process.platform === 'win32'
        ? '默认使用 PowerShell；Windows 下可在 PowerShell 与 WSL 之间热切换。'
        : '默认使用 bash；Linux 下 builtin runtime-tools 只提供 bash backend。',
      defaultValue: readRuntimeToolsDefaultShellBackend(),
      options: readRuntimeToolsShellBackendOptions(),
    },
    bashOutput: {
      type: 'object',
      description: 'bash 输出治理',
      hint: '控制写回模型上下文的 bash 文本结果截断策略。',
      collapsed: true,
      items: {
        maxLines: {
          type: 'int',
          description: '单个 stdout/stderr 最多保留的尾部行数。设为 0 时不按行截断。',
          defaultValue: 200,
        },
        maxBytes: {
          type: 'int',
          description: '单个 stdout/stderr 最多保留的尾部字节数。设为 0 时不按字节截断。',
          defaultValue: 16 * 1024,
        },
        showTruncationDetails: {
          type: 'bool',
          description: '截断时是否显示总行数、总字节数与保留范围说明。',
          defaultValue: true,
        },
      },
    },
  },
};

export function readRuntimeToolsConfiguredShellBackend(config: JsonValue): RuntimeBackendKind | undefined {
  const backendKind = isRuntimeToolsConfigRecord(config) && typeof config.shellBackend === 'string'
    ? config.shellBackend.trim()
    : '';
  return readRuntimeToolsShellBackendOptions().some((option) => option.value === backendKind)
    ? backendKind
    : undefined;
}

export function readRuntimeToolsBashOutputOptions(config: JsonValue): RuntimeCommandTextOutputOptions {
  if (!isRuntimeToolsConfigRecord(config) || !isRuntimeToolsConfigRecord(config.bashOutput)) {
    return {};
  }
  return {
    ...(typeof config.bashOutput.maxLines === 'number' ? { maxLines: config.bashOutput.maxLines } : {}),
    ...(typeof config.bashOutput.maxBytes === 'number' ? { maxBytes: config.bashOutput.maxBytes } : {}),
    ...(typeof config.bashOutput.showTruncationDetails === 'boolean'
      ? { showTruncationDetails: config.bashOutput.showTruncationDetails }
      : {}),
  };
}

function isRuntimeToolsConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRuntimeToolsShellBackendOptions(): PluginConfigOptionSchema[] {
  if (process.platform === 'win32') {
    return [
      { label: 'PowerShell', value: 'native-shell' },
      { label: 'WSL', value: 'wsl-shell' },
    ];
  }
  return [{ label: 'bash', value: 'native-shell' }];
}

function readRuntimeToolsDefaultShellBackend(): RuntimeBackendKind {
  return 'native-shell';
}
