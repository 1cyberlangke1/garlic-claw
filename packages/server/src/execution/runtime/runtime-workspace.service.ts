import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';

const VIRTUAL_WORKSPACE_ROOT = '/workspace';

@Injectable()
export class RuntimeWorkspaceService {
  private readonly storageRoot = readRuntimeWorkspaceStorageRoot();

  getVirtualWorkspaceRoot(): string {
    return VIRTUAL_WORKSPACE_ROOT;
  }

  async resolveWorkspaceRoot(sessionId: string): Promise<string> {
    const workspaceRoot = path.join(this.storageRoot, encodeURIComponent(sessionId));
    await fs.mkdir(workspaceRoot, { recursive: true });
    return workspaceRoot;
  }

  deleteWorkspace(sessionId: string): void {
    fsSync.rmSync(path.join(this.storageRoot, encodeURIComponent(sessionId)), {
      force: true,
      recursive: true,
    });
  }
}

function readRuntimeWorkspaceStorageRoot(): string {
  const configuredRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  return path.join(process.cwd(), 'tmp', 'runtime-workspaces');
}
