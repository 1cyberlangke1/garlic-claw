import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatCommandCatalog } from '@/modules/chat/composables/use-chat-command-catalog'
import * as chatCommandCatalogData from '@/modules/chat/composables/chat-command-catalog.data'

vi.mock('@/modules/chat/composables/chat-command-catalog.data', () => ({
  loadChatCommandCatalog: vi.fn(),
  loadChatCommandCatalogVersion: vi.fn(),
}))

function createCommand(commandId: string, trigger: string, connected = true) {
  return {
    aliases: [],
    canonicalCommand: trigger,
    commandId,
    conflictTriggers: [],
    connected,
    defaultEnabled: true,
    kind: 'command' as const,
    path: [trigger.replace(/^\//, '')],
    pluginDisplayName: '上下文压缩',
    pluginId: 'internal.context-governance',
    runtimeKind: 'local' as const,
    source: 'manifest' as const,
    variants: [trigger],
  }
}

describe('useChatCommandCatalog', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(chatCommandCatalogData.loadChatCommandCatalogVersion).mockResolvedValue({
      version: 'catalog-v1',
    })
    vi.mocked(chatCommandCatalogData.loadChatCommandCatalog).mockResolvedValue({
      version: 'catalog-v1',
      commands: [createCommand('internal.context-governance:/compact:command', '/compact')],
      conflicts: [],
    })
  })

  it('reads cached command suggestions from local storage without loading the overview again', async () => {
    localStorage.setItem(
      'garlic-claw:chat-command-catalog',
      JSON.stringify({
        version: 'catalog-v1',
        commands: [createCommand('internal.context-governance:/compact:command', '/compact')],
      }),
    )

    let suggestions!: ReturnType<typeof useChatCommandCatalog>['commandSuggestions']
    const Harness = defineComponent({
      setup() {
        const inputText = ref('/comp')
        const state = useChatCommandCatalog(inputText)
        suggestions = state.commandSuggestions
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(suggestions.value.map((entry) => entry.trigger)).toEqual(['/compact'])
    expect(chatCommandCatalogData.loadChatCommandCatalog).not.toHaveBeenCalled()
  })

  it('resolves the longest matching registered command trigger', async () => {
    vi.mocked(chatCommandCatalogData.loadChatCommandCatalog).mockResolvedValue({
      version: 'catalog-v1',
      commands: [
        createCommand('internal.context-governance:/compact:command', '/compact'),
        createCommand('internal.context-governance:/compact/deep:command', '/compact deep'),
      ],
      conflicts: [],
    })

    let resolveMatchedCommand!: ReturnType<typeof useChatCommandCatalog>['resolveMatchedCommand']
    const Harness = defineComponent({
      setup() {
        const inputText = ref('/compact deep now')
        const state = useChatCommandCatalog(inputText)
        resolveMatchedCommand = state.resolveMatchedCommand
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(resolveMatchedCommand('/compact deep now')?.trigger).toBe('/compact deep')
    expect(resolveMatchedCommand('/compact later')?.trigger).toBe('/compact')
    expect(resolveMatchedCommand('/unknown')).toBeNull()
  })

  it('refreshes the local cache when the backend command catalog version changes', async () => {
    localStorage.setItem(
      'garlic-claw:chat-command-catalog',
      JSON.stringify({
        version: 'catalog-v1',
        commands: [createCommand('internal.context-governance:/compact:command', '/compact')],
      }),
    )
    vi.mocked(chatCommandCatalogData.loadChatCommandCatalogVersion).mockResolvedValue({
      version: 'catalog-v2',
    })
    vi.mocked(chatCommandCatalogData.loadChatCommandCatalog).mockResolvedValue({
      version: 'catalog-v2',
      commands: [
        createCommand('internal.context-governance:/compact:command', '/compact'),
        createCommand('internal.context-governance:/compress:command', '/compress'),
      ],
      conflicts: [],
    })

    let suggestions!: ReturnType<typeof useChatCommandCatalog>['commandSuggestions']
    const Harness = defineComponent({
      setup() {
        const inputText = ref('/comp')
        const state = useChatCommandCatalog(inputText)
        suggestions = state.commandSuggestions
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(chatCommandCatalogData.loadChatCommandCatalogVersion).toHaveBeenCalledTimes(2)
    expect(chatCommandCatalogData.loadChatCommandCatalog).toHaveBeenCalledTimes(2)
    expect(suggestions.value.map((entry) => entry.trigger)).toEqual(['/compact', '/compress'])
    expect(
      JSON.parse(localStorage.getItem('garlic-claw:chat-command-catalog') ?? '{}').version,
    ).toBe('catalog-v2')
  })
})
