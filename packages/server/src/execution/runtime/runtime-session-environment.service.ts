import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  RuntimeSessionEnvironment,
  RuntimeSessionEnvironmentDescriptor,
} from './runtime-session-environment.types';

const VISIBLE_RUNTIME_ROOT = '/';

@Injectable()
export class RuntimeSessionEnvironmentService {
  private readonly descriptor: RuntimeSessionEnvironmentDescriptor = {
    storageRoot: readRuntimeSessionStorageRoot(),
    visibleRoot: VISIBLE_RUNTIME_ROOT,
  };

  getDescriptor(): RuntimeSessionEnvironmentDescriptor {
    return this.descriptor;
  }

  async getSessionEnvironment(sessionId: string): Promise<RuntimeSessionEnvironment> {
    const sessionRoot = path.join(this.descriptor.storageRoot, encodeURIComponent(sessionId));
    await fs.mkdir(sessionRoot, { recursive: true });
    return {
      ...this.descriptor,
      sessionId,
      sessionRoot,
    };
  }

  deleteSessionEnvironment(sessionId: string): void {
    fsSync.rmSync(path.join(this.descriptor.storageRoot, encodeURIComponent(sessionId)), {
      force: true,
      recursive: true,
    });
  }
}

function readRuntimeSessionStorageRoot(): string {
  const configuredRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  return path.join(process.cwd(), 'tmp', 'runtime-workspaces');
}
