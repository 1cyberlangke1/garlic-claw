import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from '../runtime/runtime-command.types';
import type { RuntimeFilesystemBackend } from '../runtime/runtime-filesystem-backend.types';
import { RuntimeFilesystemPostWriteService } from '../runtime/runtime-filesystem-post-write.service';
import { RuntimeMountedWorkspaceFileSystem } from '../runtime/runtime-mounted-workspace-file-system';
import type { RuntimeSessionEnvironment } from '../runtime/runtime-session-environment.types';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import {
  joinRuntimeVisiblePath,
  normalizeRuntimeVisiblePath,
  resolveRuntimeVisiblePath,
} from '../runtime/runtime-visible-path';
import { buildRuntimeFilesystemDiff } from './runtime-file-diff';
import { replaceRuntimeText } from './runtime-text-replace';
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
  RuntimeFilesystemSkippedEntry,
  RuntimeFilesystemSkippedReason,
  RuntimeFilesystemSymlinkResult,
  RuntimeFilesystemTransferResult,
  RuntimeFilesystemWriteResult,
} from '../runtime/runtime-filesystem-backend.types';

const HOST_FILESYSTEM_BACKEND_KIND = 'host-filesystem';
const MAX_READ_BYTES = 50 * 1024;
const MAX_READ_LINE_SUFFIX = '... (line truncated)';
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
    @Optional()
    private readonly runtimeFilesystemPostWriteService?: RuntimeFilesystemPostWriteService,
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
    const matches = await Promise.all(
      listed.files
        .filter((entry) => matchesFilesystemGlobPattern(
          input.pattern,
          toFilesystemRelativePath(listed.basePath, entry.virtualPath),
        ))
        .map(async (entry) => ({
          mtime: await readFilesystemMtime(entry.hostPath),
          virtualPath: entry.virtualPath,
        })),
    );
    matches.sort((left, right) => right.mtime - left.mtime || left.virtualPath.localeCompare(right.virtualPath));
    return {
      basePath: listed.basePath,
      matches: matches.slice(0, input.maxResults).map((entry) => entry.virtualPath),
      partial: listed.partial,
      skippedEntries: listed.skippedEntries,
      skippedPaths: listed.skippedPaths,
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
    const matchRows = new Map<string, Array<{ line: number; text: string }>>();
    const fileTimes = new Map<string, number>();
    let partial = listed.partial;
    const rows: RuntimeFilesystemGrepMatch[] = [];
    const skippedEntries = [...listed.skippedEntries];
    const skippedPaths = [...listed.skippedPaths];
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
          pushRuntimeSkippedEntry(skippedEntries, file.virtualPath, 'binary');
          continue;
        }
        partial = true;
        pushRuntimeSkippedPath(skippedPaths, file.virtualPath);
        pushRuntimeSkippedEntry(skippedEntries, file.virtualPath, 'unreadable');
        continue;
      }
      const lines = splitFilesystemTextLines(textFile.content);
      const currentRows: Array<{ line: number; text: string }> = [];
      for (let index = 0; index < lines.length; index += 1) {
        matcher.lastIndex = 0;
        if (!matcher.test(lines[index])) {
          continue;
        }
        currentRows.push({
          line: index + 1,
          text: truncateFilesystemLine(lines[index], input.maxLineLength),
        });
      }
      if (currentRows.length === 0) {
        continue;
      }
      matchRows.set(file.virtualPath, currentRows);
      fileTimes.set(file.virtualPath, await readFilesystemMtime(file.hostPath));
    }
    const orderedPaths = Array.from(matchRows.keys()).sort(
      (left, right) =>
        (fileTimes.get(right) ?? 0) - (fileTimes.get(left) ?? 0) || left.localeCompare(right),
    );
    for (const virtualPath of orderedPaths) {
      const fileRows = matchRows.get(virtualPath) ?? [];
      for (const row of fileRows) {
        rows.push({
          line: row.line,
          text: row.text,
          virtualPath,
        });
      }
    }
    const truncated = rows.length > input.maxMatches;
    return {
      matches: truncated ? rows.slice(0, input.maxMatches) : rows,
      partial,
      skippedEntries,
      skippedPaths,
      totalMatches: rows.length,
      truncated,
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
    const stat = await fsPromises.stat(target.hostPath);
    const mimeType = detectFilesystemMimeType(target.virtualPath);
    if (isFilesystemImageMimeType(mimeType)) {
      return {
        mimeType,
        path: target.virtualPath,
        size: stat.size,
        type: 'image',
      };
    }
    if (mimeType === 'application/pdf') {
      return {
        mimeType,
        path: target.virtualPath,
        size: stat.size,
        type: 'pdf',
      };
    }
    if (isBinaryFilesystemPath(target.virtualPath) || await containsBinaryContent(target.hostPath, stat.size)) {
      return {
        mimeType,
        path: target.virtualPath,
        size: stat.size,
        type: 'binary',
      };
    }
    const file = await readFilesystemTextRange(target.hostPath, {
      limit: input.limit,
      maxBytes: MAX_READ_BYTES,
      maxLineLength: input.maxLineLength,
      offset: input.offset,
    });
    return {
      byteLimited: file.byteLimited,
      limit: input.limit,
      lines: file.lines,
      mimeType,
      offset: input.offset,
      path: target.virtualPath,
      totalBytes: stat.size,
      totalLines: file.totalLines,
      truncated: file.truncated,
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
    const mimeType = detectFilesystemMimeType(target.virtualPath);
    if (
      mimeType === 'application/pdf'
      || isFilesystemImageMimeType(mimeType)
      || isBinaryFilesystemPath(target.virtualPath)
      || containsBinarySample(buffer)
    ) {
      throw new BadRequestException(`暂不支持读取二进制文件: ${target.virtualPath} (${mimeType})`);
    }
    return {
      content: buffer.toString('utf8').replace(/\r\n/g, '\n'),
      path: target.virtualPath,
    };
  }

  async listFiles(sessionId: string, inputPath?: string): Promise<{
    basePath: string;
    files: RuntimeHostFilesystemFileEntry[];
    partial: boolean;
    skippedEntries: RuntimeFilesystemSkippedEntry[];
    skippedPaths: string[];
  }> {
    const target = await this.requireExistingPath(sessionId, inputPath);
    if (target.type === 'file') {
      return {
        basePath: target.virtualPath,
        files: [{ hostPath: target.hostPath, virtualPath: target.virtualPath }],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
      };
    }
    const files: RuntimeHostFilesystemFileEntry[] = [];
    const traversal = {
      partial: false,
      skippedEntries: [] as RuntimeFilesystemSkippedEntry[],
      skippedPaths: [] as string[],
    };
    await collectRuntimeVisibleFiles(
      target.hostPath,
      target.virtualPath,
      files,
      new Set<string>(),
      traversal,
    );
    files.sort((left, right) => left.virtualPath.localeCompare(right.virtualPath));
    return {
      basePath: target.virtualPath,
      files,
      partial: traversal.partial,
      skippedEntries: traversal.skippedEntries,
      skippedPaths: traversal.skippedPaths,
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
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(
      sessionId,
    );
    if (target.exists && target.type !== 'file') {
      throw new BadRequestException(`路径不是文件: ${target.virtualPath}`);
    }
    const previousContent = await readRuntimeDiffBaseContent(target);
    const processed = this.runtimeFilesystemPostWriteService?.processTextFile({
      content,
      hostPath: target.hostPath,
      path: target.virtualPath,
      sessionRoot: sessionEnvironment.sessionRoot,
      visibleRoot: sessionEnvironment.visibleRoot,
    }) ?? {
      content,
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
    };
    await fsPromises.mkdir(path.dirname(target.hostPath), { recursive: true });
    await fsPromises.writeFile(target.hostPath, processed.content, 'utf8');
    return {
      created: !target.exists,
      diff: previousContent === null
        ? null
        : buildRuntimeFilesystemDiff(target.virtualPath, previousContent, processed.content),
      lineCount: countFilesystemTextLines(processed.content),
      postWrite: processed.postWrite,
      path: target.virtualPath,
      size: Buffer.byteLength(processed.content, 'utf8'),
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
    const file = await readRuntimeEditableTextFile(this, sessionId, input.filePath);
    const lineEnding = detectWorkspaceLineEnding(file.rawContent);
    const oldString = normalizeWorkspaceTextForReplacement(input.oldString);
    const newString = normalizeWorkspaceTextForReplacement(input.newString);
    const replaced = replaceRuntimeText(file.normalizedContent, oldString, newString, input.replaceAll);
    const nextContent = applyWorkspaceLineEnding(replaced.content, lineEnding);
    const writeResult = await this.writeTextFile(sessionId, file.path, nextContent);
    return {
      diff: writeResult.diff ?? buildRuntimeFilesystemDiff(writeResult.path, file.rawContent, nextContent),
      occurrences: replaced.occurrences,
      postWrite: writeResult.postWrite,
      path: writeResult.path,
      strategy: replaced.strategy,
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
      throw await this.createMissingPathException(sessionId, target.virtualPath);
    }
    return target;
  }

  private async createMissingPathException(
    sessionId: string,
    virtualPath: string,
  ): Promise<NotFoundException> {
    const suggestions = await readNearbyVisiblePaths(
      await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId),
      virtualPath,
    );
    if (suggestions.length === 0) {
      return new NotFoundException(`路径不存在: ${virtualPath}`);
    }
    return new NotFoundException(
      `路径不存在: ${virtualPath}\n可选路径：\n${suggestions.join('\n')}`,
    );
  }
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
  traversal: {
    partial: boolean;
    skippedEntries: RuntimeFilesystemSkippedEntry[];
    skippedPaths: string[];
  },
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = await fsPromises.lstat(hostPath);
  } catch {
    markRuntimeTraversalSkipped(traversal, virtualPath);
    return;
  }
  if (stat.isSymbolicLink()) {
    let resolved: string;
    let targetStat: fs.Stats;
    try {
      resolved = await fsPromises.realpath(hostPath);
      targetStat = await fsPromises.stat(hostPath);
    } catch {
      markRuntimeTraversalSkipped(traversal, virtualPath);
      return;
    }
    if (targetStat.isDirectory()) {
      if (visitedDirectories.has(resolved)) {
        return;
      }
      visitedDirectories.add(resolved);
      let entries: fs.Dirent[];
      try {
        entries = await fsPromises.readdir(hostPath, { withFileTypes: true });
      } catch {
        markRuntimeTraversalSkipped(traversal, virtualPath);
        return;
      }
      for (const entry of entries) {
        await collectRuntimeVisibleFiles(
          path.join(hostPath, entry.name),
          joinRuntimeVirtualPath(virtualPath, entry.name),
          files,
          visitedDirectories,
          traversal,
        );
      }
      return;
    }
    files.push({ hostPath, virtualPath });
    return;
  }
  if (stat.isDirectory()) {
    let resolved: string;
    try {
      resolved = await fsPromises.realpath(hostPath);
    } catch {
      markRuntimeTraversalSkipped(traversal, virtualPath);
      return;
    }
    if (visitedDirectories.has(resolved)) {
      return;
    }
    visitedDirectories.add(resolved);
    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(hostPath, { withFileTypes: true });
    } catch {
      markRuntimeTraversalSkipped(traversal, virtualPath);
      return;
    }
    for (const entry of entries) {
      await collectRuntimeVisibleFiles(
        path.join(hostPath, entry.name),
        joinRuntimeVirtualPath(virtualPath, entry.name),
        files,
        visitedDirectories,
        traversal,
      );
    }
    return;
  }
  files.push({ hostPath, virtualPath });
}

function joinRuntimeVirtualPath(basePath: string, nextPath: string): string {
  return joinRuntimeVisiblePath(basePath, nextPath);
}

function containsBinarySample(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 4096);
  if (sampleSize === 0) {
    return false;
  }
  let nonPrintableCount = 0;
  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
    if (buffer[index] < 9 || (buffer[index] > 13 && buffer[index] < 32)) {
      nonPrintableCount += 1;
    }
  }
  return nonPrintableCount / sampleSize > 0.3;
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

async function containsBinaryContent(hostPath: string, size: number): Promise<boolean> {
  if (size === 0) {
    return false;
  }
  const file = await fsPromises.open(hostPath, 'r');
  try {
    const sampleSize = Math.min(size, 4096);
    const buffer = Buffer.alloc(sampleSize);
    const result = await file.read(buffer, 0, sampleSize, 0);
    return containsBinarySample(buffer.subarray(0, result.bytesRead));
  } finally {
    await file.close();
  }
}

async function readRuntimeDiffBaseContent(
  target: RuntimeHostFilesystemResolvedPath,
): Promise<string | null> {
  if (!target.exists || target.type !== 'file') {
    return '';
  }
  const stat = await fsPromises.stat(target.hostPath);
  const mimeType = detectFilesystemMimeType(target.virtualPath);
  if (
    isFilesystemImageMimeType(mimeType)
    || mimeType === 'application/pdf'
    || isBinaryFilesystemPath(target.virtualPath)
    || await containsBinaryContent(target.hostPath, stat.size)
  ) {
    return null;
  }
  return fsPromises.readFile(target.hostPath, 'utf8');
}

function detectFilesystemMimeType(virtualPath: string): string {
  const extension = path.extname(virtualPath).toLowerCase();
  switch (extension) {
    case '.txt':
    case '.log':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    case '.json':
      return 'application/json';
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.mjs':
    case '.cjs':
    case '.css':
    case '.html':
    case '.xml':
    case '.yml':
    case '.yaml':
    case '.sh':
    case '.py':
    case '.rs':
    case '.go':
    case '.java':
    case '.c':
    case '.cc':
    case '.cpp':
    case '.h':
    case '.hpp':
      return 'text/plain';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.webp':
      return 'image/webp';
    case '.svg':
    case '.svgz':
      return 'image/svg+xml';
    case '.avif':
      return 'image/avif';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function isFilesystemImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
    && mimeType !== 'image/svg+xml'
    && mimeType !== 'image/vnd.fastbidsheet';
}

function isBinaryFilesystemPath(virtualPath: string): boolean {
  switch (path.extname(virtualPath).toLowerCase()) {
    case '.zip':
    case '.tar':
    case '.gz':
    case '.exe':
    case '.dll':
    case '.so':
    case '.class':
    case '.jar':
    case '.war':
    case '.7z':
    case '.doc':
    case '.docx':
    case '.xls':
    case '.xlsx':
    case '.ppt':
    case '.pptx':
    case '.odt':
    case '.ods':
    case '.odp':
    case '.bin':
    case '.dat':
    case '.obj':
    case '.o':
    case '.a':
    case '.lib':
    case '.wasm':
    case '.pyc':
    case '.pyo':
      return true;
    default:
      return false;
  }
}

async function readFilesystemTextRange(
  hostPath: string,
  input: {
    limit: number;
    maxBytes: number;
    maxLineLength: number;
    offset: number;
  },
): Promise<{
  byteLimited: boolean;
  lines: string[];
  totalLines: number;
  truncated: boolean;
}> {
  const stream = fs.createReadStream(hostPath, { encoding: 'utf8' });
  const lineReader = readline.createInterface({
    crlfDelay: Infinity,
    input: stream,
  });
  const startIndex = input.offset - 1;
  const lines: string[] = [];
  let bytes = 0;
  let byteLimited = false;
  let moreLines = false;
  let totalLines = 0;
  try {
    for await (const lineText of lineReader) {
      totalLines += 1;
      if (totalLines <= startIndex) {
        continue;
      }
      if (lines.length >= input.limit) {
        moreLines = true;
        continue;
      }
      const renderedLine = truncateFilesystemLine(lineText, input.maxLineLength);
      const renderedBytes = Buffer.byteLength(renderedLine, 'utf8') + (lines.length > 0 ? 1 : 0);
      if (bytes + renderedBytes > input.maxBytes) {
        byteLimited = true;
        moreLines = true;
        break;
      }
      lines.push(renderedLine);
      bytes += renderedBytes;
    }
  } finally {
    lineReader.close();
    stream.destroy();
  }
  if (startIndex > totalLines && !(startIndex === 0 && totalLines === 0)) {
    throw new BadRequestException(`read.offset 超出范围: ${input.offset}，文件总行数为 ${totalLines}`);
  }
  return {
    byteLimited,
    lines,
    totalLines,
    truncated: moreLines,
  };
}

async function readFilesystemMtime(hostPath: string): Promise<number> {
  const stat = await fsPromises.stat(hostPath);
  return stat.mtime.getTime();
}

async function readNearbyVisiblePaths(
  sessionEnvironment: RuntimeSessionEnvironment,
  virtualPath: string,
): Promise<string[]> {
  const virtualDirectory = path.posix.dirname(virtualPath);
  const directoryVirtualPath = virtualDirectory === '.' ? sessionEnvironment.visibleRoot : virtualDirectory;
  const directoryHostPath = toRuntimeHostPath(
    sessionEnvironment.sessionRoot,
    sessionEnvironment.visibleRoot,
    directoryVirtualPath,
  );
  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(directoryHostPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const missingName = path.posix.basename(virtualPath).toLowerCase();
  return entries
    .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name)
    .filter((entryName) => {
      const normalized = entryName.toLowerCase();
      return normalized.includes(missingName) || missingName.includes(normalized.replace(/\/$/, ''));
    })
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 3)
    .map((entryName) => normalizeRuntimeVisiblePath(`${directoryVirtualPath}/${entryName}`));
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
    ? `${line.slice(0, maxLineLength)}${MAX_READ_LINE_SUFFIX}`
    : line;
}

function normalizeWorkspaceLineEnding(content: string, lineEnding: '\n' | '\r\n'): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return lineEnding === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}

function countFilesystemTextLines(content: string): number {
  return splitFilesystemTextLines(content).length;
}

async function readRuntimeEditableTextFile(
  backend: RuntimeHostFilesystemBackendService,
  sessionId: string,
  inputPath: string,
): Promise<{
  normalizedContent: string;
  path: string;
  rawContent: string;
}> {
  const target = await backend.resolvePath(sessionId, inputPath);
  if (!target.exists || target.type !== 'file') {
    throw new BadRequestException(`路径不是文件: ${target.virtualPath}`);
  }
  const buffer = await fsPromises.readFile(target.hostPath);
  const mimeType = detectFilesystemMimeType(target.virtualPath);
  if (
    mimeType === 'application/pdf'
    || isFilesystemImageMimeType(mimeType)
    || isBinaryFilesystemPath(target.virtualPath)
    || containsBinarySample(buffer)
  ) {
    throw new BadRequestException(`暂不支持读取二进制文件: ${target.virtualPath} (${mimeType})`);
  }
  const rawContent = buffer.toString('utf8');
  return {
    normalizedContent: normalizeWorkspaceTextForReplacement(rawContent),
    path: target.virtualPath,
    rawContent,
  };
}

function normalizeWorkspaceTextForReplacement(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function applyWorkspaceLineEnding(content: string, lineEnding: '\n' | '\r\n'): string {
  return normalizeWorkspaceLineEnding(content, lineEnding);
}

function markRuntimeTraversalSkipped(
  traversal: {
    partial: boolean;
    skippedEntries: RuntimeFilesystemSkippedEntry[];
    skippedPaths: string[];
  },
  virtualPath: string,
): void {
  traversal.partial = true;
  pushRuntimeSkippedPath(traversal.skippedPaths, virtualPath);
  pushRuntimeSkippedEntry(traversal.skippedEntries, virtualPath, 'inaccessible');
}

function pushRuntimeSkippedPath(skippedPaths: string[], virtualPath: string): void {
  if (skippedPaths.includes(virtualPath)) {
    return;
  }
  skippedPaths.push(virtualPath);
}

function pushRuntimeSkippedEntry(
  skippedEntries: RuntimeFilesystemSkippedEntry[],
  virtualPath: string,
  reason: RuntimeFilesystemSkippedReason,
): void {
  if (skippedEntries.some((entry) => entry.path === virtualPath && entry.reason === reason)) {
    return;
  }
  skippedEntries.push({
    path: virtualPath,
    reason,
  });
}
