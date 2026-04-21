import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import {
  RUNTIME_FILESYSTEM_BACKENDS,
  type RuntimeFilesystemBackendList,
} from './runtime-filesystem-backend.constants';
import type {
  RuntimeFilesystemBackend,
  RuntimeFilesystemDeleteResult,
  RuntimeFilesystemDirectoryResult,
  RuntimeFilesystemEditResult,
  RuntimeFilesystemFileEntry,
  RuntimeFilesystemGlobResult,
  RuntimeFilesystemGrepResult,
  RuntimeFilesystemPathStat,
  RuntimeFilesystemReadResult,
  RuntimeFilesystemResolvedPath,
  RuntimeFilesystemSymlinkResult,
  RuntimeFilesystemTransferResult,
  RuntimeFilesystemWriteResult,
} from './runtime-filesystem-backend.types';

@Injectable()
export class RuntimeFilesystemBackendService {
  private readonly backends = new Map<RuntimeBackendKind, RuntimeFilesystemBackend>();
  private readonly defaultBackendKind: RuntimeBackendKind;

  constructor(
    @Inject(RUNTIME_FILESYSTEM_BACKENDS)
    filesystemBackends: RuntimeFilesystemBackendList,
  ) {
    if (filesystemBackends.length === 0) {
      throw new Error('RuntimeFilesystemBackendService 至少需要一个 filesystem backend');
    }
    for (const backend of filesystemBackends) {
      this.backends.set(backend.getKind(), backend);
    }
    this.defaultBackendKind = filesystemBackends[0].getKind();
  }

  getBackend(backendKind?: RuntimeBackendKind): RuntimeFilesystemBackend {
    return this.requireBackend(backendKind);
  }

  getConfiguredBackend(): RuntimeFilesystemBackend {
    const configuredBackendKind = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND?.trim();
    if (!configuredBackendKind) {
      return this.requireBackend();
    }
    return this.requireConfiguredBackend(configuredBackendKind);
  }

  getBackendDescriptor(backendKind?: RuntimeBackendKind): RuntimeBackendDescriptor {
    return this.requireBackend(backendKind).getDescriptor();
  }

  async copyPath(
    sessionId: string,
    fromPath: string,
    toPath: string,
  ): Promise<RuntimeFilesystemTransferResult> {
    return this.getConfiguredBackend().copyPath(sessionId, fromPath, toPath);
  }

  async createSymlink(
    sessionId: string,
    input: {
      linkPath: string;
      targetPath: string;
    },
  ): Promise<RuntimeFilesystemSymlinkResult> {
    return this.getConfiguredBackend().createSymlink(sessionId, input);
  }

  async deletePath(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDeleteResult> {
    return this.getConfiguredBackend().deletePath(sessionId, inputPath);
  }

  getConfiguredBackendDescriptor(): RuntimeBackendDescriptor {
    return this.getConfiguredBackend().getDescriptor();
  }

  getDefaultBackend(): RuntimeFilesystemBackend {
    return this.requireBackend();
  }

  getDefaultBackendDescriptor(): RuntimeBackendDescriptor {
    return this.requireBackend().getDescriptor();
  }

  getDefaultBackendKind(): RuntimeBackendKind {
    return this.defaultBackendKind;
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
    return this.getConfiguredBackend().editTextFile(sessionId, input);
  }

  async ensureDirectory(
    sessionId: string,
    inputPath: string,
  ): Promise<RuntimeFilesystemDirectoryResult> {
    return this.getConfiguredBackend().ensureDirectory(sessionId, inputPath);
  }

  async globPaths(
    sessionId: string,
    input: {
      maxResults: number;
      pattern: string;
      path?: string;
    },
  ): Promise<RuntimeFilesystemGlobResult> {
    return this.getConfiguredBackend().globPaths(sessionId, input);
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
    return this.getConfiguredBackend().grepText(sessionId, input);
  }

  hasBackend(backendKind: RuntimeBackendKind): boolean {
    return this.backends.has(backendKind);
  }

  async listFiles(
    sessionId: string,
    inputPath?: string,
  ): Promise<{
    basePath: string;
    files: RuntimeFilesystemFileEntry[];
  }> {
    return this.getConfiguredBackend().listFiles(sessionId, inputPath);
  }

  listBackendKinds(): RuntimeBackendKind[] {
    return Array.from(this.backends.keys());
  }

  async movePath(
    sessionId: string,
    fromPath: string,
    toPath: string,
  ): Promise<RuntimeFilesystemTransferResult> {
    return this.getConfiguredBackend().movePath(sessionId, fromPath, toPath);
  }

  async readDirectoryEntries(
    sessionId: string,
    inputPath?: string,
  ): Promise<{
    entries: string[];
    path: string;
  }> {
    return this.getConfiguredBackend().readDirectoryEntries(sessionId, inputPath);
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
    return this.getConfiguredBackend().readPathRange(sessionId, input);
  }

  async readSymlink(sessionId: string, inputPath: string): Promise<RuntimeFilesystemSymlinkResult> {
    return this.getConfiguredBackend().readSymlink(sessionId, inputPath);
  }

  async resolvePath(sessionId: string, inputPath?: string): Promise<RuntimeFilesystemResolvedPath> {
    return this.getConfiguredBackend().resolvePath(sessionId, inputPath);
  }

  async statPath(sessionId: string, inputPath?: string): Promise<RuntimeFilesystemPathStat> {
    return this.getConfiguredBackend().statPath(sessionId, inputPath);
  }

  async readTextFile(
    sessionId: string,
    inputPath?: string,
  ): Promise<{
    content: string;
    path: string;
  }> {
    return this.getConfiguredBackend().readTextFile(sessionId, inputPath);
  }

  async writeTextFile(
    sessionId: string,
    inputPath: string,
    content: string,
  ): Promise<RuntimeFilesystemWriteResult> {
    return this.getConfiguredBackend().writeTextFile(sessionId, inputPath, content);
  }

  private requireConfiguredBackend(backendKind: RuntimeBackendKind): RuntimeFilesystemBackend {
    if (!this.hasBackend(backendKind)) {
      throw new Error(
        `Unknown runtime filesystem backend: ${backendKind}. Available backends: ${this.listBackendKinds().join(', ')}`,
      );
    }
    return this.requireBackend(backendKind);
  }

  private requireBackend(backendKind?: RuntimeBackendKind): RuntimeFilesystemBackend {
    const resolvedBackendKind = backendKind ?? this.defaultBackendKind;
    const backend = this.backends.get(resolvedBackendKind);
    if (!backend) {
      throw new Error(`Unknown runtime filesystem backend: ${resolvedBackendKind}`);
    }
    return backend;
  }
}
