import * as fs from 'node:fs';
import * as path from 'node:path';

export function resolveProjectWorkspaceRoot(startPath: string = process.cwd()): string {
  const configuredRoot = readConfiguredProjectWorkspaceRoot();
  if (configuredRoot) {
    return configuredRoot;
  }
  return findProjectWorkspaceRoot(startPath)
    ?? findProjectWorkspaceRoot(__dirname)
    ?? process.cwd();
}

export function findProjectWorkspaceRoot(startPath: string): string | null {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (
      fs.existsSync(path.join(currentPath, 'package.json'))
      && fs.existsSync(path.join(currentPath, 'packages', 'server'))
    ) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

function readConfiguredProjectWorkspaceRoot(): string | null {
  const configuredRoot = process.env.GARLIC_CLAW_PROJECT_WORKSPACE_PATH?.trim();
  if (!configuredRoot) {
    return null;
  }
  return path.resolve(configuredRoot);
}
