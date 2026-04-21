import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeBackend, RuntimeBackendDescriptor, RuntimeCommandRequest, RuntimeCommandResult } from './runtime-command.types';
import { RUNTIME_BACKENDS, type RuntimeBackendList } from './runtime-backend.constants';

@Injectable()
export class RuntimeCommandService {
  private readonly backends = new Map<RuntimeBackendKind, RuntimeBackend>();
  private readonly defaultBackendKind: RuntimeBackendKind;

  constructor(
    @Inject(RUNTIME_BACKENDS)
    runtimeBackends: RuntimeBackendList,
  ) {
    if (runtimeBackends.length === 0) {
      throw new Error('RuntimeCommandService 至少需要一个 runtime backend');
    }
    for (const backend of runtimeBackends) {
      this.backends.set(backend.getKind(), backend);
    }
    this.defaultBackendKind = runtimeBackends[0].getKind();
  }

  async executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandResult> {
    const backend = this.requireBackend(input.backendKind);
    return backend.executeCommand(input);
  }

  getBackendDescriptor(backendKind?: RuntimeBackendKind): RuntimeBackendDescriptor {
    return this.requireBackend(backendKind).getDescriptor();
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

  private requireBackend(backendKind?: RuntimeBackendKind): RuntimeBackend {
    const resolvedBackendKind = backendKind ?? this.defaultBackendKind;
    const backend = this.backends.get(resolvedBackendKind);
    if (!backend) {
      throw new Error(`Unknown runtime backend: ${resolvedBackendKind}`);
    }
    return backend;
  }
}
