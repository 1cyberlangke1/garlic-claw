import { BadRequestException } from '@nestjs/common';

export function joinRuntimeVisiblePath(basePath: string, nextPath: string): string {
  return normalizeRuntimeVisiblePath(`${basePath}/${nextPath}`);
}

export function normalizeRuntimeVisiblePath(input: string): string {
  const parts = input.split('/').filter((entry) => entry.length > 0 && entry !== '.');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join('/')}`;
}

export function resolveRuntimeVisiblePath(
  visibleRoot: string,
  inputPath?: string,
  violationMessage = `路径必须位于 ${visibleRoot} 内`,
): string {
  if (!inputPath || !inputPath.trim()) {
    return visibleRoot;
  }
  const normalized = inputPath.trim().startsWith('/')
    ? normalizeRuntimeVisiblePath(inputPath.trim())
    : normalizeRuntimeVisiblePath(`${visibleRoot}/${inputPath.trim()}`);
  if (visibleRoot !== '/' && normalized !== visibleRoot && !normalized.startsWith(`${visibleRoot}/`)) {
    throw new BadRequestException(violationMessage);
  }
  return normalized;
}
