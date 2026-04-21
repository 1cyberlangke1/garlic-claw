import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from '../runtime/runtime-command.types';
import type { RuntimeFilesystemBackend } from '../runtime/runtime-filesystem-backend.types';
import { RuntimeMountedWorkspaceFileSystem } from '../runtime/runtime-mounted-workspace-file-system';
import type { RuntimeSessionEnvironment } from '../runtime/runtime-session-environment.types';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import type {
  RuntimeFilesystemDeleteResult,
  RuntimeFilesystemDirectoryResult,
  RuntimeFilesystemEditResult,
  RuntimeFilesystemFileEntry,
  RuntimeFilesystemGlobResult,
  RuntimeFilesystemGrepMatch,
  RuntimeFilesystemGrepResult,
  RuntimeFilesystemPathStat,
  RuntimeFilesystemReadResult,
  RuntimeFilesystemResolvedPath,
  RuntimeFilesystemSymlinkResult,
  RuntimeFilesystemTransferResult,
  RuntimeFilesystemWriteResult,
} from '../runtime/runtime-filesystem-backend.types';

const HOST_FILESYSTEM_BACKEND_KIND = 'host-filesystem';
const HOST_FILESYSTEM_BACKEND_DESCRIPTOR: RuntimeBackendDescriptor = {
  capabilities: {
    networkAccess: false,
    persistentFilesystem: true,
    persistentShellState: false,
    shellExecution: false,
    workspaceRead: true,
    workspaceWrite: true,
  },
  kind: HOST_FILESYSTEM_BACKEND_KIND,
  permissionPolicy: {
    networkAccess: 'deny',
    persistentFilesystem: 'allow',
    persistentShellState: 'deny',
    shellExecution: 'deny',
    workspaceRead: 'allow',
    workspaceWrite: 'allow',
  },
};

interface RuntimeHostFilesystemResolvedPath extends RuntimeFilesystemResolvedPath {
  hostPath: string;
}

interface RuntimeHostFilesystemFileEntry extends RuntimeFilesystemFileEntry {
  hostPath: string;
}

@Injectable()
export class RuntimeHostFilesystemBackendService implements RuntimeFilesystemBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
  ) {}

  getKind(): string {
    return HOST_FILESYSTEM_BACKEND_KIND;
  }

  getDescriptor(): RuntimeBackendDescriptor {
    return HOST_FILESYSTEM_BACKEND_DESCRIPTOR;
  }

  async copyPath(
    sessionId: string,
    fromPath: string,
    toPath: string,
  ): Promise<RuntimeFilesystemTransferResult> {
    const source = await this.requireExistingPath(sessionId, fromPath);
    const target = await this.resolvePath(sessionId, toPath);
    if (target.exists) {
      throw new BadRequestException(`目标路径已存在: ${target.virtualPath}`);
    }
    await fsPromises.mkdir(path.dirname(target.hostPath), { recursive: true });
    await fsPromises.cp(source.hostPath, target.hostPath, {
      errorOnExist: true,
      force: false,
      recursive: source.type === 'directory',
    });
    return {
      fromPath: source.virtualPath,
      path: target.virtualPath,
    };
  }

  async createSymlink(
    sessionId: string,
    input: {
      linkPath: string;
      targetPath: string;
    },
  ): Promise<RuntimeFilesystemSymlinkResult> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(
      sessionId,
    );
    const link = await this.resolvePath(sessionId, input.linkPath);
    if (link.exists) {
      throw new BadRequestException(`目标路径已存在: ${link.virtualPath}`);
    }
    await this.createMountedFilesystem(sessionEnvironment).symlink(input.targetPath, link.virtualPath);
    return {
      path: link.virtualPath,
      target: await this.createMountedFilesystem(sessionEnvironment).readlink(link.virtualPath),
    };
  }

  async deletePath(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDeleteResult> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (!target.exists) {
      return {
        deleted: false,
        path: target.virtualPath,
      };
    }
    await fsPromises.rm(target.hostPath, {
      force: true,
      recursive: target.type === 'directory',
    });
    return {
      deleted: true,
      path: target.virtualPath,
    };
  }

  async ensureDirectory(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDirectoryResult> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (target.exists && target.type !== 'directory') {
      throw new BadRequestException(`路径不是目录: ${target.virtualPath}`);
    }
    await fsPromises.mkdir(target.hostPath, { recursive: true });
    return {
      created: !target.exists,
      path: target.virtualPath,
    };
  }

  async globPaths(
    sessionId: string,
    input: {
      maxResults: number;
      pattern: string;
      path?: string;
    },
  ): Promise<RuntimeFilesystemGlobResult> {
    const target = await this.resolvePath(sessionId, input.path);
    if (!target.exists) {
      throw new BadRequestException(`路径不存在: ${target.virtualPath}`);
    }
    if (target.type !== 'directory') {
      throw new BadRequestException(`glob.path 不是目录: ${target.virtualPath}`);
    }
    const listed = await this.listFiles(sessionId, input.path);
    const matches = listed.files
      .map((entry) => entry.virtualPath)
      .filter((virtualPath) => matchesFilesystemGlobPattern(input.pattern, toFilesystemRelativePath(listed.basePath, virtualPath)));
    return {
      basePath: listed.basePath,
      matches: matches.slice(0, input.maxResults),
      totalMatches: matches.length,
      truncated: matches.length > input.maxResults,
    };
  }

  async grepText(
    sessionId: string,
    input: {
      include?: string;
      maxLineLength: number;
      maxMatches: number;
      path?: string;
      pattern: string;
    },
  ): Promise<RuntimeFilesystemGrepResult> {
    let matcher: RegExp;
    try {
      matcher = new RegExp(input.pattern);
    } catch (error) {
      throw new BadRequestException(`grep.pattern 不是合法正则: ${(error as Error).message}`);
    }
    const listed = await this.listFiles(sessionId, input.path);
    const rows: RuntimeFilesystemGrepMatch[] = [];
    for (const file of listed.files) {
      const relativePath = toFilesystemRelativePath(listed.basePath, file.virtualPath);
      if (input.include && !matchesFilesystemGlobPattern(input.include, relativePath)) {
        continue;
      }
      let textFile: { content: string; path: string };
      try {
        textFile = await this.readTextFile(sessionId, file.virtualPath);
      } catch (error) {
        if (isBinaryReadError(error)) {
          continue;
        }
        throw error;
      }
      const lines = splitFilesystemTextLines(textFile.content);
      for (let index = 0; index < lines.length; index += 1) {
        matcher.lastIndex = 0;
        if (!matcher.test(lines[index])) {
          continue;
        }
        rows.push({
          line: index + 1,
          text: truncateFilesystemLine(lines[index], input.maxLineLength),
          virtualPath: file.virtualPath,
        });
        if (rows.length >= input.maxMatches) {
          return {
            matches: rows,
            totalMatches: rows.length,
            truncated: true,
          };
        }
      }
    }
    return {
      matches: rows,
      totalMatches: rows.length,
      truncated: false,
    };
  }

  async resolvePath(sessionId: string, inputPath?: string): Promise<RuntimeHostFilesystemResolvedPath> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(
      sessionId,
    );
    const virtualPath = resolveRuntimeVisiblePath(sessionEnvironment.visibleRoot, inputPath);
    const hostPath = toRuntimeHostPath(
      sessionEnvironment.sessionRoot,
      sessionEnvironment.visibleRoot,
      virtualPath,
    );
    try {
      const stat = await fsPromises.stat(hostPath);
      return {
        exists: true,
        hostPath,
        type: stat.isDirectory() ? 'directory' : 'file',
        virtualPath,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return {
          exists: false,
          hostPath,
          type: 'missing',
          virtualPath,
        };
      }
      throw error;
    }
  }

  async readDirectoryEntries(sessionId: string, inputPath?: string): Promise<{ entries: string[]; path: string }> {
    const target = await this.requireExistingPath(sessionId, inputPath);
    if (target.type !== 'directory') {
      throw new BadRequestException(`路径不是目录: ${target.virtualPath}`);
    }
    const entries = await fsPromises.readdir(target.hostPath, { withFileTypes: true });
    return {
      entries: entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort((left, right) => left.localeCompare(right)),
      path: target.virtualPath,
    };
  }

  async readPathRange(
    sessionId: string,
    input: {
      limit: number;
      maxLineLength: number;
      offset: number;
      path?: string;
    },
  ): Promise<RuntimeFilesystemReadResult> {
    const target = await this.requireExistingPath(sessionId, input.path);
    if (target.type === 'directory') {
      const directory = await this.readDirectoryEntries(sessionId, input.path);
      const startIndex = input.offset - 1;
      const entries = directory.entries.slice(startIndex, startIndex + input.limit);
      return {
        entries,
        limit: input.limit,
        offset: input.offset,
        path: directory.path,
        totalEntries: directory.entries.length,
        truncated: startIndex + entries.length < directory.entries.length,
        type: 'directory',
      };
    }
    const file = await this.readTextFile(sessionId, input.path);
    const lines = splitFilesystemTextLines(file.content);
    const startIndex = input.offset - 1;
    if (startIndex > lines.length && !(startIndex === 0 && lines.length === 0)) {
      throw new BadRequestException(`read.offset 超出范围: ${input.offset}`);
    }
    const rangedLines = lines
      .slice(startIndex, startIndex + input.limit)
      .map((line) => truncateFilesystemLine(line, input.maxLineLength));
    return {
      limit: input.limit,
      lines: rangedLines,
      offset: input.offset,
      path: file.path,
      totalLines: lines.length,
      truncated: startIndex + rangedLines.length < lines.length,
      type: 'file',
    };
  }

  async readSymlink(sessionId: string, inputPath: string): Promise<RuntimeFilesystemSymlinkResult> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(
      sessionId,
    );
    const target = await this.requireExistingPath(sessionId, inputPath);
    const stat = await fsPromises.lstat(target.hostPath);
    if (!stat.isSymbolicLink()) {
      throw new BadRequestException(`路径不是符号链接: ${target.virtualPath}`);
    }
    return {
      path: target.virtualPath,
      target: await this.createMountedFilesystem(sessionEnvironment).readlink(target.virtualPath),
    };
  }

  async statPath(sessionId: string, inputPath?: string): Promise<RuntimeFilesystemPathStat> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (!target.exists) {
      return {
        ...target,
        mtime: null,
        size: null,
      };
    }
    const stat = await fsPromises.lstat(target.hostPath);
    return {
      ...target,
      mtime: stat.mtime.toISOString(),
      size: stat.size,
    };
  }

  async readTextFile(sessionId: string, inputPath?: string): Promise<{ content: string; path: string }> {
    const target = await this.requireExistingPath(sessionId, inputPath);
    if (target.type !== 'file') {
      throw new BadRequestException(`路径不是文件: ${target.virtualPath}`);
    }
    const buffer = await fsPromises.readFile(target.hostPath);
    if (containsBinaryContent(buffer)) {
      throw new BadRequestException(`暂不支持读取二进制文件: ${target.virtualPath}`);
    }
    return {
      content: buffer.toString('utf8').replace(/\r\n/g, '\n'),
      path: target.virtualPath,
    };
  }

  async listFiles(sessionId: string, inputPath?: string): Promise<{ basePath: string; files: RuntimeHostFilesystemFileEntry[] }> {
    const target = await this.requireExistingPath(sessionId, inputPath);
    if (target.type === 'file') {
      return {
        basePath: target.virtualPath,
        files: [{ hostPath: target.hostPath, virtualPath: target.virtualPath }],
      };
    }
    const files: RuntimeHostFilesystemFileEntry[] = [];
    await collectRuntimeVisibleFiles(target.hostPath, target.virtualPath, files, new Set<string>());
    files.sort((left, right) => left.virtualPath.localeCompare(right.virtualPath));
    return {
      basePath: target.virtualPath,
      files,
    };
  }

  async movePath(
    sessionId: string,
    fromPath: string,
    toPath: string,
  ): Promise<RuntimeFilesystemTransferResult> {
    const source = await this.requireExistingPath(sessionId, fromPath);
    const target = await this.resolvePath(sessionId, toPath);
    if (target.exists) {
      throw new BadRequestException(`目标路径已存在: ${target.virtualPath}`);
    }
    await fsPromises.mkdir(path.dirname(target.hostPath), { recursive: true });
    await fsPromises.rename(source.hostPath, target.hostPath);
    return {
      fromPath: source.virtualPath,
      path: target.virtualPath,
    };
  }

  async writeTextFile(sessionId: string, inputPath: string, content: string): Promise<RuntimeFilesystemWriteResult> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (target.exists && target.type !== 'file') {
      throw new BadRequestException(`路径不是文件: ${target.virtualPath}`);
    }
    await fsPromises.mkdir(path.dirname(target.hostPath), { recursive: true });
    await fsPromises.writeFile(target.hostPath, content, 'utf8');
    return {
      created: !target.exists,
      path: target.virtualPath,
    };
  }

  async editTextFile(
    sessionId: string,
    input: {
      filePath: string;
      newString: string;
      oldString: string;
      replaceAll?: boolean;
    },
  ): Promise<RuntimeFilesystemEditResult> {
    if (input.oldString === input.newString) {
      throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
    }
    const file = await this.readTextFile(sessionId, input.filePath);
    const lineEnding = detectWorkspaceLineEnding(file.content);
    const oldString = normalizeWorkspaceLineEnding(input.oldString, lineEnding);
    const newString = normalizeWorkspaceLineEnding(input.newString, lineEnding);
    const matchCount = countWorkspaceOccurrences(file.content, oldString);
    if (matchCount === 0) {
      throw new BadRequestException('edit.oldString 未在文件中找到');
    }
    if (!input.replaceAll && matchCount > 1) {
      throw new BadRequestException('edit.oldString 匹配到多个位置，请补更多上下文或使用 replaceAll');
    }
    const nextContent = input.replaceAll
      ? file.content.split(oldString).join(newString)
      : replaceWorkspaceFirst(file.content, oldString, newString);
    const writeResult = await this.writeTextFile(sessionId, file.path, nextContent);
    return {
      occurrences: matchCount,
      path: writeResult.path,
    };
  }

  private createMountedFilesystem(
    sessionEnvironment: RuntimeSessionEnvironment,
  ): RuntimeMountedWorkspaceFileSystem {
    return new RuntimeMountedWorkspaceFileSystem(
      sessionEnvironment.sessionRoot,
      sessionEnvironment.visibleRoot,
    );
  }

  private async requireExistingPath(
    sessionId: string,
    inputPath?: string,
  ): Promise<RuntimeHostFilesystemResolvedPath> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (!target.exists) {
      throw new NotFoundException(`路径不存在: ${target.virtualPath}`);
    }
    return target;
  }
}

function resolveRuntimeVisiblePath(visibleRoot: string, inputPath?: string): string {
  if (!inputPath || !inputPath.trim()) {
    return visibleRoot;
  }
  const normalized = inputPath.trim().startsWith('/')
    ? normalizeRuntimeVirtualPath(inputPath.trim())
    : normalizeRuntimeVirtualPath(`${visibleRoot}/${inputPath.trim()}`);
  if (visibleRoot !== '/' && normalized !== visibleRoot && !normalized.startsWith(`${visibleRoot}/`)) {
    throw new BadRequestException(`路径必须位于 ${visibleRoot} 内`);
  }
  return normalized;
}

function toRuntimeHostPath(sessionRoot: string, virtualRoot: string, virtualPath: string): string {
  const relativePath = readRelativeRuntimePath(virtualRoot, virtualPath);
  const hostPath = relativePath ? path.join(sessionRoot, ...relativePath.split('/')) : sessionRoot;
  const resolved = path.resolve(hostPath);
  const normalizedSessionRoot = path.resolve(sessionRoot);
  if (resolved !== normalizedSessionRoot && !resolved.startsWith(`${normalizedSessionRoot}${path.sep}`)) {
    throw new BadRequestException(`路径越界: ${virtualPath}`);
  }
  return resolved;
}

function readRelativeRuntimePath(virtualRoot: string, virtualPath: string): string {
  if (virtualRoot === '/') {
    return virtualPath.replace(/^\/+/, '');
  }
  return virtualPath === virtualRoot ? '' : virtualPath.slice(virtualRoot.length + 1);
}

function toFilesystemRelativePath(basePath: string, virtualPath: string): string {
  if (basePath === virtualPath) {
    return path.posix.basename(virtualPath);
  }
  const relative = path.posix.relative(basePath, virtualPath);
  return relative || path.posix.basename(virtualPath);
}

async function collectRuntimeVisibleFiles(
  hostPath: string,
  virtualPath: string,
  files: RuntimeHostFilesystemFileEntry[],
  visitedDirectories: Set<string>,
): Promise<void> {
  const stat = await fsPromises.lstat(hostPath);
  if (stat.isSymbolicLink()) {
    const resolved = await fsPromises.realpath(hostPath);
    const targetStat = await fsPromises.stat(hostPath);
    if (targetStat.isDirectory()) {
      if (visitedDirectories.has(resolved)) {
        return;
      }
      visitedDirectories.add(resolved);
      const entries = await fsPromises.readdir(hostPath, { withFileTypes: true });
      for (const entry of entries) {
        await collectRuntimeVisibleFiles(
          path.join(hostPath, entry.name),
          joinRuntimeVirtualPath(virtualPath, entry.name),
          files,
          visitedDirectories,
        );
      }
      return;
    }
    files.push({ hostPath, virtualPath });
    return;
  }
  if (stat.isDirectory()) {
    const resolved = await fsPromises.realpath(hostPath);
    if (visitedDirectories.has(resolved)) {
      return;
    }
    visitedDirectories.add(resolved);
    const entries = await fsPromises.readdir(hostPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectRuntimeVisibleFiles(
        path.join(hostPath, entry.name),
        joinRuntimeVirtualPath(virtualPath, entry.name),
        files,
        visitedDirectories,
      );
    }
    return;
  }
  files.push({ hostPath, virtualPath });
}

function joinRuntimeVirtualPath(basePath: string, nextPath: string): string {
  return normalizeRuntimeVirtualPath(`${basePath}/${nextPath}`);
}

function normalizeRuntimeVirtualPath(input: string): string {
  const parts = input.split('/').filter((entry) => entry.length > 0 && entry !== '.');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join('/')}`;
}

function containsBinaryContent(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8000);
  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}

function isBinaryReadError(error: unknown): boolean {
  return error instanceof BadRequestException
    && error.message.includes('暂不支持读取二进制文件');
}

function matchesFilesystemGlobPattern(pattern: string, relativePath: string): boolean {
  return path.posix.matchesGlob(relativePath, pattern)
    || (!pattern.includes('/') && path.posix.matchesGlob(path.posix.basename(relativePath), pattern));
}

function detectWorkspaceLineEnding(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function splitFilesystemTextLines(content: string): string[] {
  if (!content.length) {
    return [];
  }
  return content.endsWith('\n')
    ? content.slice(0, -1).split('\n')
    : content.split('\n');
}

function truncateFilesystemLine(line: string, maxLineLength: number): string {
  return line.length > maxLineLength
    ? `${line.slice(0, maxLineLength)}...`
    : line;
}

function normalizeWorkspaceLineEnding(content: string, lineEnding: '\n' | '\r\n'): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return lineEnding === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}

function countWorkspaceOccurrences(content: string, target: string): number {
  if (!target.length) {
    return 0;
  }
  let count = 0;
  let index = 0;
  while (index <= content.length) {
    const matchedIndex = content.indexOf(target, index);
    if (matchedIndex < 0) {
      break;
    }
    count += 1;
    index = matchedIndex + target.length;
  }
  return count;
}

function replaceWorkspaceFirst(content: string, oldString: string, newString: string): string {
  const matchedIndex = content.indexOf(oldString);
  if (matchedIndex < 0) {
    return content;
  }
  return `${content.slice(0, matchedIndex)}${newString}${content.slice(matchedIndex + oldString.length)}`;
}
