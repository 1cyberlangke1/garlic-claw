import path from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeWorkspaceBackendService } from '../runtime/runtime-workspace-backend.service';

export interface GlobToolInput {
  path?: string;
  pattern: string;
  sessionId: string;
}

export interface GlobToolResult {
  count: number;
  output: string;
  truncated: boolean;
}

const MAX_GLOB_RESULTS = 100;

export const GLOB_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  pattern: {
    description: '要匹配的 glob 模式，例如 `*.ts`、`**/*.md`。',
    required: true,
    type: 'string',
  },
  path: {
    description: '可选搜索目录。相对路径会基于当前 backend 的可见根解析，默认搜索整个可见文件系统。',
    required: false,
    type: 'string',
  },
};

@Injectable()
export class GlobToolService {
  constructor(private readonly runtimeWorkspaceBackendService: RuntimeWorkspaceBackendService) {}

  getToolName(): string {
    return 'glob';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeWorkspaceBackendService.getConfiguredBackend().getVisibleRoot();
    return [
      '在当前 backend 可见路径内按 glob 模式列出文件。',
      visibleRoot === '/'
        ? 'path 可省略，或传 backend 可见的绝对路径。'
        : `path 参数只能位于 ${visibleRoot} 内。`,
      '结果返回 backend 可见路径，不执行任何命令。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return GLOB_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>, sessionId?: string): GlobToolInput {
    if (!sessionId) {
      throw new BadRequestException('glob 工具只能在 session 上下文中使用');
    }
    const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : '';
    if (!pattern) {
      throw new BadRequestException('glob.pattern 不能为空');
    }
    return {
      ...(typeof args.path === 'string' && args.path.trim() ? { path: args.path.trim() } : {}),
      pattern,
      sessionId,
    };
  }

  async execute(input: GlobToolInput): Promise<GlobToolResult> {
    const workspaceBackend = this.runtimeWorkspaceBackendService.getConfiguredBackend();
    const target = await workspaceBackend.readExistingPath(input.sessionId, input.path);
    if (target.type !== 'directory') {
      throw new BadRequestException(`glob.path 不是目录: ${target.virtualPath}`);
    }
    const listed = await workspaceBackend.listFiles(input.sessionId, input.path);
    const matches = listed.files
      .map((entry) => entry.virtualPath)
      .filter((virtualPath) => matchesRuntimeGlobPattern(input.pattern, toSearchRelativePath(listed.basePath, virtualPath)));
    const truncated = matches.length > MAX_GLOB_RESULTS;
    const visible = truncated ? matches.slice(0, MAX_GLOB_RESULTS) : matches;
    return {
      count: matches.length,
      output: [
        '<glob_result>',
        `Base: ${listed.basePath}`,
        `Pattern: ${input.pattern}`,
        '<matches>',
        ...(visible.length > 0 ? visible : ['(no matches)']),
        truncated ? `... truncated to first ${MAX_GLOB_RESULTS} matches` : `(total matches: ${matches.length})`,
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated,
    };
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
      metadata: {
        pattern: input.pattern,
        ...(input.path ? { path: input.path } : {}),
      },
      requiredCapabilities: ['workspaceRead', 'persistentFilesystem'],
      role: 'workspace',
      summary: `按 glob 搜索路径 ${input.path ?? this.runtimeWorkspaceBackendService.getConfiguredBackend().getVisibleRoot()}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as GlobToolResult).output,
  });
}

function matchesRuntimeGlobPattern(pattern: string, relativePath: string): boolean {
  return path.posix.matchesGlob(relativePath, pattern)
    || (!pattern.includes('/') && path.posix.matchesGlob(path.posix.basename(relativePath), pattern));
}

function toSearchRelativePath(basePath: string, virtualPath: string): string {
  if (basePath === virtualPath) {
    return path.posix.basename(virtualPath);
  }
  const relative = path.posix.relative(basePath, virtualPath);
  return relative || path.posix.basename(virtualPath);
}
