import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import { renderRuntimeGrepSearchDiagnostics } from '../file/runtime-search-diagnostics';
import { renderRuntimeGrepContinuationHint, renderRuntimeSearchEmptyHint, renderRuntimeSearchReadFollowUpHint, renderRuntimeSearchSuggestedReadHint, renderRuntimeSearchTotalSummary, renderRuntimeSearchTruncationSummary } from '../file/runtime-search-result-report';
import { ProjectWorktreeSearchOverlayService } from '../project/project-worktree-search-overlay.service';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';

export interface GrepToolInput { backendKind: RuntimeBackendKind; include?: string; path?: string; pattern: string; sessionId: string; }
export interface GrepToolResult { matches: number; output: string; truncated: boolean; }

const MAX_GREP_MATCHES = 100;
const MAX_GREP_LINE_LENGTH = 2000;
export const GREP_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  pattern: { description: '要搜索的正则表达式。', required: true, type: 'string' },
  path: { description: '可选搜索路径。相对路径会基于当前 backend 的可见根解析，默认搜索整个可见文件系统。', required: false, type: 'string' },
  include: { description: '可选文件 glob 过滤，例如 `*.ts`、`**/*.md`。', required: false, type: 'string' },
};

@Injectable()
export class GrepToolService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
    @Optional() private readonly projectWorktreeSearchOverlayService?: ProjectWorktreeSearchOverlayService,
  ) {}

  getToolName(): string { return 'grep'; }
  getToolParameters(): Record<string, PluginParamSchema> { return GREP_TOOL_PARAMETERS; }

  buildToolDescription(): string {
    const { visibleRoot } = this.runtimeSessionEnvironmentService.getDescriptor();
    return ['在当前 backend 可见路径内按正则搜索文本文件内容。', visibleRoot === '/' ? 'path 可省略，或传 backend 可见的绝对路径。' : `path 参数只能位于 ${visibleRoot} 内。`, '会跳过二进制文件；include 可进一步限制参与搜索的文件。'].join('\n');
  }

  readInput(args: Record<string, unknown>, sessionId?: string, backendKind?: RuntimeBackendKind): GrepToolInput {
    if (!sessionId) {throw new BadRequestException('grep 工具只能在 session 上下文中使用');}
    const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : '';
    if (!pattern) {throw new BadRequestException('grep.pattern 不能为空');}
    return {
      backendKind: backendKind ?? this.runtimeFilesystemBackendService.getDefaultBackendKind(),
      ...(typeof args.include === 'string' && args.include.trim() ? { include: args.include.trim() } : {}),
      ...(typeof args.path === 'string' && args.path.trim() ? { path: args.path.trim() } : {}),
      pattern,
      sessionId,
    };
  }

  async execute(input: GrepToolInput): Promise<GrepToolResult> {
    const result = await this.runtimeFilesystemBackendService.grepText(input.sessionId, { ...(input.include ? { include: input.include } : {}), maxLineLength: MAX_GREP_LINE_LENGTH, maxMatches: MAX_GREP_MATCHES, ...(input.path ? { path: input.path } : {}), pattern: input.pattern }, input.backendKind);
    const overlay = await this.projectWorktreeSearchOverlayService?.buildSearchOverlay({ basePath: result.basePath, matches: result.matches, sessionId: input.sessionId }) ?? [];
    return {
      matches: result.totalMatches,
      output: ['<grep_result>', `Base: ${result.basePath}`, ...overlay, `Pattern: ${input.pattern}`, input.include ? `Include: ${input.include}` : undefined, '<matches>', ...buildRuntimeGrepOutput(result.matches), result.matches.length > 0 ? undefined : '(no matches)', result.truncated ? renderRuntimeSearchTruncationSummary({ continuationHint: renderRuntimeGrepContinuationHint(input.include), shown: result.matches.length, total: result.totalMatches }) : renderRuntimeSearchTotalSummary({ emptyHint: renderRuntimeSearchEmptyHint(input.include), followUpHint: result.totalMatches > 0 ? renderRuntimeSearchReadFollowUpHint('grep') : undefined, total: result.totalMatches }), renderRuntimeSearchSuggestedReadHint(result.matches), ...renderRuntimeGrepSearchDiagnostics(result.partial, result.skippedEntries, result.skippedPaths), '</matches>', '</grep_result>'].filter((entry): entry is string => Boolean(entry)).join('\n'),
      truncated: result.truncated,
    };
  }

  readRuntimeAccess(input: GrepToolInput): RuntimeToolAccessRequest {
    return { backendKind: input.backendKind, metadata: { pattern: input.pattern, ...(input.include ? { include: input.include } : {}), ...(input.path ? { path: input.path } : {}) }, requiredOperations: ['file.read', 'file.list'], role: 'filesystem', summary: `按正则搜索路径 ${input.path ?? this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot}` };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({ type: 'text', value: (output as GrepToolResult).output });
}

function buildRuntimeGrepOutput(rows: Array<{ line: number; text: string; virtualPath: string }>): string[] {
  const output: string[] = [];
  let currentPath = '';
  for (const row of rows) {
    if (row.virtualPath !== currentPath) {
      currentPath = row.virtualPath;
      if (output.length > 0) {output.push('');}
      output.push(`${row.virtualPath}:`);
    }
    output.push(`  ${row.line}: ${row.text}`);
  }
  return output;
}
