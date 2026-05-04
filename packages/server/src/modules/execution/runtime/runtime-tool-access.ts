import type { JsonValue, RuntimeBackendKind, RuntimeOperationName } from '@garlic-claw/shared';

export type RuntimeToolBackendRole = 'filesystem' | 'shell';

export interface RuntimeToolAccessRequest {
  backendKind: RuntimeBackendKind;
  role: RuntimeToolBackendRole;
  requiredOperations: RuntimeOperationName[];
  summary: string;
  metadata?: JsonValue;
}
