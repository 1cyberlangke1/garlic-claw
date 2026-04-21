import type { RuntimeToolBackendRole } from './runtime-tool-access';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import { Injectable } from '@nestjs/common';
import { RuntimeCommandService } from './runtime-command.service';
import { RuntimeFilesystemBackendService } from './runtime-filesystem-backend.service';

@Injectable()
export class RuntimeToolBackendService {
  constructor(
    private readonly runtimeCommandService: RuntimeCommandService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
  ) {}

  getBackendDescriptor(role: RuntimeToolBackendRole): RuntimeBackendDescriptor {
    return role === 'shell'
      ? this.getShellBackendDescriptor()
      : this.getFilesystemBackendDescriptor();
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

  getFilesystemBackendDescriptor(): RuntimeBackendDescriptor {
    return this.runtimeFilesystemBackendService.getConfiguredBackendDescriptor();
  }

  getFilesystemBackendKind(): RuntimeBackendDescriptor['kind'] {
    return this.getFilesystemBackendDescriptor().kind;
  }

  private readConfiguredBackendDescriptor(
    configuredBackendKind: string | undefined,
    role: 'filesystem' | 'shell',
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
