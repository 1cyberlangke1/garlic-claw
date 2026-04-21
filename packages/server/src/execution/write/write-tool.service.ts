import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';

export interface WriteToolInput {
  content: string;
  filePath: string;
  sessionId: string;
}

export interface WriteToolResult {
  created: boolean;
  lineCount: number;
  output: string;
  path: string;
  size: number;
}

export const WRITE_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  filePath: {
    description: '要写入的文件路径。相对路径会基于当前 backend 的可见根解析。',
    required: true,
    type: 'string',
  },
  content: {
    description: '要写入文件的完整内容。',
    required: true,
    type: 'string',
  },
};

@Injectable()
export class WriteToolService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
  ) {}

  getToolName(): string {
    return 'write';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot;
    return [
      '在当前 backend 可见路径内整文件写入内容。',
      visibleRoot === '/'
        ? 'filePath 可传相对路径或 backend 可见的绝对路径。'
        : `filePath 必须位于 ${visibleRoot} 内。`,
      '如果文件已存在，会被完整覆盖；如果文件不存在，会自动创建父目录。',
      '该工具不执行命令，只负责文件系统写入。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return WRITE_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>, sessionId?: string): WriteToolInput {
    if (!sessionId) {
      throw new BadRequestException('write 工具只能在 session 上下文中使用');
    }
    const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
    if (!filePath) {
      throw new BadRequestException('write.filePath 不能为空');
    }
    if (typeof args.content !== 'string') {
      throw new BadRequestException('write.content 必须是字符串');
    }
    return {
      content: args.content,
      filePath,
      sessionId,
    };
  }

  async execute(input: WriteToolInput): Promise<WriteToolResult> {
    const result = await this.runtimeFilesystemBackendService.writeTextFile(
      input.sessionId,
      input.filePath,
      input.content,
    );
    return {
      created: result.created,
      lineCount: result.lineCount,
      output: [
        '<write_result>',
        `Path: ${result.path}`,
        `Status: ${result.created ? 'created' : 'overwritten'}`,
        `Lines: ${result.lineCount}`,
        `Size: ${formatWriteSize(result.size)}`,
        '</write_result>',
      ].join('\n'),
      path: result.path,
      size: result.size,
    };
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
      metadata: {
        filePath: input.filePath,
      },
      requiredOperations: ['file.write'],
      role: 'filesystem',
      summary: `写入路径 ${input.filePath}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as WriteToolResult).output,
  });
}

function formatWriteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
