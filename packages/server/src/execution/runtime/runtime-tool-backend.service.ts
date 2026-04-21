import type { RuntimeToolBackendRole } from './runtime-tool-access';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import { Injectable } from '@nestjs/common';
import { RuntimeCommandService } from './runtime-command.service';
import { RuntimeWorkspaceBackendService } from './runtime-workspace-backend.service';

@Injectable()
export class RuntimeToolBackendService {
  constructor(
    private readonly runtimeCommandService: RuntimeCommandService,
    private readonly runtimeWorkspaceBackendService: RuntimeWorkspaceBackendService,
  ) {}

  getBackendDescriptor(role: RuntimeToolBackendRole): RuntimeBackendDescriptor {
    return role === 'shell'
      ? this.getShellBackendDescriptor()
      : this.getWorkspaceBackendDescriptor();
  }

  getBackendKind(role: RuntimeToolBackendRole): RuntimeBackendDescriptor['kind'] {
    return this.getBackendDescriptor(role).kind;
  }

  getShellBackendDescriptor(): RuntimeBackendDescriptor {
    return this.readConfiguredBackendDescriptor(
      process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND,
      'shell',
    );
  }

  getShellBackendKind(): RuntimeBackendDescriptor['kind'] {
    return this.getShellBackendDescriptor().kind;
  }

  getWorkspaceBackendDescriptor(): RuntimeBackendDescriptor {
    return this.runtimeWorkspaceBackendService.getConfiguredBackendDescriptor();
  }

  getWorkspaceBackendKind(): RuntimeBackendDescriptor['kind'] {
    return this.getWorkspaceBackendDescriptor().kind;
  }

  private readConfiguredBackendDescriptor(
    configuredBackendKind: string | undefined,
    role: 'shell' | 'workspace',
  ): RuntimeBackendDescriptor {
    const normalizedBackendKind = configuredBackendKind?.trim();
    if (!normalizedBackendKind) {
      return this.runtimeCommandService.getDefaultBackendDescriptor();
    }
    if (!this.runtimeCommandService.hasBackend(normalizedBackendKind)) {
      throw new Error(
        `Unknown runtime ${role} backend: ${normalizedBackendKind}. Available backends: ${this.runtimeCommandService.listBackendKinds().join(', ')}`,
      );
    }
    return this.runtimeCommandService.getBackendDescriptor(normalizedBackendKind);
  }
}
