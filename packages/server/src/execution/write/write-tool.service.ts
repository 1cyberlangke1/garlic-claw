import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeWorkspaceBackendService } from '../runtime/runtime-workspace-backend.service';

export interface WriteToolInput {
  content: string;
  filePath: string;
  sessionId: string;
}

export interface WriteToolResult {
  created: boolean;
  output: string;
  path: string;
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
  constructor(private readonly runtimeWorkspaceBackendService: RuntimeWorkspaceBackendService) {}

  getToolName(): string {
    return 'write';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeWorkspaceBackendService.getConfiguredBackend().getVisibleRoot();
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
    const result = await this.runtimeWorkspaceBackendService.getConfiguredBackend().writeTextFile(input.sessionId, input.filePath, input.content);
    return {
      created: result.created,
      output: [
        '<write_result>',
        `Path: ${result.path}`,
        `Status: ${result.created ? 'created' : 'overwritten'}`,
        '</write_result>',
      ].join('\n'),
      path: result.path,
    };
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
      metadata: {
        filePath: input.filePath,
      },
      requiredCapabilities: ['workspaceWrite', 'persistentFilesystem'],
      role: 'workspace',
      summary: `写入路径 ${input.filePath}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as WriteToolResult).output,
  });
}
