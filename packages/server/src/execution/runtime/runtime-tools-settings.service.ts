import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, JsonValue, PluginConfigSnapshot, PluginConfigSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';
import type { RuntimeCommandTextOutputOptions } from './runtime-command-output';

const RUNTIME_TOOLS_CONFIG_FILE = 'runtime-tools.json';
const RUNTIME_TOOLS_SOURCE_ID = 'runtime-tools';
const MAX_CONFIG_INTEGER = 1_000_000;

interface RuntimeToolsConfigRecord {
  bashOutput?: {
    maxBytes?: number;
    maxLines?: number;
    showTruncationDetails?: boolean;
  };
  shellBackend?: RuntimeBackendKind;
}

export const RUNTIME_TOOLS_CONFIG_SCHEMA: PluginConfigSchema = {
  type: 'object',
  items: {
    shellBackend: {
      type: 'string',
      description: 'bash 执行后端',
      hint: process.platform === 'win32'
        ? '默认使用 PowerShell；Windows 下可在 PowerShell、WSL 与 just-bash 之间热切换。'
        : '默认使用 bash；Linux 下只提供 bash backend。',
      defaultValue: 'native-shell',
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

@Injectable()
export class RuntimeToolsSettingsService {
  private readonly configPath = resolveRuntimeToolsConfigPath();
  private configValues: JsonObject = loadRuntimeToolsConfig(this.configPath);

  getSourceId(): string {
    return RUNTIME_TOOLS_SOURCE_ID;
  }

  getConfigSnapshot(): PluginConfigSnapshot {
    return {
      schema: RUNTIME_TOOLS_CONFIG_SCHEMA,
      values: structuredClone(this.configValues),
    };
  }

  getStoredConfig(): JsonObject {
    return structuredClone(this.configValues);
  }

  updateConfig(values: JsonObject): PluginConfigSnapshot {
    this.configValues = sanitizeRuntimeToolsConfig(values);
    persistRuntimeToolsConfig(this.configPath, this.configValues);
    return this.getConfigSnapshot();
  }

  readConfiguredShellBackend(): RuntimeBackendKind | undefined {
    return readRuntimeToolsConfiguredShellBackend(this.configValues);
  }

  readBashOutputOptions(): RuntimeCommandTextOutputOptions {
    return readRuntimeToolsBashOutputOptions(this.configValues);
  }
}

export function readRuntimeToolsConfiguredShellBackend(config: JsonValue): RuntimeBackendKind | undefined {
  const record = isJsonObject(config) ? config : null;
  const backendKind = typeof record?.shellBackend === 'string'
    ? record.shellBackend.trim()
    : '';
  return readRuntimeToolsShellBackendOptions().some((option) => option.value === backendKind)
    ? backendKind
    : undefined;
}

export function readRuntimeToolsBashOutputOptions(config: JsonValue): RuntimeCommandTextOutputOptions {
  const record = isJsonObject(config) ? config : null;
  const bashOutput = isJsonObject(record?.bashOutput) ? record.bashOutput : null;
  if (!bashOutput) {
    return {};
  }
  return {
    ...(typeof bashOutput.maxLines === 'number' ? { maxLines: bashOutput.maxLines } : {}),
    ...(typeof bashOutput.maxBytes === 'number' ? { maxBytes: bashOutput.maxBytes } : {}),
    ...(typeof bashOutput.showTruncationDetails === 'boolean'
      ? { showTruncationDetails: bashOutput.showTruncationDetails }
      : {}),
  };
}

function sanitizeRuntimeToolsConfig(values: JsonObject): JsonObject {
  const next: RuntimeToolsConfigRecord = {};
  if (typeof values.shellBackend === 'string') {
    const shellBackend = values.shellBackend.trim();
    if (readRuntimeToolsShellBackendOptions().some((option) => option.value === shellBackend)) {
      next.shellBackend = shellBackend;
    } else if (shellBackend) {
      throw new BadRequestException('runtime-tools.shellBackend 必须命中声明的 options');
    }
  }
  if (isJsonObject(values.bashOutput)) {
    const bashOutput: NonNullable<RuntimeToolsConfigRecord['bashOutput']> = {};
    if (typeof values.bashOutput.maxLines === 'number') {
      bashOutput.maxLines = readRuntimeToolsNonNegativeInteger(values.bashOutput.maxLines, 'runtime-tools.bashOutput.maxLines');
    }
    if (typeof values.bashOutput.maxBytes === 'number') {
      bashOutput.maxBytes = readRuntimeToolsNonNegativeInteger(values.bashOutput.maxBytes, 'runtime-tools.bashOutput.maxBytes');
    }
    if (typeof values.bashOutput.showTruncationDetails === 'boolean') {
      bashOutput.showTruncationDetails = values.bashOutput.showTruncationDetails;
    }
    if (Object.keys(bashOutput).length > 0) {
      next.bashOutput = bashOutput;
    }
  }
  return next as unknown as JsonObject;
}

function resolveRuntimeToolsConfigPath(): string {
  if (process.env.JEST_WORKER_ID) {
    return process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH
      ?? path.join(process.cwd(), 'tmp', `config-runtime-tools.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  }
  return process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH
    ?? path.join(new ProjectWorktreeRootService().resolveRoot(process.cwd()), 'config', RUNTIME_TOOLS_CONFIG_FILE);
}

function loadRuntimeToolsConfig(configPath: string): JsonObject {
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonValue;
    return sanitizeRuntimeToolsConfig(isJsonObject(parsed) ? parsed : {});
  } catch {
    return {};
  }
}

function persistRuntimeToolsConfig(configPath: string, values: JsonObject): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(values, null, 2), 'utf-8');
}

function readRuntimeToolsShellBackendOptions(): Array<{ label: string; value: RuntimeBackendKind }> {
  if (process.platform === 'win32') {
    return [
      { label: 'PowerShell', value: 'native-shell' },
      { label: 'WSL', value: 'wsl-shell' },
      { label: 'just-bash', value: 'just-bash' },
    ];
  }
  return [{ label: 'bash', value: 'native-shell' }];
}

function readRuntimeToolsNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${fieldName} 必须是大于等于 0 的整数`);
  }
  return Math.min(value, MAX_CONFIG_INTEGER);
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
