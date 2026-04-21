import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';

export interface ReadToolInput {
  filePath: string;
  limit?: number;
  offset?: number;
  sessionId: string;
}

export interface ReadToolResult {
  output: string;
  path: string;
  truncated: boolean;
  type: 'directory' | 'file';
}

const DEFAULT_READ_LIMIT = 2000;
const MAX_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

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

  readInput(args: Record<string, unknown>, sessionId?: string): ReadToolInput {
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
    });
    if (result.type === 'directory') {
      const startIndex = result.offset - 1;
      return {
        output: [
          '<read_result>',
          `Path: ${result.path}`,
          'Type: directory',
          '<entries>',
          ...(result.entries.length > 0 ? result.entries : ['(empty)']),
          result.truncated
            ? `... more entries available after ${startIndex + result.entries.length}`
            : `(total entries: ${result.totalEntries})`,
          '</entries>',
          '</read_result>',
        ].join('\n'),
        path: result.path,
        truncated: result.truncated,
        type: 'directory',
      };
    }
    const startIndex = result.offset - 1;
    return {
      output: [
        '<read_result>',
        `Path: ${result.path}`,
        'Type: file',
        '<content>',
        ...(result.lines.length > 0
          ? result.lines.map((line, index) => `${startIndex + index + 1}: ${line}`)
          : ['(empty)']),
        result.truncated
          ? `... more lines available after ${startIndex + result.lines.length}`
          : `(end of file, total lines: ${result.totalLines})`,
        '</content>',
        '</read_result>',
      ].join('\n'),
      path: result.path,
      truncated: result.truncated,
      type: 'file',
    };
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
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
