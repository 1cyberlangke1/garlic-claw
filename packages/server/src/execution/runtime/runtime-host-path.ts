import path from 'node:path';
import { BadRequestException } from '@nestjs/common';

export function toRuntimeHostPath(sessionRoot: string, virtualRoot: string, virtualPath: string): string {
  const relativePath = readRelativeRuntimePath(virtualRoot, virtualPath);
  const hostPath = relativePath ? path.join(sessionRoot, ...relativePath.split('/')) : sessionRoot;
  const resolved = path.resolve(hostPath);
  const normalizedSessionRoot = path.resolve(sessionRoot);
  if (resolved !== normalizedSessionRoot && !resolved.startsWith(`${normalizedSessionRoot}${path.sep}`)) {
    throw new BadRequestException(`路径越界: ${virtualPath}`);
  }
  return resolved;
}

function readRelativeRuntimePath(virtualRoot: string, virtualPath: string): string {
  if (virtualRoot === '/') {
    return virtualPath.replace(/^\/+/, '');
  }
  return virtualPath === virtualRoot ? '' : virtualPath.slice(virtualRoot.length + 1);
}
