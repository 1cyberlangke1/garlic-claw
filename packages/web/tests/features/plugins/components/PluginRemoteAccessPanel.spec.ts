import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import PluginRemoteAccessPanel from '@/features/plugins/components/PluginRemoteAccessPanel.vue'

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
        accessKey: null,
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
        lastSyncedAt: '2026-04-19T00:00:00.000Z',
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

describe('PluginRemoteAccessPanel', () => {
  it('requires access key for required auth and emits normalized remote access payload', async () => {
    const wrapper = mount(PluginRemoteAccessPanel, {
      props: {
        plugin: createRemotePlugin(),
        saving: false,
      },
    })

    expect(wrapper.text()).toContain('IoT 远程插件')
    expect(wrapper.text()).toContain('必须 Key')
    expect(wrapper.text()).toContain('控制型')
    expect(wrapper.text()).toContain('已有缓存')

    const saveButton = wrapper.get('[data-test="plugin-remote-access-save"]')
    expect((saveButton.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.get('[data-test="plugin-remote-access-server-url"]').setValue(' ws://127.0.0.1:24444 ')
    await wrapper.get('[data-test="plugin-remote-access-key"]').setValue(' smoke-key ')
    expect((saveButton.element as HTMLButtonElement).disabled).toBe(false)

    await saveButton.trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          access: {
            accessKey: 'smoke-key',
            serverUrl: 'ws://127.0.0.1:24444',
          },
          displayName: 'Smoke Remote Light',
          remote: {
            auth: {
              mode: 'required',
            },
            capabilityProfile: 'actuate',
            remoteEnvironment: 'iot',
          },
          version: '1.0.0',
        },
      ],
    ])
  })

  it('hides the access key input when auth mode is none', () => {
    const wrapper = mount(PluginRemoteAccessPanel, {
      props: {
        plugin: createRemotePlugin({
          descriptor: {
            auth: {
              mode: 'none',
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
        saving: false,
      },
    })

    expect(wrapper.text()).toContain('API 远程插件')
    expect(wrapper.text()).toContain('无需鉴权')
    expect(wrapper.text()).toContain('查询型')
    expect(wrapper.text()).toContain('尚未缓存')
    expect(wrapper.find('[data-test="plugin-remote-access-key"]').exists()).toBe(false)
  })
})
