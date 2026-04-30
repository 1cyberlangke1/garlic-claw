import type { RuntimeToolBackendRole } from './runtime-tool-access';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import { Injectable } from '@nestjs/common';
import { RuntimeBackendRoutingService } from './runtime-backend-routing.service';
import { RuntimeCommandService } from './runtime-command.service';
import { RuntimeFilesystemBackendService } from './runtime-filesystem-backend.service';

@Injectable()
export class RuntimeToolBackendService {
  constructor(
    private readonly runtimeBackendRoutingService: RuntimeBackendRoutingService,
    private readonly runtimeCommandService: RuntimeCommandService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
  ) {}

  getBackendDescriptor(
    role: RuntimeToolBackendRole,
    backendKind?: RuntimeBackendDescriptor['kind'],
  ): RuntimeBackendDescriptor {
    return role === 'shell'
      ? this.getShellBackendDescriptor(backendKind)
      : this.getFilesystemBackendDescriptor(backendKind);
  }

  getBackendKind(
    role: RuntimeToolBackendRole,
    backendKind?: RuntimeBackendDescriptor['kind'],
  ): RuntimeBackendDescriptor['kind'] {
    return this.getBackendDescriptor(role, backendKind).kind;
  }

  getShellBackendDescriptor(backendKind?: RuntimeBackendDescriptor['kind']): RuntimeBackendDescriptor {
    return this.readConfiguredBackendDescriptor(
      backendKind ?? this.runtimeBackendRoutingService.getConfiguredShellBackendKind(),
      'shell',
    );
  }

  getShellBackendKind(backendKind?: RuntimeBackendDescriptor['kind']): RuntimeBackendDescriptor['kind'] {
    return this.getShellBackendDescriptor(backendKind).kind;
  }

  getFilesystemBackendDescriptor(backendKind?: RuntimeBackendDescriptor['kind']): RuntimeBackendDescriptor {
    return this.readConfiguredFilesystemBackendDescriptor(
      backendKind ?? this.runtimeBackendRoutingService.getConfiguredFilesystemBackendKind(),
    );
  }

  getFilesystemBackendKind(backendKind?: RuntimeBackendDescriptor['kind']): RuntimeBackendDescriptor['kind'] {
    return this.getFilesystemBackendDescriptor(backendKind).kind;
  }

  private readConfiguredFilesystemBackendDescriptor(
    configuredBackendKind?: RuntimeBackendDescriptor['kind'],
  ): RuntimeBackendDescriptor {
    if (!configuredBackendKind) {
      return this.runtimeFilesystemBackendService.getDefaultBackendDescriptor();
    }
    if (!this.runtimeFilesystemBackendService.hasBackend(configuredBackendKind)) {
      throw new Error(
        `Unknown runtime filesystem backend: ${configuredBackendKind}. Available backends: ${this.runtimeFilesystemBackendService.listBackendKinds().join(', ')}`,
      );
    }
    return this.runtimeFilesystemBackendService.getBackendDescriptor(configuredBackendKind);
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
