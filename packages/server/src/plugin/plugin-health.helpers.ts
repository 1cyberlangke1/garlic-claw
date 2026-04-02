export interface PersistedPluginHealthRecord {
  status: string;
  failureCount: number;
  consecutiveFailures: number;
}

export function buildPluginSuccessUpdate(input: {
  plugin: PersistedPluginHealthRecord;
  checked?: boolean;
  now: Date;
}) {
  return {
    healthStatus: input.plugin.status === 'offline' ? 'offline' : 'healthy',
    consecutiveFailures: 0,
    lastSuccessAt: input.now,
    ...(input.checked ? { lastCheckedAt: input.now } : {}),
  };
}

export function buildPluginFailureUpdate(input: {
  plugin: PersistedPluginHealthRecord;
  message: string;
  checked?: boolean;
  now: Date;
}) {
  const consecutiveFailures = input.plugin.consecutiveFailures + 1;
  return {
    healthStatus:
      input.plugin.status === 'offline'
        ? 'offline'
        : consecutiveFailures >= 3
          ? 'error'
          : 'degraded',
    failureCount: input.plugin.failureCount + 1,
    consecutiveFailures,
    lastError: input.message,
    lastErrorAt: input.now,
    ...(input.checked ? { lastCheckedAt: input.now } : {}),
  };
}
