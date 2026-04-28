import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeSessionEnvironmentService } from '../../../src/execution/runtime/runtime-session-environment.service';

describe('RuntimeSessionEnvironmentService', () => {
  const originalWorkspaceRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
  const runtimeWorkspaceRoots: string[] = [];

  afterEach(() => {
    if (originalWorkspaceRoot === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = originalWorkspaceRoot;
    }
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (!nextRoot) {
        continue;
      }
      fs.rmSync(nextRoot, { force: true, recursive: true });
    }
  });

  it('creates and deletes session workspace directories under the configured storage root', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-session-environment-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const service = new RuntimeSessionEnvironmentService();
    const environment = await service.getSessionEnvironment('session/a b');

    expect(environment).toEqual({
      sessionId: 'session/a b',
      storageRoot: path.resolve(runtimeWorkspaceRoot),
      visibleRoot: '/',
      sessionRoot: path.join(path.resolve(runtimeWorkspaceRoot), 'session%2Fa%20b'),
    });
    expect(fs.existsSync(environment.sessionRoot)).toBe(true);

    await service.deleteSessionEnvironment('session/a b');

    expect(fs.existsSync(environment.sessionRoot)).toBe(false);
  });

  it('does not reclaim an empty session directory while a persistent shell session is still active', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-session-environment-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const service = new RuntimeSessionEnvironmentService({
      hasActiveSession: jest.fn().mockReturnValue(true),
    } as never);
    const environment = await service.getSessionEnvironment('session-active');

    await service.deleteSessionEnvironmentIfEmpty('session-active');

    expect(fs.existsSync(environment.sessionRoot)).toBe(true);
  });
});
