import path from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema } from '@garlic-claw/shared';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeWorkspaceBackendService } from '../runtime/runtime-workspace-backend.service';

export interface GrepToolInput {
  include?: string;
  path?: string;
  pattern: string;
  sessionId: string;
}

export interface GrepToolResult {
  matches: number;
  output: string;
  truncated: boolean;
}

const MAX_GREP_MATCHES = 100;
const MAX_GREP_LINE_LENGTH = 2000;

export const GREP_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  pattern: {
    description: '要搜索的正则表达式。',
    required: true,
    type: 'string',
  },
  path: {
    description: '可选搜索路径。相对路径会基于当前 backend 的可见根解析，默认搜索整个可见文件系统。',
    required: false,
    type: 'string',
  },
  include: {
    description: '可选文件 glob 过滤，例如 `*.ts`、`**/*.md`。',
    required: false,
    type: 'string',
  },
};

@Injectable()
export class GrepToolService {
  constructor(private readonly runtimeWorkspaceBackendService: RuntimeWorkspaceBackendService) {}

  getToolName(): string {
    return 'grep';
  }

  buildToolDescription(): string {
    const visibleRoot = this.runtimeWorkspaceBackendService.getConfiguredBackend().getVisibleRoot();
    return [
      '在当前 backend 可见路径内按正则搜索文本文件内容。',
      visibleRoot === '/'
        ? 'path 可省略，或传 backend 可见的绝对路径。'
        : `path 参数只能位于 ${visibleRoot} 内。`,
      '会跳过二进制文件；include 可进一步限制参与搜索的文件。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return GREP_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>, sessionId?: string): GrepToolInput {
    if (!sessionId) {
      throw new BadRequestException('grep 工具只能在 session 上下文中使用');
    }
    const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : '';
    if (!pattern) {
      throw new BadRequestException('grep.pattern 不能为空');
    }
    return {
      ...(typeof args.include === 'string' && args.include.trim() ? { include: args.include.trim() } : {}),
      ...(typeof args.path === 'string' && args.path.trim() ? { path: args.path.trim() } : {}),
      pattern,
      sessionId,
    };
  }

  async execute(input: GrepToolInput): Promise<GrepToolResult> {
    let matcher: RegExp;
    try {
      matcher = new RegExp(input.pattern);
    } catch (error) {
      throw new BadRequestException(`grep.pattern 不是合法正则: ${(error as Error).message}`);
    }
    const workspaceBackend = this.runtimeWorkspaceBackendService.getConfiguredBackend();
    const listed = await workspaceBackend.listFiles(input.sessionId, input.path);
    const rows: Array<{ line: number; text: string; virtualPath: string }> = [];
    for (const file of listed.files) {
      const relativePath = toGrepRelativePath(listed.basePath, file.virtualPath);
      if (input.include && !matchesGrepInclude(input.include, relativePath)) {
        continue;
      }
      let textFile: { content: string; path: string };
      try {
        textFile = await workspaceBackend.readTextFile(input.sessionId, file.virtualPath);
      } catch (error) {
        if (isBinaryReadError(error)) {
          continue;
        }
        throw error;
      }
      if (!textFile.content.length) {
        continue;
      }
      const lines = splitGrepLines(textFile.content);
      for (let index = 0; index < lines.length; index += 1) {
        matcher.lastIndex = 0;
        if (!matcher.test(lines[index])) {
          continue;
        }
        rows.push({
          line: index + 1,
          text: truncateGrepLine(lines[index]),
          virtualPath: file.virtualPath,
        });
        if (rows.length > MAX_GREP_MATCHES) {
          break;
        }
      }
      if (rows.length > MAX_GREP_MATCHES) {
        break;
      }
    }
    const truncated = rows.length > MAX_GREP_MATCHES;
    const visible = truncated ? rows.slice(0, MAX_GREP_MATCHES) : rows;
    const groupedOutput = buildGrepOutput(visible);
    return {
      matches: rows.length,
      output: [
        '<grep_result>',
        `Pattern: ${input.pattern}`,
        input.include ? `Include: ${input.include}` : undefined,
        '<matches>',
        ...(groupedOutput.length > 0 ? groupedOutput : ['(no matches)']),
        truncated ? `... truncated to first ${MAX_GREP_MATCHES} matches` : `(total matches: ${rows.length})`,
        '</matches>',
        '</grep_result>',
      ].filter((entry): entry is string => Boolean(entry)).join('\n'),
      truncated,
    };
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
      metadata: {
        pattern: input.pattern,
        ...(input.include ? { include: input.include } : {}),
        ...(input.path ? { path: input.path } : {}),
      },
      requiredCapabilities: ['workspaceRead', 'persistentFilesystem'],
      role: 'workspace',
      summary: `按正则搜索路径 ${input.path ?? this.runtimeWorkspaceBackendService.getConfiguredBackend().getVisibleRoot()}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: (output as GrepToolResult).output,
  });
}

function buildGrepOutput(rows: Array<{ line: number; text: string; virtualPath: string }>): string[] {
  const output: string[] = [];
  let currentPath = '';
  for (const row of rows) {
    if (row.virtualPath !== currentPath) {
      currentPath = row.virtualPath;
      if (output.length > 0) {
        output.push('');
      }
      output.push(`${row.virtualPath}:`);
    }
    output.push(`  ${row.line}: ${row.text}`);
  }
  return output;
}

function matchesGrepInclude(pattern: string, relativePath: string): boolean {
  return path.posix.matchesGlob(relativePath, pattern)
    || (!pattern.includes('/') && path.posix.matchesGlob(path.posix.basename(relativePath), pattern));
}

function toGrepRelativePath(basePath: string, virtualPath: string): string {
  if (basePath === virtualPath) {
    return path.posix.basename(virtualPath);
  }
  const relative = path.posix.relative(basePath, virtualPath);
  return relative || path.posix.basename(virtualPath);
}

function splitGrepLines(content: string): string[] {
  if (!content.length) {
    return [];
  }
  return content.endsWith('\n')
    ? content.slice(0, -1).split('\n')
    : content.split('\n');
}

function truncateGrepLine(line: string): string {
  return line.length > MAX_GREP_LINE_LENGTH
    ? `${line.slice(0, MAX_GREP_LINE_LENGTH)}...`
    : line;
}

function isBinaryReadError(error: unknown): boolean {
  return error instanceof BadRequestException
    && error.message.includes('暂不支持读取二进制文件');
}
