import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { readRuntimeSearchSuggestedReadPath } from '../file/runtime-search-result-report';
import { toRuntimeHostPath } from '../runtime/host-path';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { ProjectWorktreeRootService } from './project-worktree-root.service';

@Injectable()
export class ProjectWorktreeSearchOverlayService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly projectWorktreeRootService: ProjectWorktreeRootService,
  ) {}

  async buildSearchOverlay(input: {
    basePath: string;
    matches?: Array<string | { virtualPath: string }>;
    sessionId: string;
  }): Promise<string[]> {
    const overlay: string[] = [];
    const baseOverlay = await this.renderProjectRelativeOverlay(input.sessionId, input.basePath, 'Project Base');
    if (baseOverlay) {
      overlay.push(baseOverlay);
    }
    const suggestedReadPath = readRuntimeSearchSuggestedReadPath(input.matches ?? []);
    if (suggestedReadPath) {
      const readOverlay = await this.renderProjectRelativeOverlay(
        input.sessionId,
        suggestedReadPath,
        'Project Next Read',
      );
      if (readOverlay) {
        overlay.push(readOverlay);
      }
    }
    return overlay;
  }

  private async renderProjectRelativeOverlay(
    sessionId: string,
    virtualPath: string,
    label: 'Project Base' | 'Project Next Read',
  ): Promise<string | undefined> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId);
    const hostPath = toRuntimeHostPath(
      sessionEnvironment.sessionRoot,
      sessionEnvironment.visibleRoot,
      virtualPath,
    );
    const projectRoot = this.projectWorktreeRootService.findRoot(hostPath);
    if (!projectRoot) {
      return undefined;
    }
    const relativePath = normalizeProjectRelativePath(path.relative(projectRoot, hostPath));
    return `${label}: ${relativePath}`;
  }
}

function normalizeProjectRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  return normalized.length > 0 ? normalized : '.';
}
