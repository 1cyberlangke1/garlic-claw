import {
  buildPluginHeartbeatMutation,
  buildPluginLifecycleEvent,
  buildPluginOfflineMutation,
  buildPluginOnlineMutation,
} from './plugin-lifecycle.helpers';

describe('plugin-lifecycle.helpers', () => {
  it('builds online/offline/heartbeat mutations for persisted plugin lifecycle state', () => {
    const now = new Date('2026-04-02T12:00:00.000Z');

    expect(buildPluginOnlineMutation(now)).toEqual({
      status: 'online',
      healthStatus: 'healthy',
      lastSeenAt: now,
    });
    expect(buildPluginOfflineMutation()).toEqual({
      status: 'offline',
      healthStatus: 'offline',
    });
    expect(buildPluginHeartbeatMutation(now)).toEqual({
      lastSeenAt: now,
    });
  });

  it('builds lifecycle online vs offline events from the target status', () => {
    expect(buildPluginLifecycleEvent({ status: 'online' })).toEqual({
      type: 'lifecycle:online',
      level: 'info',
      message: '插件已上线',
    });
    expect(buildPluginLifecycleEvent({ status: 'offline' })).toEqual({
      type: 'lifecycle:offline',
      level: 'warn',
      message: '插件已离线',
    });
  });
});
