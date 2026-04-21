import type { JsonValue, RuntimeCapabilityName } from '@garlic-claw/shared';

export type RuntimeToolBackendRole = 'shell' | 'workspace';

export interface RuntimeToolAccessRequest {
  role: RuntimeToolBackendRole;
  requiredCapabilities: RuntimeCapabilityName[];
  summary: string;
  metadata?: JsonValue;
}
