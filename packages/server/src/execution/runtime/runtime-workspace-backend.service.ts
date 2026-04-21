import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import { RUNTIME_WORKSPACE_BACKENDS, type RuntimeWorkspaceBackendList } from './runtime-workspace-backend.constants';
import type { RuntimeWorkspaceBackend } from './runtime-workspace-backend.types';

@Injectable()
export class RuntimeWorkspaceBackendService {
  private readonly backends = new Map<RuntimeBackendKind, RuntimeWorkspaceBackend>();
  private readonly defaultBackendKind: RuntimeBackendKind;

  constructor(
    @Inject(RUNTIME_WORKSPACE_BACKENDS)
    workspaceBackends: RuntimeWorkspaceBackendList,
  ) {
    if (workspaceBackends.length === 0) {
      throw new Error('RuntimeWorkspaceBackendService 至少需要一个 workspace backend');
    }
    for (const backend of workspaceBackends) {
      this.backends.set(backend.getKind(), backend);
    }
    this.defaultBackendKind = workspaceBackends[0].getKind();
  }

  getBackend(backendKind?: RuntimeBackendKind): RuntimeWorkspaceBackend {
    return this.requireBackend(backendKind);
  }

  getConfiguredBackend(): RuntimeWorkspaceBackend {
    const configuredBackendKind = process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND?.trim();
    if (!configuredBackendKind) {
      return this.requireBackend();
    }
    return this.requireConfiguredBackend(configuredBackendKind);
  }

  getBackendDescriptor(backendKind?: RuntimeBackendKind): RuntimeBackendDescriptor {
    return this.requireBackend(backendKind).getDescriptor();
  }

  getConfiguredBackendDescriptor(): RuntimeBackendDescriptor {
    return this.getConfiguredBackend().getDescriptor();
  }

  getDefaultBackend(): RuntimeWorkspaceBackend {
    return this.requireBackend();
  }

  getDefaultBackendDescriptor(): RuntimeBackendDescriptor {
    return this.requireBackend().getDescriptor();
  }

  getDefaultBackendKind(): RuntimeBackendKind {
    return this.defaultBackendKind;
  }

  hasBackend(backendKind: RuntimeBackendKind): boolean {
    return this.backends.has(backendKind);
  }

  listBackendKinds(): RuntimeBackendKind[] {
    return Array.from(this.backends.keys());
  }

  private requireConfiguredBackend(backendKind: RuntimeBackendKind): RuntimeWorkspaceBackend {
    if (!this.hasBackend(backendKind)) {
      throw new Error(
        `Unknown runtime workspace backend: ${backendKind}. Available backends: ${this.listBackendKinds().join(', ')}`,
      );
    }
    return this.requireBackend(backendKind);
  }

  private requireBackend(backendKind?: RuntimeBackendKind): RuntimeWorkspaceBackend {
    const resolvedBackendKind = backendKind ?? this.defaultBackendKind;
    const backend = this.backends.get(resolvedBackendKind);
    if (!backend) {
      throw new Error(`Unknown runtime workspace backend: ${resolvedBackendKind}`);
    }
    return backend;
  }
}
