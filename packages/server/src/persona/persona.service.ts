import type {
  PluginPersonaCurrentInfo,
  PluginPersonaDeleteResult,
  PluginPersonaDetail,
  PluginPersonaDialogEntry,
  PluginPersonaSummary,
  PluginPersonaUpdateInput,
  PluginPersonaUpsertInput,
} from '@garlic-claw/shared'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConversationStoreService } from '../runtime/host/conversation-store.service'
import { DEFAULT_PERSONA_ID } from '../runtime/host/host-input.codec'
import { PersonaStoreService } from './persona-store.service'
import type { StoredPersonaRecord } from './persona-store.service'

type PersonaContextInput = {
  context: { activePersonaId?: string; conversationId?: string; source: string; userId?: string }
  conversationActivePersonaId?: string
  conversationId?: string
}
type PersonaSource = 'context' | 'conversation' | 'default'

@Injectable()
export class PersonaService {
  constructor(
    private readonly personaStoreService: PersonaStoreService,
    private readonly runtimeHostConversationRecordService: ConversationStoreService,
  ) {}

  listPersonas(): PluginPersonaSummary[] { return this.listStoredPersonas().map(toPersonaSummary) }
  readPersona(personaId: string): PluginPersonaDetail { return toPersonaDetail(this.requirePersona(personaId)) }

  readCurrentPersona(input: PersonaContextInput): PluginPersonaCurrentInfo {
    return toCurrentPersona(this.resolvePersonaForContext(
      input.context.activePersonaId,
      input.conversationActivePersonaId ?? this.readConversationActivePersonaId(input.conversationId ?? input.context.conversationId),
    ))
  }

  activatePersona(input: { conversationId: string; personaId: string; userId?: string }): PluginPersonaCurrentInfo {
    const persona = this.requirePersona(input.personaId)
    this.runtimeHostConversationRecordService.rememberConversationActivePersona(input.conversationId, persona.id, input.userId)
    return toCurrentPersona({ persona, source: 'conversation' })
  }

  createPersona(input: PluginPersonaUpsertInput): PluginPersonaDetail {
    const personaId = normalizeRequiredText(input.id, 'ID 不能为空')
    const personas = this.listStoredPersonas()
    if (personas.some((persona) => persona.id === personaId)) {throw new BadRequestException(`人设已存在: ${personaId}`)}
    return toPersonaDetail(this.requirePersistedPersona(this.persistPersonas([...personas, createStoredPersona(input, personaId)], personaId), personaId, 'create'))
  }

  updatePersona(personaId: string, patch: PluginPersonaUpdateInput): PluginPersonaDetail {
    const next = updateStoredPersona(this.requirePersona(personaId), patch)
    return toPersonaDetail(this.requirePersistedPersona(this.persistPersonas(
      this.listStoredPersonas().map((persona) => persona.id === personaId ? next : persona),
      next.isDefault ? next.id : undefined,
    ), personaId, 'update'))
  }

  deletePersona(personaId: string): PluginPersonaDeleteResult {
    if (personaId === DEFAULT_PERSONA_ID) {throw new BadRequestException('默认人设不能删除')}
    this.requirePersona(personaId)
    this.persistPersonas(this.listStoredPersonas().filter((persona) => persona.id !== personaId))
    const fallbackPersonaId = this.requireDefaultPersona(this.listStoredPersonas()).id
    let reassignedConversationCount = 0
    for (const conversation of this.runtimeHostConversationRecordService.listConversations() as Array<{ id: string }>) {
      if (this.runtimeHostConversationRecordService.requireConversation(conversation.id).activePersonaId !== personaId) {continue}
      this.runtimeHostConversationRecordService.rememberConversationActivePersona(conversation.id, fallbackPersonaId)
      reassignedConversationCount += 1
    }
    return { deletedPersonaId: personaId, fallbackPersonaId, reassignedConversationCount }
  }

  readPersonaAvatarPath(personaId: string): string {
    this.requirePersona(personaId)
    const avatarPath = this.personaStoreService.readAvatarPath(personaId)
    if (avatarPath) {return avatarPath}
    throw new NotFoundException(`未找到人设头像: ${personaId}`)
  }

  savePersonaAvatar(personaId: string, buffer: Buffer, mimetype: string): void {
    this.requirePersona(personaId);
    this.personaStoreService.writeAvatar(personaId, buffer, mimetype);
  }

  private listStoredPersonas(): StoredPersonaRecord[] { return this.personaStoreService.list() }

  private persistPersonas(personas: StoredPersonaRecord[], preferredDefaultPersonaId?: string): StoredPersonaRecord[] {
    const defaultPersonaId = preferredDefaultPersonaId
      ?? personas.find((persona) => persona.isDefault)?.id
      ?? (personas.some((persona) => persona.id === DEFAULT_PERSONA_ID) ? DEFAULT_PERSONA_ID : personas[0]?.id)
    return this.personaStoreService.replaceAll(personas.sort((left, right) => left.id.localeCompare(right.id)), defaultPersonaId)
  }

  private requirePersona(personaId: string): StoredPersonaRecord {
    const persona = this.personaStoreService.read(personaId)
    if (persona) {return persona}
    throw new NotFoundException(`未找到人设: ${personaId}`)
  }

  private requirePersistedPersona(personas: StoredPersonaRecord[], personaId: string, action: 'create' | 'update'): StoredPersonaRecord {
    const persona = personas.find((entry) => entry.id === personaId)
    if (persona) {return persona}
    throw new NotFoundException(`${action === 'create' ? '创建后' : '更新后'}未找到人设: ${personaId}`)
  }

  private requireDefaultPersona(personas: StoredPersonaRecord[]): StoredPersonaRecord {
    const persona = personas.find((entry) => entry.isDefault) ?? personas.find((entry) => entry.id === DEFAULT_PERSONA_ID)
    if (persona) {return persona}
    throw new NotFoundException('未找到默认人设')
  }

  private readConversationActivePersonaId(conversationId?: string): string | undefined {
    if (!conversationId) {return undefined}
    try {
      return this.runtimeHostConversationRecordService.requireConversation(conversationId).activePersonaId
    } catch {
      return undefined
    }
  }

  private resolvePersonaForContext(contextPersonaId?: string, conversationPersonaId?: string): { persona: StoredPersonaRecord; source: PersonaSource } {
    const contextPersona = contextPersonaId ? this.personaStoreService.read(contextPersonaId) : null
    if (contextPersona) {return { persona: contextPersona, source: contextPersona.id === DEFAULT_PERSONA_ID ? 'default' : 'context' }}
    const conversationPersona = conversationPersonaId ? this.personaStoreService.read(conversationPersonaId) : null
    if (conversationPersona) {return { persona: conversationPersona, source: conversationPersona.id === DEFAULT_PERSONA_ID ? 'default' : 'conversation' }}
    return { persona: this.requireDefaultPersona(this.listStoredPersonas()), source: 'default' }
  }
}

function toCurrentPersona(input: { persona: StoredPersonaRecord; source: PersonaSource }): PluginPersonaCurrentInfo {
  return { ...toPersonaDetail(input.persona), personaId: input.persona.id, source: input.source }
}

function createStoredPersona(input: PluginPersonaUpsertInput, personaId: string): StoredPersonaRecord {
  const timestamp = new Date().toISOString()
  return {
    avatar: null,
    beginDialogs: normalizeDialogEntries(input.beginDialogs),
    createdAt: timestamp,
    customErrorMessage: normalizeNullableText(input.customErrorMessage),
    description: normalizeOptionalText(input.description),
    id: personaId,
    isDefault: input.isDefault === true,
    name: normalizeRequiredText(input.name, '名称不能为空'),
    prompt: normalizeRequiredText(input.prompt, '提示词不能为空'),
    toolNames: normalizeNullableIdList(input.toolNames),
    updatedAt: timestamp,
  }
}

function updateStoredPersona(current: StoredPersonaRecord, patch: PluginPersonaUpdateInput): StoredPersonaRecord {
  return {
    ...current,
    ...(patch.beginDialogs !== undefined ? { beginDialogs: normalizeDialogEntries(patch.beginDialogs) } : {}),
    ...(patch.customErrorMessage !== undefined ? { customErrorMessage: normalizeNullableText(patch.customErrorMessage) } : {}),
    ...(patch.description !== undefined ? { description: normalizeOptionalText(patch.description) } : {}),
    ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
    ...(patch.name !== undefined ? { name: normalizeRequiredText(patch.name, '名称不能为空') } : {}),
    ...(patch.prompt !== undefined ? { prompt: normalizeRequiredText(patch.prompt, '提示词不能为空') } : {}),
    ...(patch.toolNames !== undefined ? { toolNames: normalizeNullableIdList(patch.toolNames) } : {}),
    updatedAt: new Date().toISOString(),
  }
}

function toPersonaSummary(persona: StoredPersonaRecord): PluginPersonaSummary {
  return {
    avatar: persona.avatar ? `/api/personas/${encodeURIComponent(persona.id)}/avatar` : null,
    createdAt: persona.createdAt,
    description: persona.description,
    id: persona.id,
    isDefault: persona.isDefault,
    name: persona.name,
    updatedAt: persona.updatedAt,
  }
}

function toPersonaDetail(persona: StoredPersonaRecord): PluginPersonaDetail {
  return { ...toPersonaSummary(persona), beginDialogs: persona.beginDialogs.map((entry) => ({ ...entry })), customErrorMessage: persona.customErrorMessage, prompt: persona.prompt, toolNames: persona.toolNames ? [...persona.toolNames] : null }
}

function normalizeDialogEntries(value: PluginPersonaDialogEntry[] | undefined): PluginPersonaDialogEntry[] {
  if (!Array.isArray(value)) {return []}
  return value.flatMap((entry) => {
    const content = normalizeOptionalText(entry?.content)
    const role = entry?.role === 'assistant' || entry?.role === 'user' ? entry.role : null
    return content && role ? [{ content, role }] : []
  })
}

function normalizeNullableIdList(value: string[] | null | undefined): string[] | null {
  if (value === undefined || value === null) {return null}
  return [...new Set(value.flatMap((entry) => {
    const normalized = normalizeOptionalText(entry)
    return normalized ? [normalized] : []
  }))]
}

function normalizeNullableText(value: string | null | undefined): string | null {
  return normalizeOptionalText(value) ?? null
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {return undefined}
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeRequiredText(value: unknown, errorMessage: string): string {
  const normalized = normalizeOptionalText(value)
  if (normalized) {return normalized}
  throw new BadRequestException(errorMessage)
}
