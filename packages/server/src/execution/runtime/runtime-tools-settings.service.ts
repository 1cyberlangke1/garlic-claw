import type { JsonObject, JsonValue, PluginConfigSnapshot, PluginConfigSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsStore } from '../../core/config/settings.store';
import type { RuntimeCommandTextOutputOptions } from './runtime-command-output';
import { hasWindowsPowerShellRuntime } from './runtime-powershell-variant';

const RUNTIME_TOOLS_SOURCE_ID = 'runtime-tools';
const MAX_CONFIG_INTEGER = 1_000_000;
const RUNTIME_TOOLS_SECTION = 'runtimeTools';

interface RuntimeToolsConfigRecord {
  approvalMode?: RuntimeApprovalMode;
  bashOutput?: {
    maxBytes?: number;
    maxLines?: number;
    showTruncationDetails?: boolean;
  };
  shellBackend?: RuntimeBackendKind;
  toolOutputCapture?: {
    enabled?: boolean;
    maxBytes?: number;
    maxFilesPerSession?: number;
  };
}

export type RuntimeApprovalMode = 'review' | 'yolo';

export const RUNTIME_TOOLS_CONFIG_SCHEMA: PluginConfigSchema = {
  type: 'object',
  items: {
    approvalMode: {
      type: 'string',
      description: '执行工具审批模式',
      hint: 'review 表示需要审批；yolo 表示默认直通 ask 类工具操作。',
      defaultValue: 'review',
      options: [
        { label: '审批确认', value: 'review' },
        { label: 'YOLO 直通', value: 'yolo' },
      ],
    },
    shellBackend: {
      type: 'string',
      description: 'bash 执行后端',
      hint: process.platform === 'win32'
        ? '默认使用 just-bash；Windows 下可在 just-bash、PowerShell 与 WSL 之间热切换。'
        : '默认使用 bash；Linux 下只提供 bash backend。',
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
    toolOutputCapture: {
      type: 'object',
      description: '长工具输出落盘',
      hint: '工具返回正文过长时，把全文写入会话工作区文件，并在回传给 LLM 的截断结果里附上路径；同时自动清理旧文件。',
      collapsed: true,
      items: {
        enabled: {
          type: 'bool',
          description: '是否为过长工具输出自动保存全文文件。',
          defaultValue: true,
        },
        maxBytes: {
          type: 'int',
          description: '工具返回正文超过多少字节后触发全文落盘。设为 0 时表示禁用按大小触发。',
          defaultValue: 8 * 1024,
        },
        maxFilesPerSession: {
          type: 'int',
          description: '每个会话最多保留多少份工具全文输出文件；超出后自动删除最旧文件。',
          defaultValue: 20,
        },
      },
    },
  },
};

@Injectable()
export class RuntimeToolsSettingsService {
  private configValues: JsonObject;

  constructor(private readonly settingsStore: SettingsStore = new SettingsStore()) {
    this.configValues = sanitizeRuntimeToolsConfig(this.settingsStore.readSection(RUNTIME_TOOLS_SECTION));
  }

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
    this.settingsStore.writeSection(RUNTIME_TOOLS_SECTION, this.configValues);
    return this.getConfigSnapshot();
  }

  readConfiguredShellBackend(): RuntimeBackendKind | undefined {
    return readRuntimeToolsConfiguredShellBackend(this.configValues);
  }

  readBashOutputOptions(): RuntimeCommandTextOutputOptions {
    return readRuntimeToolsBashOutputOptions(this.configValues);
  }

  readApprovalMode(): RuntimeApprovalMode {
    return readRuntimeToolsApprovalMode(this.configValues);
  }

  readToolOutputCaptureOptions(): RuntimeToolOutputCaptureOptions {
    return readRuntimeToolsToolOutputCaptureOptions(this.configValues);
  }
}

export interface RuntimeToolOutputCaptureOptions {
  enabled: boolean;
  maxBytes: number;
  maxFilesPerSession: number;
}

export function readRuntimeToolsApprovalMode(config: JsonValue): RuntimeApprovalMode {
  const record = isJsonObject(config) ? config : null;
  const approvalMode = typeof record?.approvalMode === 'string'
    ? record.approvalMode.trim().toLowerCase()
    : '';
  return approvalMode === 'yolo' ? 'yolo' : 'review';
}

export function readRuntimeToolsConfiguredShellBackend(
  config: JsonValue,
  platform: NodeJS.Platform = process.platform,
): RuntimeBackendKind | undefined {
  const record = isJsonObject(config) ? config : null;
  const backendKind = typeof record?.shellBackend === 'string'
    ? record.shellBackend.trim()
    : '';
  if (!readRuntimeToolsShellBackendOptions(platform).some((option) => option.value === backendKind)) {
    return undefined;
  }
  if (backendKind === 'native-shell' && platform === 'win32' && !hasWindowsPowerShellRuntime()) {
    return 'just-bash';
  }
  return backendKind;
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

export function readRuntimeToolsToolOutputCaptureOptions(
  config: JsonValue,
): RuntimeToolOutputCaptureOptions {
  const record = isJsonObject(config) ? config : null;
  const capture = isJsonObject(record?.toolOutputCapture) ? record.toolOutputCapture : null;
  return {
    enabled: typeof capture?.enabled === 'boolean' ? capture.enabled : true,
    maxBytes: typeof capture?.maxBytes === 'number'
      ? readRuntimeToolsNonNegativeInteger(capture.maxBytes, 'runtime-tools.toolOutputCapture.maxBytes')
      : 8 * 1024,
    maxFilesPerSession: typeof capture?.maxFilesPerSession === 'number'
      ? Math.max(1, readRuntimeToolsNonNegativeInteger(capture.maxFilesPerSession, 'runtime-tools.toolOutputCapture.maxFilesPerSession'))
      : 20,
  };
}

function sanitizeRuntimeToolsConfig(values: JsonObject): JsonObject {
  const next: RuntimeToolsConfigRecord = {};
  if (typeof values.approvalMode === 'string') {
    const approvalMode = values.approvalMode.trim().toLowerCase();
    if (approvalMode === 'review' || approvalMode === 'yolo') {
      next.approvalMode = approvalMode;
    } else if (approvalMode) {
      throw new BadRequestException('runtime-tools.approvalMode 只能是 review / yolo');
    }
  }
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
  if (isJsonObject(values.toolOutputCapture)) {
    const toolOutputCapture: NonNullable<RuntimeToolsConfigRecord['toolOutputCapture']> = {};
    if (typeof values.toolOutputCapture.enabled === 'boolean') {
      toolOutputCapture.enabled = values.toolOutputCapture.enabled;
    }
    if (typeof values.toolOutputCapture.maxBytes === 'number') {
      toolOutputCapture.maxBytes = readRuntimeToolsNonNegativeInteger(values.toolOutputCapture.maxBytes, 'runtime-tools.toolOutputCapture.maxBytes');
    }
    if (typeof values.toolOutputCapture.maxFilesPerSession === 'number') {
      toolOutputCapture.maxFilesPerSession = readRuntimeToolsNonNegativeInteger(values.toolOutputCapture.maxFilesPerSession, 'runtime-tools.toolOutputCapture.maxFilesPerSession');
    }
    if (Object.keys(toolOutputCapture).length > 0) {
      next.toolOutputCapture = toolOutputCapture;
    }
  }
  return next as unknown as JsonObject;
}

function readRuntimeToolsDefaultShellBackend(platform: NodeJS.Platform = process.platform): RuntimeBackendKind {
  return platform === 'win32' ? 'just-bash' : 'native-shell';
}

function readRuntimeToolsShellBackendOptions(platform: NodeJS.Platform = process.platform): Array<{ label: string; value: RuntimeBackendKind }> {
  if (platform === 'win32') {
    return [
      { label: 'just-bash', value: 'just-bash' },
      { label: 'PowerShell', value: 'native-shell' },
      { label: 'WSL', value: 'wsl-shell' },
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
