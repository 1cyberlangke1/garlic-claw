import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { BufferEncoding, CpOptions, FileContent, FsStat, IFileSystem, MkdirOptions, RmOptions } from 'just-bash';

interface RuntimeDirentEntry { isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean; name: string; }
interface RuntimeReadFileOptions { encoding?: BufferEncoding | null; }
interface RuntimeWriteFileOptions { encoding?: BufferEncoding; }

export class RuntimeMountedWorkspaceFileSystem implements IFileSystem {
  private readonly root: string;
  private readonly mountPoint: string;

  constructor(root: string, mountPoint = '/') {
    this.root = path.resolve(root);
    this.mountPoint = normalizeMountedWorkspacePath(mountPoint);
  }

  async readFile(filePath: string, options?: RuntimeReadFileOptions | BufferEncoding): Promise<string> { return Buffer.from(await this.readFileBuffer(filePath)).toString(readMountedEncoding(typeof options === 'string' ? options : options?.encoding ?? 'utf8')); }
  async readFileBuffer(filePath: string): Promise<Uint8Array> { return new Uint8Array(await fsPromises.readFile(this.toHostPath(filePath))); }
  async writeFile(filePath: string, content: FileContent, options?: RuntimeWriteFileOptions | BufferEncoding): Promise<void> { await this.writeMountedFile(filePath, content, options, 'writeFile'); }
  async appendFile(filePath: string, content: FileContent, options?: RuntimeWriteFileOptions | BufferEncoding): Promise<void> { await this.writeMountedFile(filePath, content, options, 'appendFile'); }
  async exists(filePath: string): Promise<boolean> { try { await fsPromises.access(this.toHostPath(filePath)); return true; } catch { return false; } }
  async stat(filePath: string): Promise<FsStat> { return toMountedFsStat(await fsPromises.stat(this.toHostPath(filePath))); }
  async lstat(filePath: string): Promise<FsStat> { return toMountedFsStat(await fsPromises.lstat(this.toHostPath(filePath))); }
  async mkdir(filePath: string, options?: MkdirOptions): Promise<void> { await fsPromises.mkdir(this.toHostPath(filePath), { recursive: options?.recursive }); }
  async readdir(filePath: string): Promise<string[]> { return fsPromises.readdir(this.toHostPath(filePath)); }
  async readdirWithFileTypes(filePath: string): Promise<RuntimeDirentEntry[]> { return (await fsPromises.readdir(this.toHostPath(filePath), { withFileTypes: true })).map((entry) => ({ isDirectory: entry.isDirectory(), isFile: entry.isFile(), isSymbolicLink: entry.isSymbolicLink(), name: entry.name })); }
  async rm(filePath: string, options?: RmOptions): Promise<void> { await fsPromises.rm(this.toHostPath(filePath), { force: options?.force, recursive: options?.recursive }); }
  async cp(src: string, dest: string, options?: CpOptions): Promise<void> { await fsPromises.cp(this.toHostPath(src), this.toHostPath(dest), { force: true, recursive: options?.recursive }); }
  async mv(src: string, dest: string): Promise<void> { const destinationPath = this.toHostPath(dest); await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true }); await fsPromises.rename(this.toHostPath(src), destinationPath); }
  resolvePath(base: string, nextPath: string): string { return !nextPath.trim() ? normalizeVirtualPath(base) : nextPath.startsWith('/') ? normalizeVirtualPath(nextPath) : normalizeVirtualPath(path.posix.join(normalizeVirtualPath(base), nextPath)); }
  getAllPaths(): string[] { return ['/', ...collectMountedWorkspacePaths(this.root, this.root)].sort(); }
  async chmod(filePath: string, mode: number): Promise<void> { await fsPromises.chmod(this.toHostPath(filePath), mode); }
  async symlink(target: string, linkPath: string): Promise<void> { const hostLinkPath = this.toHostPath(linkPath), hostTarget = this.toHostSymlinkTarget(target, linkPath); await fsPromises.mkdir(path.dirname(hostLinkPath), { recursive: true }); await fsPromises.symlink(hostTarget, hostLinkPath, await readMountedSymlinkNodeType(hostLinkPath, hostTarget)); }
  async link(existingPath: string, newPath: string): Promise<void> { const hostNewPath = this.toHostPath(newPath); await fsPromises.mkdir(path.dirname(hostNewPath), { recursive: true }); await fsPromises.link(this.toHostPath(existingPath), hostNewPath); }
  async readlink(filePath: string): Promise<string> { return this.toVirtualReadlinkTarget(await fsPromises.readlink(this.toHostPath(filePath))); }
  async realpath(filePath: string): Promise<string> { return this.toMountedVirtualPath(await fsPromises.realpath(this.toHostPath(filePath)), filePath); }
  async utimes(filePath: string, atime: Date, mtime: Date): Promise<void> { await fsPromises.utimes(this.toHostPath(filePath), atime, mtime); }

  private async writeMountedFile(filePath: string, content: FileContent, options: RuntimeWriteFileOptions | BufferEncoding | undefined, mode: 'appendFile' | 'writeFile'): Promise<void> {
    const hostPath = this.toHostPath(filePath);
    await fsPromises.mkdir(path.dirname(hostPath), { recursive: true });
    await fsPromises[mode](hostPath, typeof content === 'string' ? content : Buffer.from(content), readMountedWriteOptions(options));
  }

  private toHostPath(filePath: string): string {
    const relativePath = normalizeVirtualPath(filePath).slice(1);
    const resolved = path.resolve(relativePath ? path.join(this.root, ...relativePath.split('/')) : this.root);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {throw new Error(`runtime workspace 路径越界: ${filePath}`);}
    return resolved;
  }

  private toHostSymlinkTarget(target: string, linkPath: string): string {
    if (target.startsWith('/')) {return this.toHostPath(this.readAbsoluteTargetPath(target));}
    const hostTarget = this.toHostPath(normalizeVirtualPath(path.posix.join(path.posix.dirname(normalizeVirtualPath(linkPath)), target)));
    return path.relative(path.dirname(this.toHostPath(linkPath)), hostTarget) || '.';
  }

  private readAbsoluteTargetPath(target: string): string {
    const normalizedTarget = normalizeVirtualPath(target);
    if (this.mountPoint === '/') {return normalizedTarget;}
    if (normalizedTarget === this.mountPoint) {return '/';}
    if (normalizedTarget.startsWith(`${this.mountPoint}/`)) {return normalizedTarget.slice(this.mountPoint.length);}
    throw new Error(`runtime workspace 符号链接目标必须位于 ${this.mountPoint} 内: ${target}`);
  }

  private toMountedVirtualPath(resolved: string, filePath: string): string {
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {throw new Error(`runtime workspace 路径越界: ${filePath}`);}
    const relativePath = path.relative(this.root, resolved);
    return relativePath ? `/${relativePath.split(path.sep).join('/')}` : '/';
  }

  private toVirtualReadlinkTarget(target: string): string {
    if (!path.isAbsolute(path.normalize(target))) {return path.normalize(target).split(path.sep).join('/');}
    const virtualTarget = this.toMountedVirtualPath(path.resolve(path.normalize(target)), target);
    return this.mountPoint === '/' ? virtualTarget : virtualTarget === '/' ? this.mountPoint : `${this.mountPoint}${virtualTarget}`;
  }
}

function collectMountedWorkspacePaths(root: string, currentPath: string): string[] {
  const entries: string[] = [];
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const hostPath = path.join(currentPath, entry.name);
    entries.push(`/${path.relative(root, hostPath).split(path.sep).join('/')}`);
    if (entry.isDirectory()) {entries.push(...collectMountedWorkspacePaths(root, hostPath));}
  }
  return entries;
}

function normalizeVirtualPath(input: string): string {
  const stack: string[] = [];
  for (const part of input.split('/').filter((entry) => entry.length > 0 && entry !== '.')) { if (part === '..') {stack.pop();} else {stack.push(part);} }
  return `/${stack.join('/')}`;
}

function normalizeMountedWorkspacePath(input: string): string {
  const normalized = normalizeVirtualPath(input);
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function readMountedEncoding(encoding: BufferEncoding | null | undefined): BufferEncoding { return !encoding || encoding === 'utf-8' ? 'utf8' : encoding; }
function readMountedWriteOptions(options?: RuntimeWriteFileOptions | BufferEncoding): { encoding?: BufferEncoding } | undefined { return !options ? undefined : { encoding: readMountedEncoding(typeof options === 'string' ? options : options.encoding) }; }
function toMountedFsStat(stat: fs.Stats): FsStat { return { isDirectory: stat.isDirectory(), isFile: stat.isFile(), isSymbolicLink: stat.isSymbolicLink(), mode: stat.mode, mtime: stat.mtime, size: stat.size }; }

async function readMountedSymlinkNodeType(hostLinkPath: string, hostTarget: string): Promise<'dir' | 'file' | undefined> {
  if (process.platform !== 'win32') {return undefined;}
  try {
    return (await fsPromises.stat(path.isAbsolute(hostTarget) ? hostTarget : path.resolve(path.dirname(hostLinkPath), hostTarget))).isDirectory() ? 'dir' : 'file';
  } catch {
    return 'file';
  }
}
