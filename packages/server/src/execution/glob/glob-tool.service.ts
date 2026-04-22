import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import type { RuntimeFilesystemSkippedEntry } from '../runtime/runtime-filesystem-backend.types';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';

export interface GlobToolInput {
  backendKind: RuntimeBackendKind;
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
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
  ) {}

  getToolName(): string {
    return 'glob';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot;
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

  readInput(
    args: Record<string, unknown>,
    sessionId?: string,
    backendKind?: RuntimeBackendKind,
  ): GlobToolInput {
    if (!sessionId) {
      throw new BadRequestException('glob 工具只能在 session 上下文中使用');
    }
    const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : '';
    if (!pattern) {
      throw new BadRequestException('glob.pattern 不能为空');
    }
    return {
      backendKind: backendKind ?? this.runtimeFilesystemBackendService.getDefaultBackendKind(),
      ...(typeof args.path === 'string' && args.path.trim() ? { path: args.path.trim() } : {}),
      pattern,
      sessionId,
    };
  }

  async execute(input: GlobToolInput): Promise<GlobToolResult> {
    const result = await this.runtimeFilesystemBackendService.globPaths(input.sessionId, {
      maxResults: MAX_GLOB_RESULTS,
      pattern: input.pattern,
      ...(input.path ? { path: input.path } : {}),
    }, input.backendKind);
    return {
      count: result.totalMatches,
      output: [
        '<glob_result>',
        `Base: ${result.basePath}`,
        `Pattern: ${input.pattern}`,
        '<matches>',
        ...(result.matches.length > 0 ? result.matches : ['(no matches)']),
        result.truncated
          ? `(showing first ${result.matches.length} of ${result.totalMatches} matches. Refine path or pattern to continue.)`
          : `(total matches: ${result.totalMatches})`,
        ...formatGlobSearchDiagnostics(result.partial, result.skippedEntries, result.skippedPaths),
        '</matches>',
        '</glob_result>',
      ].filter((entry): entry is string => Boolean(entry)).join('\n'),
      truncated: result.truncated,
    };
  }

  readRuntimeAccess(input: GlobToolInput): RuntimeToolAccessRequest {
    return {
      backendKind: input.backendKind,
      metadata: {
        pattern: input.pattern,
        ...(input.path ? { path: input.path } : {}),
      },
      requiredOperations: ['file.list'],
      role: 'filesystem',
      summary: `按 glob 搜索路径 ${input.path ?? this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as GlobToolResult).output,
  });
}

function formatGlobSearchDiagnostics(
  partial: boolean,
  skippedEntries: RuntimeFilesystemSkippedEntry[],
  skippedPaths: string[],
): string[] {
  if (!partial && skippedEntries.length === 0 && skippedPaths.length === 0) {
    return [];
  }
  const inaccessibleEntries = skippedEntries.filter((entry) => entry.reason === 'inaccessible');
  const preview = inaccessibleEntries.map((entry) => entry.path);
  if (preview.length > 0) {
    return [formatSkippedEntrySummary('search may be incomplete; inaccessible paths were skipped', preview)];
  }
  if (skippedPaths.length > 0) {
    return [formatSkippedEntrySummary('search may be incomplete; inaccessible paths were skipped', skippedPaths)];
  }
  return ['(search may be incomplete; some paths were skipped)'];
}

function formatSkippedEntrySummary(prefix: string, paths: string[]): string {
  if (paths.length === 0) {
    return `(${prefix})`;
  }
  const previewLimit = 3;
  const visiblePaths = paths.slice(0, previewLimit);
  const hiddenCount = paths.length - visiblePaths.length;
  return [
    `(${prefix}: ${visiblePaths.join(', ')}`,
    hiddenCount > 0 ? `, +${hiddenCount} more` : '',
    ')',
  ].join('');
}
