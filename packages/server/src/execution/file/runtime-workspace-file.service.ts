import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from '../runtime/runtime-command.types';
import { RuntimeWorkspaceService } from '../runtime/runtime-workspace.service';
import type {
  RuntimeWorkspaceBackend,
  RuntimeWorkspaceEditResult,
  RuntimeWorkspaceFileEntry,
  RuntimeWorkspaceResolvedPath,
  RuntimeWorkspaceWriteResult,
} from '../runtime/runtime-workspace-backend.types';

const HOST_WORKSPACE_BACKEND_KIND = 'host-workspace';
const HOST_WORKSPACE_BACKEND_DESCRIPTOR: RuntimeBackendDescriptor = {
  capabilities: {
    networkAccess: false,
    persistentFilesystem: true,
    persistentShellState: false,
    shellExecution: false,
    workspaceRead: true,
    workspaceWrite: true,
  },
  kind: HOST_WORKSPACE_BACKEND_KIND,
  permissionPolicy: {
    networkAccess: 'deny',
    persistentFilesystem: 'allow',
    persistentShellState: 'deny',
    shellExecution: 'deny',
    workspaceRead: 'allow',
    workspaceWrite: 'allow',
  },
};

interface RuntimeWorkspaceHostResolvedPath extends RuntimeWorkspaceResolvedPath {
  hostPath: string;
}

interface RuntimeWorkspaceHostFileEntry extends RuntimeWorkspaceFileEntry {
  hostPath: string;
}

@Injectable()
export class RuntimeWorkspaceFileService implements RuntimeWorkspaceBackend {
  constructor(private readonly runtimeWorkspaceService: RuntimeWorkspaceService) {}

  getKind(): string {
    return HOST_WORKSPACE_BACKEND_KIND;
  }

  getDescriptor(): RuntimeBackendDescriptor {
    return HOST_WORKSPACE_BACKEND_DESCRIPTOR;
  }

  getVirtualWorkspaceRoot(): string {
    return this.runtimeWorkspaceService.getVirtualWorkspaceRoot();
  }

  async resolvePath(sessionId: string, inputPath?: string): Promise<RuntimeWorkspaceHostResolvedPath> {
    const workspaceRoot = await this.runtimeWorkspaceService.resolveWorkspaceRoot(sessionId);
    const virtualPath = resolveRuntimeWorkspacePath(this.getVirtualWorkspaceRoot(), inputPath);
    const hostPath = toRuntimeHostPath(workspaceRoot, this.getVirtualWorkspaceRoot(), virtualPath);
    try {
      const stat = await fsPromises.stat(hostPath);
      return {
        exists: true,
        hostPath,
        type: stat.isDirectory() ? 'directory' : 'file',
        virtualPath,
        workspaceRoot,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return {
          exists: false,
          hostPath,
          type: 'missing',
          virtualPath,
          workspaceRoot,
        };
      }
      throw error;
    }
  }

  async readExistingPath(sessionId: string, inputPath?: string): Promise<RuntimeWorkspaceHostResolvedPath> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (!target.exists) {
      throw new NotFoundException(`路径不存在: ${target.virtualPath}`);
    }
    return target;
  }

  async readDirectoryEntries(sessionId: string, inputPath?: string): Promise<{ entries: string[]; path: string }> {
    const target = await this.readExistingPath(sessionId, inputPath);
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

  async readTextFile(sessionId: string, inputPath?: string): Promise<{ content: string; path: string }> {
    const target = await this.readExistingPath(sessionId, inputPath);
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

  async listFiles(sessionId: string, inputPath?: string): Promise<{ basePath: string; files: RuntimeWorkspaceHostFileEntry[] }> {
    const target = await this.readExistingPath(sessionId, inputPath);
    if (target.type === 'file') {
      return {
        basePath: target.virtualPath,
        files: [{ hostPath: target.hostPath, virtualPath: target.virtualPath }],
      };
    }
    const files: RuntimeWorkspaceHostFileEntry[] = [];
    await collectRuntimeWorkspaceFiles(target.hostPath, target.virtualPath, files, new Set<string>());
    files.sort((left, right) => left.virtualPath.localeCompare(right.virtualPath));
    return {
      basePath: target.virtualPath,
      files,
    };
  }

  async writeTextFile(sessionId: string, inputPath: string, content: string): Promise<RuntimeWorkspaceWriteResult> {
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
  ): Promise<RuntimeWorkspaceEditResult> {
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
}

function resolveRuntimeWorkspacePath(workspaceRoot: string, inputPath?: string): string {
  if (!inputPath || !inputPath.trim()) {
    return workspaceRoot;
  }
  const normalized = inputPath.trim().startsWith('/')
    ? normalizeRuntimeVirtualPath(inputPath.trim())
    : normalizeRuntimeVirtualPath(`${workspaceRoot}/${inputPath.trim()}`);
  if (normalized !== workspaceRoot && !normalized.startsWith(`${workspaceRoot}/`)) {
    throw new BadRequestException(`路径必须位于 ${workspaceRoot} 内`);
  }
  return normalized;
}

function toRuntimeHostPath(workspaceRoot: string, virtualRoot: string, virtualPath: string): string {
  const relativePath = virtualPath === virtualRoot ? '' : virtualPath.slice(virtualRoot.length + 1);
  const hostPath = relativePath ? path.join(workspaceRoot, ...relativePath.split('/')) : workspaceRoot;
  const resolved = path.resolve(hostPath);
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  if (resolved !== normalizedWorkspaceRoot && !resolved.startsWith(`${normalizedWorkspaceRoot}${path.sep}`)) {
    throw new BadRequestException(`路径越界: ${virtualPath}`);
  }
  return resolved;
}

async function collectRuntimeWorkspaceFiles(
  hostPath: string,
  virtualPath: string,
  files: RuntimeWorkspaceHostFileEntry[],
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
        await collectRuntimeWorkspaceFiles(
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
      await collectRuntimeWorkspaceFiles(
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

function detectWorkspaceLineEnding(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
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
