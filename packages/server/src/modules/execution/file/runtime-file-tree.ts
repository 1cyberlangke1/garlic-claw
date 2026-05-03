import { BadRequestException } from '@nestjs/common';
import type { Dirent, Stats } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

export async function readRuntimeDirectoryEntryNames(absolutePath: string): Promise<string[]> {
  return (await fsPromises.readdir(absolutePath, { withFileTypes: true }))
    .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function readRuntimePathType(absolutePath: string): Promise<'directory' | 'file' | 'missing'> {
  try {
    return (await fsPromises.stat(absolutePath)).isDirectory() ? 'directory' : 'file';
  } catch (error) {
    if (isRuntimeNotFoundError(error)) {
      return 'missing';
    }
    throw error;
  }
}

export async function readRuntimeCheckedTextFile(absolutePath: string, displayPath: string): Promise<string> {
  const buffer = await fsPromises.readFile(absolutePath);
  if (containsRuntimeBinarySample(buffer)) {
    throw new BadRequestException(`暂不支持读取二进制文件: ${displayPath}`);
  }
  return buffer.toString('utf8').replace(/\r\n/g, '\n');
}

export function isRuntimeNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function collectRuntimeFileTreeEntries<TEntry>(input: {
  absolutePath: string;
  buildEntry: (absolutePath: string, logicalPath: string) => TEntry;
  files: TEntry[];
  handleError?: (logicalPath: string) => void | Promise<void>;
  joinLogicalPath: (logicalPath: string, childName: string) => string;
  logicalPath: string;
  visitedDirectories: Set<string>;
}): Promise<void> {
  const resolved = await readRuntimeFileTreeStat(input.absolutePath, input.logicalPath, input.handleError);
  if (!resolved) {
    return;
  }
  if (!resolved.stat.isDirectory()) {
    input.files.push(input.buildEntry(input.absolutePath, input.logicalPath));
    return;
  }
  if (input.visitedDirectories.has(resolved.realPath)) {
    return;
  }
  input.visitedDirectories.add(resolved.realPath);
  let entries: Dirent[];
  try {
    entries = await fsPromises.readdir(input.absolutePath, { withFileTypes: true });
  } catch (error) {
    await readRuntimeFileTreeError(input.logicalPath, error, input.handleError);
    return;
  }
  for (const entry of entries) {
    await collectRuntimeFileTreeEntries({
      ...input,
      absolutePath: path.join(input.absolutePath, entry.name),
      logicalPath: input.joinLogicalPath(input.logicalPath, entry.name),
    });
  }
}

export function containsRuntimeBinarySample(buffer: Buffer): boolean {
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

async function readRuntimeFileTreeStat(
  absolutePath: string,
  logicalPath: string,
  handleError?: (logicalPath: string) => void | Promise<void>,
): Promise<{ realPath: string; stat: Stats } | null> {
  try {
    const lstat = await fsPromises.lstat(absolutePath);
    if (!lstat.isDirectory() && !lstat.isSymbolicLink()) {
      return { realPath: '', stat: lstat };
    }
    const realPath = lstat.isSymbolicLink()
      ? await fsPromises.realpath(absolutePath)
      : await fsPromises.realpath(absolutePath);
    const stat = lstat.isSymbolicLink() ? await fsPromises.stat(absolutePath) : lstat;
    return { realPath: stat.isDirectory() ? realPath : '', stat };
  } catch (error) {
    await readRuntimeFileTreeError(logicalPath, error, handleError);
    return null;
  }
}

async function readRuntimeFileTreeError(
  logicalPath: string,
  error: unknown,
  handleError?: (logicalPath: string) => void | Promise<void>,
): Promise<void> {
  if (handleError) {
    await handleError(logicalPath);
    return;
  }
  throw error;
}
