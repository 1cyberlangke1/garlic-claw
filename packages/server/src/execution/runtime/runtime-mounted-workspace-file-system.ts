import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { BufferEncoding, CpOptions, FileContent, FsStat, IFileSystem, MkdirOptions, RmOptions } from 'just-bash';

interface RuntimeDirentEntry {
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  name: string;
}

interface RuntimeReadFileOptions {
  encoding?: BufferEncoding | null;
}

interface RuntimeWriteFileOptions {
  encoding?: BufferEncoding;
}

export class RuntimeMountedWorkspaceFileSystem implements IFileSystem {
  private readonly root: string;
  private readonly mountPoint: string;

  constructor(root: string, mountPoint = '/') {
    this.root = path.resolve(root);
    this.mountPoint = normalizeMountedWorkspacePath(mountPoint);
  }

  async readFile(filePath: string, options?: RuntimeReadFileOptions | BufferEncoding): Promise<string> {
    const buffer = await this.readFileBuffer(filePath);
    const encoding = typeof options === 'string'
      ? normalizeBufferEncoding(options as BufferEncoding)
      : normalizeBufferEncoding(options?.encoding ?? 'utf8');
    return Buffer.from(buffer).toString(encoding);
  }

  async readFileBuffer(filePath: string): Promise<Uint8Array> {
    return new Uint8Array(await fsPromises.readFile(this.toHostPath(filePath)));
  }

  async writeFile(filePath: string, content: FileContent, options?: RuntimeWriteFileOptions | BufferEncoding): Promise<void> {
    const hostPath = this.toHostPath(filePath);
    await fsPromises.mkdir(path.dirname(hostPath), { recursive: true });
    await fsPromises.writeFile(hostPath, normalizeFileContent(content), readNodeWriteOptions(options));
  }

  async appendFile(filePath: string, content: FileContent, options?: RuntimeWriteFileOptions | BufferEncoding): Promise<void> {
    const hostPath = this.toHostPath(filePath);
    await fsPromises.mkdir(path.dirname(hostPath), { recursive: true });
    await fsPromises.appendFile(hostPath, normalizeFileContent(content), readNodeWriteOptions(options));
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(this.toHostPath(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<FsStat> {
    return toFsStat(await fsPromises.stat(this.toHostPath(filePath)));
  }

  async lstat(filePath: string): Promise<FsStat> {
    return toFsStat(await fsPromises.lstat(this.toHostPath(filePath)));
  }

  async mkdir(filePath: string, options?: MkdirOptions): Promise<void> {
    await fsPromises.mkdir(this.toHostPath(filePath), { recursive: options?.recursive });
  }

  async readdir(filePath: string): Promise<string[]> {
    return fsPromises.readdir(this.toHostPath(filePath));
  }

  async readdirWithFileTypes(filePath: string): Promise<RuntimeDirentEntry[]> {
    const entries = await fsPromises.readdir(this.toHostPath(filePath), { withFileTypes: true });
    return entries.map((entry) => ({
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymbolicLink: entry.isSymbolicLink(),
      name: entry.name,
    }));
  }

  async rm(filePath: string, options?: RmOptions): Promise<void> {
    await fsPromises.rm(this.toHostPath(filePath), {
      force: options?.force,
      recursive: options?.recursive,
    });
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    await fsPromises.cp(this.toHostPath(src), this.toHostPath(dest), {
      force: true,
      recursive: options?.recursive,
    });
  }

  async mv(src: string, dest: string): Promise<void> {
    const sourcePath = this.toHostPath(src);
    const destinationPath = this.toHostPath(dest);
    await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsPromises.rename(sourcePath, destinationPath);
  }

  resolvePath(base: string, nextPath: string): string {
    if (!nextPath.trim()) {
      return normalizeVirtualPath(base);
    }
    if (nextPath.startsWith('/')) {
      return normalizeVirtualPath(nextPath);
    }
    return normalizeVirtualPath(path.posix.join(normalizeVirtualPath(base), nextPath));
  }

  getAllPaths(): string[] {
    const entries = ['/'];
    collectWorkspacePaths(this.root, this.root, entries);
    return entries.sort();
  }

  async chmod(filePath: string, mode: number): Promise<void> {
    await fsPromises.chmod(this.toHostPath(filePath), mode);
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    const hostLinkPath = this.toHostPath(linkPath);
    const hostTarget = this.toHostSymlinkTarget(target, linkPath);
    await fsPromises.mkdir(path.dirname(hostLinkPath), { recursive: true });
    await fsPromises.symlink(hostTarget, hostLinkPath, await readSymlinkNodeType(hostLinkPath, hostTarget));
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    const hostExistingPath = this.toHostPath(existingPath);
    const hostNewPath = this.toHostPath(newPath);
    await fsPromises.mkdir(path.dirname(hostNewPath), { recursive: true });
    await fsPromises.link(hostExistingPath, hostNewPath);
  }

  async readlink(filePath: string): Promise<string> {
    const target = await fsPromises.readlink(this.toHostPath(filePath));
    return this.toVirtualReadlinkTarget(target);
  }

  async realpath(filePath: string): Promise<string> {
    const resolved = await fsPromises.realpath(this.toHostPath(filePath));
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`runtime workspace 路径越界: ${filePath}`);
    }
    const relativePath = path.relative(this.root, resolved);
    return relativePath ? `/${relativePath.split(path.sep).join('/')}` : '/';
  }

  async utimes(filePath: string, atime: Date, mtime: Date): Promise<void> {
    await fsPromises.utimes(this.toHostPath(filePath), atime, mtime);
  }

  private toHostPath(filePath: string): string {
    const relativePath = normalizeVirtualPath(filePath).replace(/^\/+/, '');
    const hostPath = relativePath ? path.join(this.root, ...relativePath.split('/')) : this.root;
    const resolved = path.resolve(hostPath);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`runtime workspace 路径越界: ${filePath}`);
    }
    return resolved;
  }

  private toHostSymlinkTarget(target: string, linkPath: string): string {
    if (target.startsWith('/')) {
      return this.toHostPath(this.readAbsoluteTargetPath(target));
    }
    const normalizedLinkPath = normalizeVirtualPath(linkPath);
    const resolvedVirtualTarget = normalizeVirtualPath(path.posix.join(path.posix.dirname(normalizedLinkPath), target));
    const resolvedHostTarget = this.toHostPath(resolvedVirtualTarget);
    const hostLinkDirectory = path.dirname(this.toHostPath(linkPath));
    return path.relative(hostLinkDirectory, resolvedHostTarget) || '.';
  }

  private readAbsoluteTargetPath(target: string): string {
    const normalizedTarget = normalizeVirtualPath(target);
    if (this.mountPoint === '/') {
      return normalizedTarget;
    }
    if (normalizedTarget === this.mountPoint) {
      return '/';
    }
    if (normalizedTarget.startsWith(`${this.mountPoint}/`)) {
      return normalizedTarget.slice(this.mountPoint.length);
    }
    throw new Error(`runtime workspace 符号链接目标必须位于 ${this.mountPoint} 内: ${target}`);
  }

  private toVirtualReadlinkTarget(target: string): string {
    const normalizedTarget = path.normalize(target);
    if (path.isAbsolute(normalizedTarget)) {
      const resolvedTarget = path.resolve(normalizedTarget);
      if (resolvedTarget === this.root || resolvedTarget.startsWith(`${this.root}${path.sep}`)) {
        const relativePath = path.relative(this.root, resolvedTarget);
        const virtualTarget = relativePath ? `/${relativePath.split(path.sep).join('/')}` : '/';
        if (this.mountPoint === '/') {
          return virtualTarget;
        }
        return virtualTarget === '/' ? this.mountPoint : `${this.mountPoint}${virtualTarget}`;
      }
    }
    return normalizedTarget.split(path.sep).join('/');
  }
}

function collectWorkspacePaths(root: string, currentPath: string, entries: string[]): void {
  const dirEntries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of dirEntries) {
    const hostPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(root, hostPath);
    const virtualPath = `/${relativePath.split(path.sep).join('/')}`;
    entries.push(virtualPath);
    if (entry.isDirectory()) {
      collectWorkspacePaths(root, hostPath, entries);
    }
  }
}

function normalizeVirtualPath(input: string): string {
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

function normalizeMountedWorkspacePath(input: string): string {
  const normalized = normalizeVirtualPath(input);
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function normalizeBufferEncoding(encoding: BufferEncoding | null | undefined): BufferEncoding {
  if (!encoding || encoding === 'utf-8') {
    return 'utf8';
  }
  return encoding;
}

function normalizeFileContent(content: FileContent): string | Uint8Array {
  return typeof content === 'string' ? content : Buffer.from(content);
}

function readNodeWriteOptions(options?: RuntimeWriteFileOptions | BufferEncoding): { encoding?: BufferEncoding } | undefined {
  if (!options) {
    return undefined;
  }
  if (typeof options === 'string') {
    return { encoding: normalizeBufferEncoding(options as BufferEncoding) };
  }
  if (!options.encoding) {
    return undefined;
  }
  return { encoding: normalizeBufferEncoding(options.encoding) };
}

function toFsStat(stat: fs.Stats): FsStat {
  return {
    isDirectory: stat.isDirectory(),
    isFile: stat.isFile(),
    isSymbolicLink: stat.isSymbolicLink(),
    mode: stat.mode,
    mtime: stat.mtime,
    size: stat.size,
  };
}

async function readSymlinkNodeType(hostLinkPath: string, hostTarget: string): Promise<'dir' | 'file' | undefined> {
  if (process.platform !== 'win32') {
    return undefined;
  }
  const resolvedTarget = path.isAbsolute(hostTarget)
    ? hostTarget
    : path.resolve(path.dirname(hostLinkPath), hostTarget);
  try {
    const targetStat = await fsPromises.stat(resolvedTarget);
    return targetStat.isDirectory() ? 'dir' : 'file';
  } catch {
    return 'file';
  }
}
