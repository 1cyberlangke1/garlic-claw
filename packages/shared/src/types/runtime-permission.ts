import type { JsonValue } from './json';

export type RuntimeBackendKind = string;

export type RuntimeCapabilityName =
  | 'workspaceRead'
  | 'workspaceWrite'
  | 'shellExecution'
  | 'networkAccess'
  | 'persistentFilesystem'
  | 'persistentShellState';

export type RuntimePermissionPolicyAction = 'allow' | 'ask' | 'deny';

export type RuntimePermissionDecision = 'once' | 'always' | 'reject';

export type RuntimePermissionResolution = 'approved' | 'rejected';

export interface RuntimePermissionRequest {
  id: string;
  conversationId: string;
  messageId?: string;
  backendKind: RuntimeBackendKind;
  toolName: string;
  capabilities: RuntimeCapabilityName[];
  createdAt: string;
  summary: string;
  metadata?: JsonValue;
}

export interface RuntimePermissionReplyResult {
  requestId: string;
  resolution: RuntimePermissionResolution;
}
