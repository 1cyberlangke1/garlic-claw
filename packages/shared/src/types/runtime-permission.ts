import type { JsonValue } from './json';

export type RuntimeBackendKind = string;

export type RuntimeCapabilityName =
  | 'workspaceRead'
  | 'workspaceWrite'
  | 'shellExecution'
  | 'networkAccess'
  | 'persistentFilesystem'
  | 'persistentShellState';

export type RuntimeOperationName =
  | 'command.execute'
  | 'file.delete'
  | 'file.edit'
  | 'file.list'
  | 'file.read'
  | 'file.symlink'
  | 'file.write'
  | 'network.access';

export type RuntimePermissionPolicyAction = 'allow' | 'ask' | 'deny';

export type RuntimePermissionDecision = 'once' | 'always' | 'reject';

export type RuntimePermissionResolution = 'approved' | 'rejected';

export interface RuntimePermissionRequest {
  id: string;
  conversationId: string;
  messageId?: string;
  backendKind: RuntimeBackendKind;
  toolName: string;
  operations: RuntimeOperationName[];
  createdAt: string;
  summary: string;
  metadata?: JsonValue;
}

export interface RuntimePermissionReplyResult {
  requestId: string;
  resolution: RuntimePermissionResolution;
}
