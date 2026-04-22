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

export interface RuntimeCommandBackendResult {
  backendKind: RuntimeBackendKind;
  cwd: string;
  exitCode: number;
  sessionId: string;
  stderr: string;
  stdout: string;
}

export interface RuntimeCommandResult extends RuntimeCommandBackendResult {
  outputPath?: string;
  stderrStats: RuntimeCommandStreamStats;
  stdoutStats: RuntimeCommandStreamStats;
}

export interface RuntimeCommandStreamStats {
  bytes: number;
  lines: number;
}

export type RuntimeCapabilitySet = Record<RuntimeCapabilityName, boolean>;

export type RuntimePermissionPolicy = Record<RuntimeCapabilityName, RuntimePermissionPolicyAction>;

export interface RuntimeBackendDescriptor {
  capabilities: RuntimeCapabilitySet;
  kind: RuntimeBackendKind;
  permissionPolicy: RuntimePermissionPolicy;
}

export interface RuntimeBackend {
  executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandBackendResult>;
  getDescriptor(): RuntimeBackendDescriptor;
  getKind(): RuntimeBackendKind;
}
