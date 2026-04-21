import type { JsonValue, RuntimeOperationName } from '@garlic-claw/shared';

export type RuntimeToolBackendRole = 'filesystem' | 'shell';

export interface RuntimeToolAccessRequest {
  role: RuntimeToolBackendRole;
  requiredOperations: RuntimeOperationName[];
  summary: string;
  metadata?: JsonValue;
}
