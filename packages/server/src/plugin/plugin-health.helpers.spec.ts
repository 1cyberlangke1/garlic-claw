import {
  buildPluginFailureUpdate,
  buildPluginSuccessUpdate,
} from './plugin-health.helpers';

describe('plugin-health.helpers', () => {
  const now = new Date('2026-04-02T12:00:00.000Z');

  it('builds healthy success updates for online plugins', () => {
    expect(
      buildPluginSuccessUpdate({
        plugin: {
          status: 'online',
          failureCount: 2,
          consecutiveFailures: 2,
        },
        checked: true,
        now,
      }),
    ).toEqual({
      healthStatus: 'healthy',
      consecutiveFailures: 0,
      lastSuccessAt: now,
      lastCheckedAt: now,
    });
  });

  it('keeps offline plugins offline when recording successes or failures', () => {
    expect(
      buildPluginSuccessUpdate({
        plugin: {
          status: 'offline',
          failureCount: 0,
          consecutiveFailures: 0,
        },
        now,
      }),
    ).toEqual({
      healthStatus: 'offline',
      consecutiveFailures: 0,
      lastSuccessAt: now,
    });

    expect(
      buildPluginFailureUpdate({
        plugin: {
          status: 'offline',
          failureCount: 1,
          consecutiveFailures: 2,
        },
        message: 'boom',
        now,
      }),
    ).toEqual({
      healthStatus: 'offline',
      failureCount: 2,
      consecutiveFailures: 3,
      lastError: 'boom',
      lastErrorAt: now,
    });
  });

  it('escalates repeated online failures from degraded to error', () => {
    expect(
      buildPluginFailureUpdate({
        plugin: {
          status: 'online',
          failureCount: 1,
          consecutiveFailures: 1,
        },
        message: 'timeout',
        checked: true,
        now,
      }),
    ).toEqual({
      healthStatus: 'degraded',
      failureCount: 2,
      consecutiveFailures: 2,
      lastError: 'timeout',
      lastErrorAt: now,
      lastCheckedAt: now,
    });

    expect(
      buildPluginFailureUpdate({
        plugin: {
          status: 'online',
          failureCount: 2,
          consecutiveFailures: 2,
        },
        message: 'timeout',
        now,
      }),
    ).toEqual({
      healthStatus: 'error',
      failureCount: 3,
      consecutiveFailures: 3,
      lastError: 'timeout',
      lastErrorAt: now,
    });
  });
});
