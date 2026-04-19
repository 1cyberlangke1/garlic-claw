import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import PluginRemoteSummaryPanel from '@/features/plugins/components/PluginRemoteSummaryPanel.vue'

function createRemotePlugin(remote?: Partial<NonNullable<PluginInfo['remote']>>): PluginInfo {
  return {
    connected: false,
    createdAt: '2026-04-19T00:00:00.000Z',
    defaultEnabled: true,
    displayName: 'Smoke Remote Light',
    health: {
      consecutiveFailures: 0,
      failureCount: 0,
      lastCheckedAt: '2026-04-19T00:00:00.000Z',
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      status: 'offline',
    },
    id: 'remote.smoke-light',
    lastSeenAt: null,
    manifest: {
      id: 'remote.smoke-light',
      name: 'Smoke Remote Light',
      permissions: [],
      remote: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'actuate',
        remoteEnvironment: 'iot',
      },
      runtime: 'remote',
      tools: [],
      version: '1.0.0',
    },
    name: 'remote.smoke-light',
    remote: {
      access: {
        accessKey: 'smoke-key',
        serverUrl: 'ws://127.0.0.1:23331',
      },
      descriptor: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'actuate',
        remoteEnvironment: 'iot',
      },
      metadataCache: {
        lastSyncedAt: '2026-04-19T08:00:00.000Z',
        manifestHash: 'hash-v1',
        status: 'cached',
      },
      ...remote,
    },
    runtimeKind: 'remote',
    status: 'offline',
    supportedActions: ['health-check', 'refresh-metadata'],
    updatedAt: '2026-04-19T00:00:00.000Z',
    version: '1.0.0',
  }
}

describe('PluginRemoteSummaryPanel', () => {
  it('renders offline cached iot metadata with a high-risk badge', () => {
    const wrapper = mount(PluginRemoteSummaryPanel, {
      props: {
        plugin: createRemotePlugin(),
      },
    })

    expect(wrapper.get('[data-test="plugin-remote-risk-badge"]').text()).toBe('高风险')
    expect(wrapper.text()).toContain('IoT 远程插件')
    expect(wrapper.text()).toContain('必须 Key')
    expect(wrapper.text()).toContain('控制型')
    expect(wrapper.text()).toContain('已有缓存')
    expect(wrapper.text()).toContain('ws://127.0.0.1:23331')
    expect(wrapper.text()).toContain('已配置')
    expect(wrapper.text()).toContain('2026-04-19T08:00:00.000Z')
  })

  it('renders api query metadata as neutral when no key is configured', () => {
    const wrapper = mount(PluginRemoteSummaryPanel, {
      props: {
        plugin: createRemotePlugin({
          access: {
            accessKey: null,
            serverUrl: null,
          },
          descriptor: {
            auth: {
              mode: 'optional',
            },
            capabilityProfile: 'query',
            remoteEnvironment: 'api',
          },
          metadataCache: {
            lastSyncedAt: null,
            manifestHash: null,
            status: 'empty',
          },
        }),
      },
    })

    expect(wrapper.get('[data-test="plugin-remote-risk-badge"]').text()).toBe('查询型')
    expect(wrapper.text()).toContain('API 远程插件')
    expect(wrapper.text()).toContain('可选 Key')
    expect(wrapper.text()).toContain('查询型')
    expect(wrapper.text()).toContain('尚未缓存')
    expect(wrapper.text()).toContain('未配置')
    expect(wrapper.text()).toContain('尚未同步')
  })
})
