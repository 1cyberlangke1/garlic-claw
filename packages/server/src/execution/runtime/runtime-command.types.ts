import type {
  RuntimeBackendKind,
  RuntimeCapabilityName,
  RuntimePermissionPolicyAction,
} from '@garlic-claw/shared';

export interface RuntimeCommandRequest {
  backendKind?: RuntimeBackendKind;
  command: string;
  description?: string;
  sessionId: string;
  timeout?: number;
  workdir?: string;
}

export interface RuntimeCommandResult {
  backendKind: RuntimeBackendKind;
  cwd: string;
  exitCode: number;
  sessionId: string;
  stderr: string;
  stdout: string;
  workspaceRoot: string;
}

export type RuntimeCapabilitySet = Record<RuntimeCapabilityName, boolean>;

export type RuntimePermissionPolicy = Record<RuntimeCapabilityName, RuntimePermissionPolicyAction>;

export interface RuntimeBackendDescriptor {
  capabilities: RuntimeCapabilitySet;
  kind: RuntimeBackendKind;
  permissionPolicy: RuntimePermissionPolicy;
}

export interface RuntimeBackend {
  executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandResult>;
  getDescriptor(): RuntimeBackendDescriptor;
  getKind(): RuntimeBackendKind;
}
