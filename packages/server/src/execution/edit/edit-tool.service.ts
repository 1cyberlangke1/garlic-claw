import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';

export interface EditToolInput {
  filePath: string;
  newString: string;
  oldString: string;
  replaceAll?: boolean;
  sessionId: string;
}

export interface EditToolResult {
  occurrences: number;
  output: string;
  path: string;
  strategy: string;
}

export const EDIT_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  filePath: {
    description: '要修改的文件路径。相对路径会基于当前 backend 的可见根解析。',
    required: true,
    type: 'string',
  },
  oldString: {
    description: '要被替换的原始文本。优先精确匹配；若缩进或空白略有差异，会尝试按更宽松的文本策略定位。',
    required: true,
    type: 'string',
  },
  newString: {
    description: '替换后的文本。',
    required: true,
    type: 'string',
  },
  replaceAll: {
    description: '是否替换全部匹配项，默认 false。',
    required: false,
    type: 'boolean',
  },
};

@Injectable()
export class EditToolService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
  ) {}

  getToolName(): string {
    return 'edit';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot;
    return [
      '在当前 backend 可见路径内对文本文件执行字符串替换。',
      visibleRoot === '/'
        ? 'filePath 可传相对路径或 backend 可见的绝对路径。'
        : `filePath 必须位于 ${visibleRoot} 内。`,
      '会优先尝试精确匹配；如果只存在缩进或空白差异，会自动尝试更宽松的文本匹配策略。',
      '如果 oldString 找不到会报错；如果匹配到多个位置，则需要提供更多上下文或使用 replaceAll。',
      '该工具不执行命令，只负责文本替换。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return EDIT_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>, sessionId?: string): EditToolInput {
    if (!sessionId) {
      throw new BadRequestException('edit 工具只能在 session 上下文中使用');
    }
    const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
    if (!filePath) {
      throw new BadRequestException('edit.filePath 不能为空');
    }
    if (typeof args.oldString !== 'string' || !args.oldString.length) {
      throw new BadRequestException('edit.oldString 不能为空');
    }
    if (typeof args.newString !== 'string') {
      throw new BadRequestException('edit.newString 必须是字符串');
    }
    if (args.oldString === args.newString) {
      throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
    }
    const replaceAll = typeof args.replaceAll === 'boolean' ? args.replaceAll : undefined;
    return {
      filePath,
      newString: args.newString,
      oldString: args.oldString,
      ...(replaceAll !== undefined ? { replaceAll } : {}),
      sessionId,
    };
  }

  async execute(input: EditToolInput): Promise<EditToolResult> {
    const result = await this.runtimeFilesystemBackendService.editTextFile(input.sessionId, {
      filePath: input.filePath,
      newString: input.newString,
      oldString: input.oldString,
      ...(input.replaceAll !== undefined ? { replaceAll: input.replaceAll } : {}),
    });
    return {
      occurrences: result.occurrences,
      output: [
        '<edit_result>',
        `Path: ${result.path}`,
        `Occurrences: ${result.occurrences}`,
        `Mode: ${input.replaceAll ? 'replace-all' : 'replace-one'}`,
        `Strategy: ${result.strategy}`,
        '</edit_result>',
      ].join('\n'),
      path: result.path,
      strategy: result.strategy,
    };
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
      metadata: {
        filePath: input.filePath,
        ...(input.replaceAll !== undefined ? { replaceAll: input.replaceAll } : {}),
      },
      requiredOperations: ['file.edit'],
      role: 'filesystem',
      summary: `修改路径 ${input.filePath}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as EditToolResult).output,
  });
}
