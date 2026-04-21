import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findProjectWorkspaceRoot, resolveProjectWorkspaceRoot } from '../../../src/runtime/host/project-workspace-root';

describe('project-workspace-root', () => {
  let originalProjectWorkspacePath: string | undefined;
  let tempRoot: string;

  beforeEach(() => {
    originalProjectWorkspacePath = process.env.GARLIC_CLAW_PROJECT_WORKSPACE_PATH;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'garlic-claw-project-root-'));
  });

  afterEach(() => {
    if (originalProjectWorkspacePath === undefined) {
      delete process.env.GARLIC_CLAW_PROJECT_WORKSPACE_PATH;
    } else {
      process.env.GARLIC_CLAW_PROJECT_WORKSPACE_PATH = originalProjectWorkspacePath;
    }
    fs.rmSync(tempRoot, { force: true, recursive: true });
  });

  it('findProjectWorkspaceRoot returns nearest workspace root', () => {
    const projectRoot = path.join(tempRoot, 'repo');
    const nestedRoot = path.join(projectRoot, 'packages', 'server', 'src', 'nested');
    fs.mkdirSync(nestedRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'packages', 'server'), { recursive: true });

    expect(findProjectWorkspaceRoot(nestedRoot)).toBe(projectRoot);
  });

  it('resolveProjectWorkspaceRoot prefers the nearest project root from the provided path', () => {
    const projectRoot = path.join(tempRoot, 'repo');
    const nestedRoot = path.join(projectRoot, 'packages', 'server', 'src', 'nested');
    fs.mkdirSync(nestedRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(projectRoot, 'packages', 'server'), { recursive: true });

    expect(resolveProjectWorkspaceRoot(nestedRoot)).toBe(projectRoot);
  });

  it('resolveProjectWorkspaceRoot prefers explicit environment override', () => {
    const configuredRoot = path.join(tempRoot, 'configured-root');
    fs.mkdirSync(configuredRoot, { recursive: true });
    process.env.GARLIC_CLAW_PROJECT_WORKSPACE_PATH = configuredRoot;

    expect(resolveProjectWorkspaceRoot(path.join(tempRoot, 'other'))).toBe(path.resolve(configuredRoot));
  });
});
