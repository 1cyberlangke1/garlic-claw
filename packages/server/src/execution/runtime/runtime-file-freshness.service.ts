import { BadRequestException, Injectable } from '@nestjs/common';
import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { RuntimeFilesystemBackendService } from './runtime-filesystem-backend.service';

interface RuntimeFileReadStamp {
  mtime: string | null;
  readAt: string;
  size: number | null;
}

@Injectable()
export class RuntimeFileFreshnessService {
  private readonly readStamps = new Map<string, Map<string, RuntimeFileReadStamp>>();
  private readonly fileLocks = new Map<string, Promise<void>>();

  constructor(private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService) {}

  async assertCanWrite(
    sessionId: string,
    filePath: string,
    backendKind?: RuntimeBackendKind,
  ): Promise<void> {
    const stat = await this.runtimeFilesystemBackendService.statPath(sessionId, filePath, backendKind);
    if (!stat.exists || stat.type !== 'file') {
      return;
    }
    const stamp = this.readStamps.get(sessionId)?.get(stat.virtualPath);
    if (!stamp) {
      throw new BadRequestException(
        `修改已有文件前必须先读取: ${stat.virtualPath}\n请先使用 read 工具读取该文件。`,
      );
    }
    if (stamp.mtime === stat.mtime && stamp.size === stat.size) {
      return;
    }
    throw new BadRequestException(
      [
        `文件在上次读取后已被修改: ${stat.virtualPath}`,
        `最近修改: ${stat.mtime ?? 'unknown'}`,
        `上次读取: ${stamp.readAt}`,
        '请重新读取后再修改。',
      ].join('\n'),
    );
  }

  async rememberRead(
    sessionId: string,
    filePath: string,
    backendKind?: RuntimeBackendKind,
  ): Promise<void> {
    const stat = await this.runtimeFilesystemBackendService.statPath(sessionId, filePath, backendKind);
    if (!stat.exists || stat.type !== 'file') {
      return;
    }
    let sessionStamps = this.readStamps.get(sessionId);
    if (!sessionStamps) {
      sessionStamps = new Map<string, RuntimeFileReadStamp>();
      this.readStamps.set(sessionId, sessionStamps);
    }
    sessionStamps.set(stat.virtualPath, {
      mtime: stat.mtime,
      readAt: new Date().toISOString(),
      size: stat.size,
    });
  }

  async withFileLock<T>(
    sessionId: string,
    filePath: string,
    run: () => Promise<T>,
    backendKind?: RuntimeBackendKind,
  ): Promise<T> {
    const resolvedPath = await this.runtimeFilesystemBackendService.resolvePath(sessionId, filePath, backendKind);
    const lockKey = `${sessionId}:${resolvedPath.virtualPath}`;
    const previousLock = this.fileLocks.get(lockKey) ?? Promise.resolve();
    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const queuedLock = previousLock.then(() => currentLock);
    this.fileLocks.set(lockKey, queuedLock);
    await previousLock;
    try {
      return await run();
    } finally {
      releaseLock();
      if (this.fileLocks.get(lockKey) === queuedLock) {
        this.fileLocks.delete(lockKey);
      }
    }
  }
}
