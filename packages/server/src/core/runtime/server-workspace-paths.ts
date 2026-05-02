import fs from 'node:fs';
import path from 'node:path';
import { ProjectWorktreeRootService } from '../../execution/project/project-worktree-root.service';

const SERVER_STATE_DIRECTORY = 'server-state';
const TEST_ARTIFACTS_DIRECTORY = 'test-artifacts';
const RUNTIME_WORKSPACES_DIRECTORY = 'runtime-workspaces';
const WORKSPACE_DIRECTORY = 'workspace';
const registeredTestArtifactRoots = new Set<string>();
let cleanupRegistered = false;
let signalCleanupRegistered = false;

export function resolveServerWorkspaceRoot(): string {
  const configuredRoot = process.env.GARLIC_CLAW_WORKSPACE_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  return path.join(
    new ProjectWorktreeRootService().resolveRoot(process.cwd()),
    WORKSPACE_DIRECTORY,
  );
}

export function resolveServerRuntimeWorkspaceRoot(): string {
  const configuredRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }
  return path.join(resolveServerWorkspaceRoot(), RUNTIME_WORKSPACES_DIRECTORY);
}

export function resolveServerTestArtifactsRoot(): string {
  return path.join(resolveServerWorkspaceRoot(), TEST_ARTIFACTS_DIRECTORY);
}

export function resolveServerStatePath(fileName: string): string {
  return path.join(resolveServerWorkspaceRoot(), SERVER_STATE_DIRECTORY, fileName);
}

export function resolveServerLegacyPackageTmpRoot(): string {
  return path.join(
    new ProjectWorktreeRootService().resolveRoot(process.cwd()),
    'packages',
    'server',
    'tmp',
  );
}

export function deleteServerLegacyPackageTmpRoot(): void {
  fs.rmSync(resolveServerLegacyPackageTmpRoot(), { force: true, recursive: true });
}

export function deleteServerTestArtifactsRoot(): void {
  fs.rmSync(resolveServerTestArtifactsRoot(), { force: true, recursive: true });
}

export function createServerTestArtifactPath(input: {
  extension?: string;
  prefix: string;
  subdirectory?: string;
}): string {
  const extension = normalizeArtifactExtension(input.extension);
  const artifactRoot = readServerTestArtifactProcessRoot(input.subdirectory);
  fs.mkdirSync(artifactRoot, { recursive: true });
  const targetPath = path.join(
    artifactRoot,
    `${input.prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
  );
  registerServerTestArtifactRoot(artifactRoot);
  return targetPath;
}

function normalizeArtifactExtension(extension: string | undefined): string {
  if (!extension) {
    return '';
  }
  return extension.startsWith('.') ? extension : `.${extension}`;
}

function readServerTestArtifactProcessRoot(subdirectory: string | undefined): string {
  const scopedRoot = subdirectory?.trim()
    ? path.join(resolveServerTestArtifactsRoot(), subdirectory.trim())
    : resolveServerTestArtifactsRoot();
  return path.join(scopedRoot, `process-${process.pid}`);
}

function registerServerTestArtifactRoot(targetPath: string): void {
  registeredTestArtifactRoots.add(path.resolve(targetPath));
  if (cleanupRegistered) {
    return;
  }
  cleanupRegistered = true;
  process.once('exit', cleanupServerTestArtifacts);
  registerServerTestArtifactSignalCleanup();
}

function registerServerTestArtifactSignalCleanup(): void {
  if (signalCleanupRegistered) {
    return;
  }
  signalCleanupRegistered = true;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
    process.once(signal, () => {
      cleanupServerTestArtifacts();
      process.exit(128);
    });
  }
}

function cleanupServerTestArtifacts(): void {
  const roots = [...registeredTestArtifactRoots].sort((left, right) => right.length - left.length);
  for (const targetPath of roots) {
    try {
      fs.rmSync(targetPath, { force: true, recursive: true });
      pruneEmptyTestArtifactDirectories(path.dirname(targetPath));
    } catch {
      // 测试进程退出时尽力清理，不把清理失败升级成新的错误。
    }
  }
  registeredTestArtifactRoots.clear();
}

function pruneEmptyTestArtifactDirectories(directoryPath: string): void {
  const rootPath = path.resolve(resolveServerTestArtifactsRoot());
  let currentPath = path.resolve(directoryPath);
  while (currentPath.startsWith(rootPath) && currentPath !== rootPath) {
    try {
      if (fs.readdirSync(currentPath).length > 0) {
        return;
      }
      fs.rmdirSync(currentPath);
      currentPath = path.dirname(currentPath);
    } catch {
      return;
    }
  }
}
