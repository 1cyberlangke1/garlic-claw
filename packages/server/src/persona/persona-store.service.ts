import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PluginPersonaDetail, PluginPersonaDialogEntry } from '@garlic-claw/shared'
import { Injectable } from '@nestjs/common'
import YAML from 'yaml'
import { ProjectWorktreeRootService } from '../execution/project/project-worktree-root.service'
import { DEFAULT_PERSONA_ID } from '../runtime/host/runtime-host-values'
import { DEFAULT_PERSONA_PROMPT } from './default-persona'

export interface StoredPersonaRecord extends PluginPersonaDetail {}
interface StoredPersonaMeta extends Omit<StoredPersonaRecord, 'avatar' | 'prompt'> {}
type PersonaMetaField = keyof StoredPersonaMeta

const DEFAULT_PERSONA_TIMESTAMP = '2026-04-10T00:00:00.000Z'
const PERSONA_META_FILE_NAME = 'meta.yaml'
const PERSONA_PROMPT_FILE_NAME = 'SYSTEM.md'
const LEGACY_PERSONA_META_FILE_NAME = 'meta.json'
const AVATAR_BASENAME = 'avatar'
const AVATAR_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif', '.ico', '.tif', '.tiff'])
const PERSONA_META_LAYOUT: Array<{ comment: string[]; field: PersonaMetaField }> = [
  { comment: ['# Persona 元数据', '# 同目录的 SYSTEM.md 存放系统提示词正文。', '# avatar 不在这里手动配置；如果当前目录存在名为 avatar 的图片文件，例如 avatar.png / avatar.webp / avatar.jpg，服务端会自动识别。', '', '# 人设唯一 ID。建议与目录名保持一致，方便人工检查。'], field: 'id' },
  { comment: ['', '# 人设显示名称。'], field: 'name' },
  { comment: ['', '# 人设简介。没有可写 null。'], field: 'description' },
  { comment: ['', '# 预置对话，按数组顺序注入到主对话模型上下文。', '# 每项格式：', '# - role: user | assistant', '#   content: 对话内容', '# 没有预置对话时写 []。'], field: 'beginDialogs' },
  { comment: ['', '# Persona 允许使用的 tools。', '# null 表示不限制；[] 表示全部禁用；非空数组表示只允许这些 tool 名称。'], field: 'toolNames' },
  { comment: ['', '# 仅在“主对话主回复”失败时，直接回复给用户的固定错误文案。', '# subagent、标题生成、摘要总结等链路不会使用这个字段。', '# 留空或写 null 表示使用系统默认错误文案。'], field: 'customErrorMessage' },
  { comment: ['', '# 是否为默认人设。同一时刻只会有一个默认人设生效。'], field: 'isDefault' },
  { comment: ['', '# 创建时间与更新时间通常由系统维护；手动编辑时建议保持 ISO 时间格式。'], field: 'createdAt' },
  { comment: [], field: 'updatedAt' },
]

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
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `personas.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)}
  return path.join(projectWorktreeRootService.resolveRoot(process.cwd()), 'persona')
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
  const metaPath = resolvePersonaMetaPath(personaRoot)
  if (!fs.existsSync(metaPath)) {return null}
  try {
    const meta = readStoredPersonaMeta(metaPath)
    const promptPath = path.join(personaRoot, PERSONA_PROMPT_FILE_NAME)
    return {
      avatar: readPersonaAvatarFilePath(personaRoot),
      beginDialogs: meta.beginDialogs,
      createdAt: meta.createdAt,
      customErrorMessage: meta.customErrorMessage,
      description: meta.description,
      id: meta.id ?? path.basename(personaRoot),
      isDefault: meta.isDefault,
      name: meta.name,
      prompt: fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf-8').replace(/\r\n/g, '\n') : undefined,
      toolNames: meta.toolNames,
      updatedAt: meta.updatedAt,
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
  fs.writeFileSync(path.join(personaRoot, PERSONA_META_FILE_NAME), readPersonaMetaYaml({
    beginDialogs: persona.beginDialogs,
    createdAt: persona.createdAt,
    customErrorMessage: persona.customErrorMessage,
    description: persona.description,
    id: persona.id,
    isDefault: persona.isDefault,
    name: persona.name,
    toolNames: persona.toolNames,
    updatedAt: persona.updatedAt,
  }), 'utf-8')
  if (fs.existsSync(path.join(personaRoot, LEGACY_PERSONA_META_FILE_NAME))) {fs.rmSync(path.join(personaRoot, LEGACY_PERSONA_META_FILE_NAME), { force: true })}
  fs.writeFileSync(path.join(personaRoot, PERSONA_PROMPT_FILE_NAME), `${persona.prompt.trimEnd()}\n`, 'utf-8')
}

function readPersonaFolderName(personaId: string): string {
  return encodeURIComponent(personaId.trim())
}

function resolvePersonaMetaPath(personaRoot: string): string {
  const yamlPath = path.join(personaRoot, PERSONA_META_FILE_NAME)
  return fs.existsSync(yamlPath) ? yamlPath : path.join(personaRoot, LEGACY_PERSONA_META_FILE_NAME)
}

function readStoredPersonaMeta(metaPath: string): Partial<StoredPersonaMeta> {
  const raw = fs.readFileSync(metaPath, 'utf-8')
  if (path.basename(metaPath) === LEGACY_PERSONA_META_FILE_NAME) {return JSON.parse(raw) as Partial<StoredPersonaMeta>}
  const parsed = YAML.parse(raw)
  return typeof parsed === 'object' && parsed !== null ? parsed as Partial<StoredPersonaMeta> : {}
}

function readPersonaMetaYaml(meta: StoredPersonaMeta): string {
  return [...PERSONA_META_LAYOUT.flatMap(({ comment, field }) => [...comment, ...formatPersonaMetaField(field, meta[field])]), ''].join('\n')
}

function formatPersonaMetaField(fieldName: string, value: unknown): string[] {
  const serialized = YAML.stringify(value).trimEnd()
  if (!serialized) {return [`${fieldName}: null`]}
  if (!serialized.includes('\n')) {return [`${fieldName}: ${serialized}`]}
  return [`${fieldName}:`, ...serialized.split('\n').map((line) => `  ${line}`)]
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
