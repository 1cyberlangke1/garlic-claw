import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import { RuntimeFileFreshnessService } from '../runtime/runtime-file-freshness.service';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';

export interface ReadToolInput {
  backendKind: RuntimeBackendKind;
  filePath: string;
  limit?: number;
  offset?: number;
  sessionId: string;
}

export interface ReadToolResult {
  output: string;
  path: string;
  truncated: boolean;
  type: 'binary' | 'directory' | 'file' | 'image' | 'pdf';
}

const DEFAULT_READ_LIMIT = 2000;
const MAX_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_READ_BYTES_LABEL = '50 KB';

export const READ_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  filePath: {
    description: '要读取的文件或目录路径。相对路径会基于当前 backend 的可见根解析。',
    required: true,
    type: 'string',
  },
  offset: {
    description: '从第几行或第几个目录项开始读取，1 起始，默认 1。',
    required: false,
    type: 'number',
  },
  limit: {
    description: `最多读取多少行或目录项，默认 ${DEFAULT_READ_LIMIT}，最大 ${MAX_READ_LIMIT}。`,
    required: false,
    type: 'number',
  },
};

@Injectable()
export class ReadToolService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
    private readonly runtimeFileFreshnessService: RuntimeFileFreshnessService,
  ) {}

  getToolName(): string {
    return 'read';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot;
    return [
      '读取当前 backend 可见路径内的文本文件，或列出目录内容。',
      visibleRoot === '/'
        ? '可传相对路径或 backend 可见的绝对路径。'
        : `路径必须位于 ${visibleRoot} 内。`,
      '该工具不会执行命令，只负责稳定读取文件系统内容。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return READ_TOOL_PARAMETERS;
  }

  readInput(
    args: Record<string, unknown>,
    sessionId?: string,
    backendKind?: RuntimeBackendKind,
  ): ReadToolInput {
    if (!sessionId) {
      throw new BadRequestException('read 工具只能在 session 上下文中使用');
    }
    const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
    if (!filePath) {
      throw new BadRequestException('read.filePath 不能为空');
    }
    const offset = readPositiveInteger(args.offset, 'read.offset');
    const limit = readPositiveInteger(args.limit, 'read.limit');
    if (limit !== undefined && limit > MAX_READ_LIMIT) {
      throw new BadRequestException(`read.limit 不能超过 ${MAX_READ_LIMIT}`);
    }
    return {
      backendKind: backendKind ?? this.runtimeFilesystemBackendService.getDefaultBackendKind(),
      filePath,
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
      sessionId,
    };
  }

  async execute(input: ReadToolInput): Promise<ReadToolResult> {
    const result = await this.runtimeFilesystemBackendService.readPathRange(input.sessionId, {
      limit: input.limit ?? DEFAULT_READ_LIMIT,
      maxLineLength: MAX_LINE_LENGTH,
      offset: input.offset ?? 1,
      path: input.filePath,
    }, input.backendKind);
    if (result.type !== 'directory') {
      await this.runtimeFileFreshnessService.rememberRead(input.sessionId, result.path, input.backendKind);
    }
    if (result.type === 'directory') {
      const startIndex = result.offset - 1;
      const endIndex = startIndex + result.entries.length;
      return {
        output: [
          '<read_result>',
          `Path: ${result.path}`,
          'Type: directory',
          '<entries>',
          ...(result.entries.length > 0 ? result.entries : ['(empty)']),
          result.truncated
            ? `(showing entries ${startIndex + 1}-${endIndex} of ${result.totalEntries}. Use offset=${endIndex + 1} to continue.)`
            : `(total entries: ${result.totalEntries})`,
          '</entries>',
          '</read_result>',
        ].join('\n'),
        path: result.path,
        truncated: result.truncated,
        type: 'directory',
      };
    }
    if (result.type === 'image' || result.type === 'pdf' || result.type === 'binary') {
      return {
        output: [
          '<read_result>',
          `Path: ${result.path}`,
          `Type: ${result.type}`,
          `Mime: ${result.mimeType}`,
          `Size: ${formatReadSize(result.size)}`,
          result.type === 'image'
            ? 'Image file detected. Text content was not expanded.'
            : result.type === 'pdf'
              ? 'PDF file detected. Text content was not expanded.'
              : 'Binary file detected. Text content was not expanded.',
          '</read_result>',
        ].join('\n'),
        path: result.path,
        truncated: false,
        type: result.type,
      };
    }
    if (result.type !== 'file') {
      throw new BadRequestException(`不支持的 read 结果类型: ${String((result as { type?: unknown }).type)}`);
    }
    const startIndex = result.offset - 1;
    const endIndex = startIndex + result.lines.length;
    return {
      output: [
        '<read_result>',
        `Path: ${result.path}`,
        'Type: file',
        `Mime: ${result.mimeType}`,
        '<content>',
        ...(result.lines.length > 0
          ? result.lines.map((line: string, index: number) => `${startIndex + index + 1}: ${line}`)
          : ['(empty)']),
        result.byteLimited
          ? `(output capped at ${MAX_READ_BYTES_LABEL}. Showing lines ${startIndex + 1}-${endIndex}. Use offset=${endIndex + 1} to continue.)`
          : result.truncated
            ? `(showing lines ${startIndex + 1}-${endIndex} of ${result.totalLines}. Use offset=${endIndex + 1} to continue.)`
            : `(end of file, total lines: ${result.totalLines}, total bytes: ${formatReadSize(result.totalBytes)})`,
        '</content>',
        ...buildReadSystemReminder(
          this.runtimeFileFreshnessService.listRecentReads(input.sessionId, {
            excludePath: result.path,
            limit: 5,
          }),
        ),
        '</read_result>',
      ].join('\n'),
      path: result.path,
      truncated: result.truncated,
      type: 'file',
    };
  }

  readRuntimeAccess(input: ReadToolInput): RuntimeToolAccessRequest {
    return {
      backendKind: input.backendKind,
      metadata: {
        filePath: input.filePath,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      },
      requiredOperations: ['file.read'],
      role: 'filesystem',
      summary: `读取路径 ${input.filePath}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as ReadToolResult).output,
  });
}

function readPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} 必须是大于 0 的整数`);
  }
  return value;
}

function formatReadSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildReadSystemReminder(loadedPaths: string[]): string[] {
  if (loadedPaths.length === 0) {
    return [];
  }
  return [
    '<system-reminder>',
    '本 session 近期还读取过这些文件：',
    ...loadedPaths.map((virtualPath) => `- ${virtualPath}`),
    '如需跨文件继续修改，优先复用这些已读取内容；若文件可能已变化，请先重新 read。',
    '</system-reminder>',
  ];
}
