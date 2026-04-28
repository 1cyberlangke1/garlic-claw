import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import { resolveServerRuntimeWorkspaceRoot } from '../../runtime/server-workspace-paths';
import type {
  RuntimeSessionEnvironment,
  RuntimeSessionEnvironmentDescriptor,
} from './runtime-session-environment.types';
import { RuntimePersistentShellSessionService } from './runtime-persistent-shell-session.service';

const VISIBLE_RUNTIME_ROOT = '/';

@Injectable()
export class RuntimeSessionEnvironmentService {
  private readonly descriptor: RuntimeSessionEnvironmentDescriptor = {
    storageRoot: readRuntimeSessionStorageRoot(),
    visibleRoot: VISIBLE_RUNTIME_ROOT,
  };

  constructor(
    @Optional()
    private readonly runtimePersistentShellSessionService?: RuntimePersistentShellSessionService,
  ) {}

  getDescriptor(): RuntimeSessionEnvironmentDescriptor {
    return this.descriptor;
  }

  async getSessionEnvironment(sessionId: string): Promise<RuntimeSessionEnvironment> {
    const sessionRoot = this.resolveSessionRoot(sessionId);
    await fs.mkdir(sessionRoot, { recursive: true });
    return {
      ...this.descriptor,
      sessionId,
      sessionRoot,
    };
  }

  async deleteSessionEnvironment(sessionId: string): Promise<void> {
    await this.runtimePersistentShellSessionService?.disposeSession(sessionId);
    await fs.rm(this.resolveSessionRoot(sessionId), {
      force: true,
      recursive: true,
    });
  }

  async deleteSessionEnvironmentIfEmpty(sessionId: string): Promise<void> {
    const sessionRoot = this.resolveSessionRoot(sessionId);
    try {
      if (this.runtimePersistentShellSessionService?.hasActiveSession(sessionId)) {
        return;
      }
      const entries = await fs.readdir(sessionRoot);
      if (entries.length > 0) {
        return;
      }
      await fs.rmdir(sessionRoot);
    } catch {
      // 空目录回收只做尽力处理，不把清理失败升级成工具错误。
    }
  }

  private resolveSessionRoot(sessionId: string): string {
    return path.join(this.descriptor.storageRoot, encodeURIComponent(sessionId));
  }
}

function readRuntimeSessionStorageRoot(): string {
  return resolveServerRuntimeWorkspaceRoot();
}
