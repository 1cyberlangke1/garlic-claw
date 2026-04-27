import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PluginPersonaDetail, PluginPersonaDialogEntry } from '@garlic-claw/shared'
import { Injectable } from '@nestjs/common'
import { ProjectWorktreeRootService } from '../execution/project/project-worktree-root.service'
import { createServerTestArtifactPath } from '../runtime/server-workspace-paths'
import { DEFAULT_PERSONA_ID } from '../runtime/host/runtime-host-values'
import { DEFAULT_PERSONA_PROMPT } from './default-persona'

export interface StoredPersonaRecord extends PluginPersonaDetail {}
type StoredPersonaConfigFile = Omit<StoredPersonaRecord, 'avatar' | 'prompt'>

const DEFAULT_PERSONA_TIMESTAMP = '2026-04-10T00:00:00.000Z'
const PERSONA_CONFIG_FILE_NAME = 'persona.json'
const PERSONA_PROMPT_FILE_NAME = 'prompt.md'
const AVATAR_BASENAME = 'avatar'
const AVATAR_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif', '.ico', '.tif', '.tiff'])

@Injectable()
export class PersonaStoreService {
  private readonly storageRoot: string
  private personas: StoredPersonaRecord[]

  constructor(private readonly projectWorktreeRootService: ProjectWorktreeRootService) {
    this.storageRoot = resolvePersonaStorageRoot(this.projectWorktreeRootService)
    this.personas = loadPersonaStore(this.storageRoot)
  }

  list(): StoredPersonaRecord[] { return this.personas.map((persona) => structuredClone(persona)) }
  read(personaId: string): StoredPersonaRecord | null { return clonePersonaRecord(this.personas.find((persona) => persona.id === personaId)) }
  readAvatarPath(personaId: string): string | null { return readPersonaAvatarFilePath(path.join(this.storageRoot, readPersonaFolderName(personaId))) }

  replaceAll(personas: StoredPersonaRecord[]): StoredPersonaRecord[] {
    const nextPersonas = personas.map((persona) => structuredClone(persona))
    persistPersonaStore(this.storageRoot, this.personas, nextPersonas)
    this.personas = nextPersonas
    return this.list()
  }
}

function resolvePersonaStorageRoot(projectWorktreeRootService: ProjectWorktreeRootService): string {
  if (process.env.GARLIC_CLAW_PERSONAS_PATH) {return path.resolve(process.env.GARLIC_CLAW_PERSONAS_PATH)}
  if (process.env.JEST_WORKER_ID) {return createServerTestArtifactPath({ prefix: 'config-personas.server.test', subdirectory: 'server' })}
  return path.join(projectWorktreeRootService.resolveRoot(process.cwd()), 'config', 'personas')
}

function loadPersonaStore(storageRoot: string): StoredPersonaRecord[] {
  const seeded = [createDefaultPersona()]
  try {
    fs.mkdirSync(storageRoot, { recursive: true })
    const loaded = readStoredPersonas(storageRoot)
    const normalized = normalizeStoredPersonas(loaded.length > 0 ? loaded : seeded)
    persistPersonaStore(storageRoot, loaded, normalized)
    return normalized
  } catch {
    persistPersonaStore(storageRoot, [], seeded)
    return seeded
  }
}

function clonePersonaRecord(persona: StoredPersonaRecord | undefined): StoredPersonaRecord | null {
  return persona ? structuredClone(persona) : null
}

function readStoredPersonas(storageRoot: string): StoredPersonaRecord[] {
  if (!fs.existsSync(storageRoot)) {return []}
  return fs.readdirSync(storageRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const persona = readStoredPersona(path.join(storageRoot, entry.name))
    return persona ? [persona] : []
  })
}

function readStoredPersona(personaRoot: string): StoredPersonaRecord | null {
  const configPath = path.join(personaRoot, PERSONA_CONFIG_FILE_NAME)
  if (!fs.existsSync(configPath)) {return null}
  try {
    const config = readStoredPersonaConfig(configPath)
    return {
      avatar: readPersonaAvatarFilePath(personaRoot),
      beginDialogs: config.beginDialogs,
      createdAt: config.createdAt,
      customErrorMessage: config.customErrorMessage,
      description: config.description,
      id: config.id ?? path.basename(personaRoot),
      isDefault: config.isDefault,
      name: config.name,
      prompt: readStoredPersonaPrompt(personaRoot),
      toolNames: config.toolNames,
      updatedAt: config.updatedAt,
    } as StoredPersonaRecord
  } catch {
    return null
  }
}

function persistPersonaStore(storageRoot: string, previousPersonas: readonly StoredPersonaRecord[], nextPersonas: readonly StoredPersonaRecord[]): void {
  fs.mkdirSync(storageRoot, { recursive: true })
  const nextFolderNames = new Set(nextPersonas.map((persona) => readPersonaFolderName(persona.id)))
  for (const folderName of previousPersonas.map((persona) => readPersonaFolderName(persona.id))) {
    if (!nextFolderNames.has(folderName)) {fs.rmSync(path.join(storageRoot, folderName), { force: true, recursive: true })}
  }
  nextPersonas.forEach((persona) => writeStoredPersona(storageRoot, persona))
}

function writeStoredPersona(storageRoot: string, persona: StoredPersonaRecord): void {
  const personaRoot = path.join(storageRoot, readPersonaFolderName(persona.id))
  fs.mkdirSync(personaRoot, { recursive: true })
  const config: StoredPersonaConfigFile = {
    beginDialogs: persona.beginDialogs,
    createdAt: persona.createdAt,
    customErrorMessage: persona.customErrorMessage,
    description: persona.description,
    id: persona.id,
    isDefault: persona.isDefault,
    name: persona.name,
    toolNames: persona.toolNames,
    updatedAt: persona.updatedAt,
  }
  fs.writeFileSync(path.join(personaRoot, PERSONA_CONFIG_FILE_NAME), JSON.stringify(config, null, 2), 'utf-8')
  fs.writeFileSync(path.join(personaRoot, PERSONA_PROMPT_FILE_NAME), persona.prompt.trimEnd(), 'utf-8')
}

function readPersonaFolderName(personaId: string): string {
  return encodeURIComponent(personaId.trim())
}

function readStoredPersonaConfig(configPath: string): Partial<StoredPersonaConfigFile> {
  return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<StoredPersonaConfigFile>
}

function readStoredPersonaPrompt(personaRoot: string): string | undefined {
  const promptPath = path.join(personaRoot, PERSONA_PROMPT_FILE_NAME)
  if (!fs.existsSync(promptPath)) {return undefined}
  return fs.readFileSync(promptPath, 'utf-8')
}

function readPersonaAvatarFilePath(personaRoot: string): string | null {
  if (!fs.existsSync(personaRoot)) {return null}
  const match = fs.readdirSync(personaRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).find((entry) => {
    const extension = path.extname(entry.name).toLowerCase()
    return path.basename(entry.name, extension).toLowerCase() === AVATAR_BASENAME && AVATAR_IMAGE_EXTENSIONS.has(extension)
  })
  return match ? path.join(personaRoot, match.name) : null
}

function normalizeStoredPersonas(rawPersonas: StoredPersonaRecord[]): StoredPersonaRecord[] {
  const personas = rawPersonas.filter((persona): persona is StoredPersonaRecord => Boolean(persona && typeof persona.id === 'string' && persona.id.trim())).map(normalizeStoredPersona)
  if (!personas.some((persona) => persona.id === DEFAULT_PERSONA_ID)) {personas.unshift(createDefaultPersona())}
  const defaultPersonaId = personas.find((persona) => persona.isDefault)?.id ?? DEFAULT_PERSONA_ID
  return personas.map((persona) => ({ ...persona, isDefault: persona.id === defaultPersonaId })).sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeStoredPersona(persona: StoredPersonaRecord): StoredPersonaRecord {
  const fallback = createDefaultPersona()
  return {
    avatar: normalizeNullableText(persona.avatar),
    beginDialogs: normalizeDialogEntries(persona.beginDialogs),
    createdAt: typeof persona.createdAt === 'string' && persona.createdAt ? persona.createdAt : fallback.createdAt,
    customErrorMessage: normalizeNullableText(persona.customErrorMessage),
    description: normalizeOptionalText(persona.description),
    id: persona.id.trim(),
    isDefault: persona.isDefault === true,
    name: normalizeRequiredText(persona.name, persona.id),
    prompt: normalizeRequiredText(persona.prompt, fallback.prompt),
    toolNames: normalizeNullableIdList(persona.toolNames),
    updatedAt: typeof persona.updatedAt === 'string' && persona.updatedAt ? persona.updatedAt : fallback.updatedAt,
  }
}

function createDefaultPersona(): StoredPersonaRecord {
  return {
    avatar: null,
    beginDialogs: [],
    createdAt: DEFAULT_PERSONA_TIMESTAMP,
    customErrorMessage: null,
    description: 'server 默认人格',
    id: DEFAULT_PERSONA_ID,
    isDefault: true,
    name: 'Default Assistant',
    prompt: DEFAULT_PERSONA_PROMPT,
    toolNames: null,
    updatedAt: DEFAULT_PERSONA_TIMESTAMP,
  }
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

function normalizeRequiredText(value: unknown, fallback: string): string {
  return normalizeOptionalText(value) ?? fallback
}
