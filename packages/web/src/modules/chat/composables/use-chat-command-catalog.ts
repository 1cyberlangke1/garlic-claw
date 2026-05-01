import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type { PluginCommandInfo, PluginCommandKind } from '@garlic-claw/shared'
import {
  loadChatCommandCatalog,
  loadChatCommandCatalogVersion,
} from '@/modules/chat/composables/chat-command-catalog.data'

const CHAT_COMMAND_CATALOG_STORAGE_KEY = 'garlic-claw:chat-command-catalog'
const CHAT_COMMAND_VERSION_CHECK_COOLDOWN_MS = 60_000
const CHAT_COMMAND_SUGGESTION_LIMIT = 8

interface ChatCommandCatalogCache {
  version: string
  commands: PluginCommandInfo[]
}

interface ChatCommandTrieNode {
  children: Map<string, ChatCommandTrieNode>
  suggestions: ChatCommandSuggestion[]
}

export interface ChatCommandSuggestion {
  commandId: string
  trigger: string
  canonicalCommand: string
  description?: string
  pluginId: string
  pluginDisplayName?: string
  connected: boolean
  defaultEnabled: boolean
  priority?: number
  kind: PluginCommandKind
}

/**
 * 管理聊天输入里的命令目录缓存、版本校验与前缀提示。
 * @param inputText 聊天输入框内容
 * @returns 命令建议与命令选择动作
 */
export function useChatCommandCatalog(inputText: Ref<string>) {
  const commandSuggestions = ref<ChatCommandSuggestion[]>([])
  const cachedCatalog = ref<ChatCommandCatalogCache | null>(readChatCommandCatalogCache())
  let commandTrieRoot = createChatCommandTrie(cachedCatalog.value?.commands ?? [])
  let commandMatchers = createChatCommandMatchers(cachedCatalog.value?.commands ?? [])
  let catalogRequest: Promise<void> | null = null
  let versionRequest: Promise<void> | null = null
  let lastVersionCheckAt = 0

  watch(
    inputText,
    (value) => {
      void syncCommandSuggestions(value)
    },
    {
      immediate: true,
    },
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
  })

  function applyCommandSuggestion(inputTrigger: string) {
    inputText.value = `${inputTrigger} `
  }

  function resolveMatchedCommand(value: string): ChatCommandSuggestion | null {
    return readMatchedCommand(commandMatchers, value)
  }

  async function syncCommandSuggestions(value: string) {
    const normalizedQuery = readNormalizedCommandQuery(value)
    if (!normalizedQuery) {
      commandSuggestions.value = []
      return
    }

    commandSuggestions.value = readCommandSuggestions(commandTrieRoot, normalizedQuery)
    if (!cachedCatalog.value) {
      try {
        await ensureChatCommandCatalogLoaded()
      } catch {
        return
      }
      commandSuggestions.value = readCommandSuggestions(commandTrieRoot, normalizedQuery)
      return
    }

    void refreshChatCommandCatalogVersionIfNeeded().catch(() => undefined)
  }

  async function ensureChatCommandCatalogLoaded() {
    if (catalogRequest) {
      await catalogRequest
      return
    }

    catalogRequest = (async () => {
      const overview = await loadChatCommandCatalog()
      writeChatCommandCatalogCache({
        version: overview.version,
        commands: overview.commands,
      })
      cachedCatalog.value = {
        version: overview.version,
        commands: overview.commands,
      }
      commandTrieRoot = createChatCommandTrie(overview.commands)
      commandMatchers = createChatCommandMatchers(overview.commands)
    })()

    try {
      await catalogRequest
    } finally {
      catalogRequest = null
    }
  }

  async function refreshChatCommandCatalogVersionIfNeeded(force = false) {
    const now = Date.now()
    if (!force && now - lastVersionCheckAt < CHAT_COMMAND_VERSION_CHECK_COOLDOWN_MS) {
      return
    }
    if (versionRequest) {
      await versionRequest
      return
    }

    lastVersionCheckAt = now
    versionRequest = (async () => {
      const version = await loadChatCommandCatalogVersion()
      if (version.version === cachedCatalog.value?.version) {
        return
      }
      const overview = await loadChatCommandCatalog()
      writeChatCommandCatalogCache({
        version: overview.version,
        commands: overview.commands,
      })
      cachedCatalog.value = {
        version: overview.version,
        commands: overview.commands,
      }
      commandTrieRoot = createChatCommandTrie(overview.commands)
      commandMatchers = createChatCommandMatchers(overview.commands)
      commandSuggestions.value = readCommandSuggestions(
        commandTrieRoot,
        readNormalizedCommandQuery(inputText.value),
      )
    })()

    try {
      await versionRequest
    } finally {
      versionRequest = null
    }
  }

  async function handleDocumentVisibilityChange() {
    if (document.visibilityState !== 'visible' || !cachedCatalog.value) {
      return
    }
    await refreshChatCommandCatalogVersionIfNeeded().catch(() => undefined)
  }

  return {
    commandSuggestions,
    applyCommandSuggestion,
    resolveMatchedCommand,
    refreshChatCommandCatalogVersionIfNeeded,
  }
}

function createChatCommandTrie(commands: PluginCommandInfo[]): ChatCommandTrieNode {
  const root = createChatCommandTrieNode()
  const suggestionMap = new Map<string, ChatCommandSuggestion>()

  for (const command of commands) {
    for (const trigger of command.variants) {
      const suggestion = createChatCommandSuggestion(command, trigger)
      suggestionMap.set(`${command.commandId}:${trigger}`, suggestion)
    }
  }

  const sortedSuggestions = [...suggestionMap.values()].sort(compareChatCommandSuggestions)
  for (const suggestion of sortedSuggestions) {
    insertChatCommandSuggestion(root, suggestion)
  }
  return root
}

function createChatCommandTrieNode(): ChatCommandTrieNode {
  return {
    children: new Map<string, ChatCommandTrieNode>(),
    suggestions: [],
  }
}

function insertChatCommandSuggestion(root: ChatCommandTrieNode, suggestion: ChatCommandSuggestion) {
  let node = root
  for (const character of suggestion.trigger.toLowerCase()) {
    const nextNode = node.children.get(character) ?? createChatCommandTrieNode()
    if (!node.children.has(character)) {
      node.children.set(character, nextNode)
    }
    node = nextNode
    if (!node.suggestions.some((entry) => entry.commandId === suggestion.commandId && entry.trigger === suggestion.trigger)) {
      node.suggestions.push(suggestion)
    }
  }
}

function readCommandSuggestions(root: ChatCommandTrieNode, normalizedQuery: string | null): ChatCommandSuggestion[] {
  if (!normalizedQuery) {
    return []
  }

  let node = root
  for (const character of normalizedQuery) {
    const nextNode = node.children.get(character)
    if (!nextNode) {
      return []
    }
    node = nextNode
  }

  return node.suggestions.slice(0, CHAT_COMMAND_SUGGESTION_LIMIT)
}

function createChatCommandSuggestion(command: PluginCommandInfo, trigger: string): ChatCommandSuggestion {
  return {
    commandId: command.commandId,
    trigger,
    canonicalCommand: command.canonicalCommand,
    ...(command.description ? { description: command.description } : {}),
    pluginId: command.pluginId,
    ...(command.pluginDisplayName ? { pluginDisplayName: command.pluginDisplayName } : {}),
    connected: command.connected,
    defaultEnabled: command.defaultEnabled,
    ...(typeof command.priority === 'number' ? { priority: command.priority } : {}),
    kind: command.kind,
  }
}

function createChatCommandMatchers(commands: PluginCommandInfo[]): ChatCommandSuggestion[] {
  return [...new Map(
    commands.flatMap((command) =>
      command.variants.map((trigger) => {
        const suggestion = createChatCommandSuggestion(command, trigger)
        return [`${suggestion.commandId}:${suggestion.trigger}`, suggestion] as const
      }),
    ),
  ).values()].sort((left, right) =>
    compareNumbers(right.trigger.length, left.trigger.length)
    || compareChatCommandSuggestions(left, right),
  )
}

function readMatchedCommand(
  suggestions: ChatCommandSuggestion[],
  value: string,
): ChatCommandSuggestion | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized.startsWith('/')) {
    return null
  }

  const matched = suggestions.find((entry) =>
    entry.connected
    && entry.defaultEnabled
    && (
      normalized === entry.trigger.toLowerCase()
      || normalized.startsWith(`${entry.trigger.toLowerCase()} `)
    ),
  )
  return matched ?? null
}

function compareChatCommandSuggestions(left: ChatCommandSuggestion, right: ChatCommandSuggestion): number {
  return compareBooleans(right.connected, left.connected)
    || compareNumbers(left.priority, right.priority)
    || compareNumbers(left.trigger.length, right.trigger.length)
    || compareStrings(left.pluginDisplayName ?? left.pluginId, right.pluginDisplayName ?? right.pluginId)
    || compareStrings(left.trigger, right.trigger)
    || compareStrings(left.commandId, right.commandId)
}

function readNormalizedCommandQuery(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed.startsWith('/')) {
    return null
  }
  return trimmed
}

function writeChatCommandCatalogCache(cache: ChatCommandCatalogCache) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }
  window.localStorage.setItem(CHAT_COMMAND_CATALOG_STORAGE_KEY, JSON.stringify(cache))
}

function readChatCommandCatalogCache(): ChatCommandCatalogCache | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(CHAT_COMMAND_CATALOG_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ChatCommandCatalogCache>
    if (typeof parsed.version !== 'string' || !Array.isArray(parsed.commands)) {
      return null
    }
    return {
      version: parsed.version,
      commands: parsed.commands as PluginCommandInfo[],
    }
  } catch {
    return null
  }
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right)
}

function compareNumbers(left: number | undefined, right: number | undefined): number {
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER)
}

function compareBooleans(left: boolean, right: boolean): number {
  return Number(left) - Number(right)
}
