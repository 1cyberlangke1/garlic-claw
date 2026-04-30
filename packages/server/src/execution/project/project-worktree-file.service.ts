import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { collectRuntimeFileTreeEntries, readRuntimeCheckedTextFile, readRuntimeDirectoryEntryNames, readRuntimePathType } from '../file/runtime-file-tree';
import { replaceRuntimeText } from '../file/runtime-text-replace';
import { ProjectWorktreeRootService } from './project-worktree-root.service';

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

export interface ProjectWorktreeWriteResult { created: boolean; path: string; }
export interface ProjectWorktreeEditResult { occurrences: number; path: string; }

@Injectable()
export class ProjectWorktreeFileService {
  constructor(private readonly projectWorktreeRootService: ProjectWorktreeRootService) {}

  getProjectRoot(): string { return this.projectWorktreeRootService.resolveRoot(); }

  async resolvePath(inputPath?: string): Promise<ProjectWorktreeResolvedPath> {
    const projectRoot = this.getProjectRoot();
    const absolutePath = resolveProjectPath(projectRoot, inputPath);
    const relativePath = toProjectRelativePath(projectRoot, absolutePath);
    const type = await readRuntimePathType(absolutePath);
    return { absolutePath, exists: type !== 'missing', projectRoot, relativePath, type };
  }

  async readExistingPath(inputPath?: string): Promise<ProjectWorktreeResolvedPath> {
    const target = await this.resolvePath(inputPath);
    if (!target.exists) {throw new NotFoundException(`路径不存在: ${target.relativePath}`);}
    return target;
  }

  async readDirectoryEntries(inputPath?: string): Promise<{ entries: string[]; path: string }> {
    const target = await this.readExistingPath(inputPath);
    if (target.type !== 'directory') {throw new BadRequestException(`路径不是目录: ${target.relativePath}`);}
    return { entries: await readRuntimeDirectoryEntryNames(target.absolutePath), path: target.relativePath };
  }

  async readTextFile(inputPath?: string): Promise<{ content: string; path: string }> {
    const target = await this.readExistingPath(inputPath);
    if (target.type !== 'file') {throw new BadRequestException(`路径不是文件: ${target.relativePath}`);}
    return { content: await readRuntimeCheckedTextFile(target.absolutePath, target.relativePath), path: target.relativePath };
  }

  async listFiles(inputPath?: string): Promise<{ basePath: string; files: ProjectWorktreeFileEntry[] }> {
    const target = await this.readExistingPath(inputPath);
    if (target.type === 'file') {return { basePath: target.relativePath, files: [{ absolutePath: target.absolutePath, relativePath: target.relativePath }] };}
    const files: ProjectWorktreeFileEntry[] = [];
    await collectRuntimeFileTreeEntries({
      absolutePath: target.absolutePath,
      buildEntry: (absolutePath, relativePath) => ({ absolutePath, relativePath }),
      files,
      joinLogicalPath: joinProjectRelativePath,
      logicalPath: target.relativePath,
      visitedDirectories: new Set<string>(),
    });
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return { basePath: target.relativePath, files };
  }

  async writeTextFile(inputPath: string, content: string): Promise<ProjectWorktreeWriteResult> {
    const target = await this.resolvePath(inputPath);
    if (target.exists && target.type !== 'file') {throw new BadRequestException(`路径不是文件: ${target.relativePath}`);}
    await fsPromises.mkdir(path.dirname(target.absolutePath), { recursive: true });
    await fsPromises.writeFile(target.absolutePath, content, 'utf8');
    return { created: !target.exists, path: target.relativePath };
  }

  async editTextFile(input: { filePath: string; newString: string; oldString: string; replaceAll?: boolean }): Promise<ProjectWorktreeEditResult> {
    if (input.oldString === input.newString) {throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');}
    const file = await this.readTextFile(input.filePath);
    const replaced = replaceRuntimeText(file.content, input.oldString, input.newString, input.replaceAll);
    return { occurrences: replaced.occurrences, path: (await this.writeTextFile(file.path, replaced.content)).path };
  }
}

function resolveProjectPath(projectRoot: string, inputPath?: string): string {
  const normalizedInput = typeof inputPath === 'string' ? inputPath.trim() : '';
  const normalizedProjectRoot = path.resolve(projectRoot);
  const absolutePath = path.resolve(normalizedInput ? (path.isAbsolute(normalizedInput) ? normalizedInput : path.join(projectRoot, normalizedInput)) : projectRoot);
  if (absolutePath !== normalizedProjectRoot && !absolutePath.startsWith(`${normalizedProjectRoot}${path.sep}`)) {throw new BadRequestException(`路径必须位于项目目录内: ${normalizedInput || '.'}`);}
  return absolutePath;
}

function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const relativePath = path.relative(projectRoot, absolutePath);
  return relativePath ? relativePath.replace(/\\/g, '/') : '.';
}

function joinProjectRelativePath(basePath: string, childName: string): string {
  return basePath === '.' ? childName : path.posix.join(basePath, childName);
}
