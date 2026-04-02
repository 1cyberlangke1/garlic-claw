export function buildPluginOnlineMutation(now: Date) {
  return {
    status: 'online' as const,
    healthStatus: 'healthy' as const,
    lastSeenAt: now,
  };
}

export function buildPluginOfflineMutation() {
  return {
    status: 'offline' as const,
    healthStatus: 'offline' as const,
  };
}

export function buildPluginHeartbeatMutation(now: Date) {
  return {
    lastSeenAt: now,
  };
}

export function buildPluginLifecycleEvent(input: {
  status: 'online' | 'offline';
}) {
  return input.status === 'online'
    ? {
      type: 'lifecycle:online',
      level: 'info' as const,
      message: '插件已上线',
    }
    : {
      type: 'lifecycle:offline',
      level: 'warn' as const,
      message: '插件已离线',
    };
}
