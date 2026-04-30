import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuntimeCommandCaptureService } from '../../../src/execution/runtime/runtime-command-capture.service';
import { RuntimeSessionEnvironmentService } from '../../../src/execution/runtime/runtime-session-environment.service';

describe('RuntimeCommandCaptureService', () => {
  let runtimeWorkspaceRoot: string;

  beforeEach(async () => {
    runtimeWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-runtime-command-capture-'));
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;
  });

  afterEach(async () => {
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    await fs.rm(runtimeWorkspaceRoot, { force: true, recursive: true });
  });

  it('returns null when output stays within render limits', async () => {
    const service = new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService());

    await expect(service.captureIfNeeded({
      backendKind: 'just-bash',
      cwd: '/',
      exitCode: 0,
      sessionId: 'session-small',
      stderr: '',
      stdout: 'short output',
    })).resolves.toBeNull();
  });

  it('writes oversized output under the session visible path', async () => {
    const service = new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService());
    const stdout = Array.from({ length: 220 }, (_, index) => `line-${index + 1}`).join('\n');

    const outputPath = await service.captureIfNeeded({
      backendKind: 'just-bash',
      cwd: '/',
      exitCode: 0,
      sessionId: 'session-large',
      stderr: '',
      stdout,
    });

    expect(outputPath).toMatch(/^\/\.garlic-claw\/runtime-command-output\/command-.+\.txt$/);
    const hostPath = path.join(
      runtimeWorkspaceRoot,
      'session-large',
      '.garlic-claw',
      'runtime-command-output',
      path.basename(outputPath ?? ''),
    );
    await expect(fs.readFile(hostPath, 'utf8')).resolves.toContain('<runtime_command_output>');
    await expect(fs.readFile(hostPath, 'utf8')).resolves.toContain('line-220');
  });
});
