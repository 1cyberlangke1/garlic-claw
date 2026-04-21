import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { resolveProjectWorkspaceRoot } from '../../runtime/host/project-workspace-root';

export interface ProjectWorktreeResolvedPath {
  absolutePath: string;
  exists: boolean;
  projectRoot: string;
  relativePath: string;
  type: 'directory' | 'file' | 'missing';
}

export interface ProjectWorktreeFileEntry {
  absolutePath: string;
  relativePath: string;
}

export interface ProjectWorktreeWriteResult {
  created: boolean;
  path: string;
}

export interface ProjectWorktreeEditResult {
  occurrences: number;
  path: string;
}

@Injectable()
export class ProjectWorktreeFileService {
  getProjectRoot(): string {
    return resolveProjectWorkspaceRoot();
  }

  async resolvePath(inputPath?: string): Promise<ProjectWorktreeResolvedPath> {
    const projectRoot = this.getProjectRoot();
    const absolutePath = resolveProjectPath(projectRoot, inputPath);
    const relativePath = toProjectRelativePath(projectRoot, absolutePath);
    try {
      const stat = await fsPromises.stat(absolutePath);
      return {
        absolutePath,
        exists: true,
        projectRoot,
        relativePath,
        type: stat.isDirectory() ? 'directory' : 'file',
      };
    } catch (error) {
      if (isNotFound(error)) {
        return {
          absolutePath,
          exists: false,
          projectRoot,
          relativePath,
          type: 'missing',
        };
      }
      throw error;
    }
  }

  async readExistingPath(inputPath?: string): Promise<ProjectWorktreeResolvedPath> {
    const target = await this.resolvePath(inputPath);
    if (!target.exists) {
      throw new NotFoundException(`路径不存在: ${target.relativePath}`);
    }
    return target;
  }

  async readDirectoryEntries(inputPath?: string): Promise<{ entries: string[]; path: string }> {
    const target = await this.readExistingPath(inputPath);
    if (target.type !== 'directory') {
      throw new BadRequestException(`路径不是目录: ${target.relativePath}`);
    }
    const entries = await fsPromises.readdir(target.absolutePath, { withFileTypes: true });
    return {
      entries: entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort((left, right) => left.localeCompare(right)),
      path: target.relativePath,
    };
  }

  async readTextFile(inputPath?: string): Promise<{ content: string; path: string }> {
    const target = await this.readExistingPath(inputPath);
    if (target.type !== 'file') {
      throw new BadRequestException(`路径不是文件: ${target.relativePath}`);
    }
    const buffer = await fsPromises.readFile(target.absolutePath);
    if (containsBinaryContent(buffer)) {
      throw new BadRequestException(`暂不支持读取二进制文件: ${target.relativePath}`);
    }
    return {
      content: buffer.toString('utf8').replace(/\r\n/g, '\n'),
      path: target.relativePath,
    };
  }

  async listFiles(inputPath?: string): Promise<{ basePath: string; files: ProjectWorktreeFileEntry[] }> {
    const target = await this.readExistingPath(inputPath);
    if (target.type === 'file') {
      return {
        basePath: target.relativePath,
        files: [{ absolutePath: target.absolutePath, relativePath: target.relativePath }],
      };
    }

    const files: ProjectWorktreeFileEntry[] = [];
    await collectProjectFiles(target.projectRoot, target.absolutePath, files, new Set<string>());
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return {
      basePath: target.relativePath,
      files,
    };
  }

  async writeTextFile(inputPath: string, content: string): Promise<ProjectWorktreeWriteResult> {
    const target = await this.resolvePath(inputPath);
    if (target.exists && target.type !== 'file') {
      throw new BadRequestException(`路径不是文件: ${target.relativePath}`);
    }
    await fsPromises.mkdir(path.dirname(target.absolutePath), { recursive: true });
    await fsPromises.writeFile(target.absolutePath, content, 'utf8');
    return {
      created: !target.exists,
      path: target.relativePath,
    };
  }

  async editTextFile(input: {
    filePath: string;
    newString: string;
    oldString: string;
    replaceAll?: boolean;
  }): Promise<ProjectWorktreeEditResult> {
    if (input.oldString === input.newString) {
      throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
    }
    const file = await this.readTextFile(input.filePath);
    const lineEnding = detectLineEnding(file.content);
    const oldString = normalizeLineEnding(input.oldString, lineEnding);
    const newString = normalizeLineEnding(input.newString, lineEnding);
    const matchCount = countOccurrences(file.content, oldString);
    if (matchCount === 0) {
      throw new BadRequestException('edit.oldString 未在文件中找到');
    }
    if (!input.replaceAll && matchCount > 1) {
      throw new BadRequestException('edit.oldString 匹配到多个位置，请补更多上下文或使用 replaceAll');
    }
    const nextContent = input.replaceAll
      ? file.content.split(oldString).join(newString)
      : replaceFirst(file.content, oldString, newString);
    const writeResult = await this.writeTextFile(file.path, nextContent);
    return {
      occurrences: matchCount,
      path: writeResult.path,
    };
  }
}

function resolveProjectPath(projectRoot: string, inputPath?: string): string {
  const normalizedInput = typeof inputPath === 'string' ? inputPath.trim() : '';
  const absolutePath = normalizedInput
    ? path.resolve(path.isAbsolute(normalizedInput) ? normalizedInput : path.join(projectRoot, normalizedInput))
    : path.resolve(projectRoot);
  const normalizedProjectRoot = path.resolve(projectRoot);
  if (absolutePath !== normalizedProjectRoot && !absolutePath.startsWith(`${normalizedProjectRoot}${path.sep}`)) {
    throw new BadRequestException(`路径必须位于项目目录内: ${normalizedInput || '.'}`);
  }
  return absolutePath;
}

function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const relativePath = path.relative(projectRoot, absolutePath);
  return relativePath ? relativePath.replace(/\\/g, '/') : '.';
}

async function collectProjectFiles(
  projectRoot: string,
  absolutePath: string,
  files: ProjectWorktreeFileEntry[],
  visitedDirectories: Set<string>,
): Promise<void> {
  const stat = await fsPromises.lstat(absolutePath);
  if (stat.isSymbolicLink()) {
    const resolved = await fsPromises.realpath(absolutePath);
    const targetStat = await fsPromises.stat(absolutePath);
    if (targetStat.isDirectory()) {
      if (visitedDirectories.has(resolved)) {
        return;
      }
      visitedDirectories.add(resolved);
      const entries = await fsPromises.readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries) {
        await collectProjectFiles(projectRoot, path.join(absolutePath, entry.name), files, visitedDirectories);
      }
      return;
    }
    files.push({
      absolutePath,
      relativePath: toProjectRelativePath(projectRoot, absolutePath),
    });
    return;
  }

  if (stat.isDirectory()) {
    const resolved = await fsPromises.realpath(absolutePath);
    if (visitedDirectories.has(resolved)) {
      return;
    }
    visitedDirectories.add(resolved);
    const entries = await fsPromises.readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      await collectProjectFiles(projectRoot, path.join(absolutePath, entry.name), files, visitedDirectories);
    }
    return;
  }

  files.push({
    absolutePath,
    relativePath: toProjectRelativePath(projectRoot, absolutePath),
  });
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  return error.code === 'ENOENT';
}

function containsBinaryContent(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function detectLineEnding(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeLineEnding(content: string, lineEnding: '\n' | '\r\n'): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return lineEnding === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}

function countOccurrences(content: string, search: string): number {
  if (!search.length) {
    return 0;
  }
  let count = 0;
  let index = 0;
  while (true) {
    const found = content.indexOf(search, index);
    if (found < 0) {
      return count;
    }
    count += 1;
    index = found + search.length;
  }
}

function replaceFirst(content: string, search: string, replacement: string): string {
  const index = content.indexOf(search);
  if (index < 0) {
    return content;
  }
  return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
}
