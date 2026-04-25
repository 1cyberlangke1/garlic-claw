import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { EventLogListResult, EventLogQuery, SkillAssetKind, SkillDetail, SkillGovernanceInfo, SkillSummary, UpdateSkillGovernancePayload } from '@garlic-claw/shared';
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import YAML from 'yaml';
import { RuntimeEventLogService, normalizeEventLogSettings } from '../../runtime/log/runtime-event-log.service';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';

interface SkillGovernanceFile { skills: Record<string, SkillGovernanceInfo>; }
export const SKILL_DISCOVERY_OPTIONS = 'SKILL_DISCOVERY_OPTIONS';
export interface SkillDiscoveryOptions { skillsRoot?: string; }

const DEFAULT_SKILL_GOVERNANCE: SkillGovernanceInfo = { eventLog: { maxFileSizeMb: 1 }, loadPolicy: 'allow' };

@Injectable()
export class SkillRegistryService {
  private cachedSkills: SkillDetail[] | null = null;
  private readonly governancePath = resolveSkillGovernancePath();
  private governance = readSkillGovernanceFile(this.governancePath);

  constructor(@Optional() @Inject(SKILL_DISCOVERY_OPTIONS) private readonly discoveryOptions: SkillDiscoveryOptions = {}, private readonly projectWorktreeRootService: ProjectWorktreeRootService, @Optional() private readonly runtimeEventLogService?: RuntimeEventLogService) {}

  async listSkills(options?: { refresh?: boolean }): Promise<SkillDetail[]> {
    if (!options?.refresh && this.cachedSkills) {return this.cachedSkills;}
    const root = this.discoveryOptions.skillsRoot ?? path.join(this.projectWorktreeRootService.resolveRoot(process.cwd()), 'skills');
    const files = await walkSkillFiles(root);
    this.cachedSkills = (await Promise.all(files.filter((filePath) => path.basename(filePath) === 'SKILL.md').map((filePath) => buildSkillDetail(root, filePath, files))))
      .map((skill) => ({ ...skill, governance: this.governance.skills[skill.id] ?? DEFAULT_SKILL_GOVERNANCE }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    return this.cachedSkills;
  }

  async getSkillByName(skillName: string): Promise<SkillDetail | null> { const normalized = skillName.trim(); return normalized ? (await this.listSkills()).find((entry) => entry.name === normalized) ?? null : null; }
  async listSkillSummaries(options?: { refresh?: boolean }): Promise<SkillSummary[]> { return (await this.listSkills(options)).map(({ assets: _assets, content: _content, ...summary }) => summary); }
  resolveSkillDirectory(skill: Pick<SkillDetail, 'entryPath' | 'sourceKind'>): string { return path.join(this.discoveryOptions.skillsRoot ?? path.join(this.projectWorktreeRootService.resolveRoot(process.cwd()), 'skills'), path.dirname(skill.entryPath)); }

  async listSkillEvents(skillId: string, query: EventLogQuery = {}): Promise<EventLogListResult> {
    if (!(await this.listSkills()).some((entry) => entry.id === skillId)) {throw new NotFoundException(`Unknown skill: ${skillId}`);}
    return this.getRuntimeEventLogService().listLogs('skill', skillId, query);
  }

  async updateSkillGovernance(skillId: string, patch: UpdateSkillGovernancePayload): Promise<SkillDetail> {
    const skill = (await this.listSkills()).find((entry) => entry.id === skillId);
    if (!skill) {throw new NotFoundException(`Unknown skill: ${skillId}`);}
    const governance: SkillGovernanceInfo = { eventLog: normalizeEventLogSettings(patch.eventLog ?? skill.governance.eventLog), loadPolicy: patch.loadPolicy ?? skill.governance.loadPolicy };
    this.governance.skills[skillId] = governance;
    fs.mkdirSync(path.dirname(this.governancePath), { recursive: true });
    fs.writeFileSync(this.governancePath, JSON.stringify(this.governance, null, 2), 'utf8');
    this.cachedSkills = null;
    this.getRuntimeEventLogService().appendLog('skill', skillId, governance.eventLog, { level: 'info', message: `Updated skill governance for ${skill.name}`, metadata: { loadPolicy: governance.loadPolicy, maxFileSizeMb: governance.eventLog.maxFileSizeMb }, type: 'governance:updated' });
    return { ...skill, governance };
  }

  private getRuntimeEventLogService(): RuntimeEventLogService { return this.runtimeEventLogService ?? new RuntimeEventLogService(); }
}

function resolveSkillGovernancePath(): string {
  if (process.env.GARLIC_CLAW_SKILL_GOVERNANCE_PATH) {return path.resolve(process.env.GARLIC_CLAW_SKILL_GOVERNANCE_PATH);}
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `skill-governance.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);}
  return path.join(process.cwd(), 'tmp', 'skill-governance.server.json');
}

function readSkillGovernanceFile(filePath: string): SkillGovernanceFile {
  try {
    const parsed = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<SkillGovernanceFile> : { skills: {} };
    return { skills: Object.fromEntries(Object.entries(parsed.skills ?? {}).map(([skillId, governance]) => [skillId, { eventLog: normalizeEventLogSettings(governance?.eventLog), loadPolicy: governance?.loadPolicy ?? DEFAULT_SKILL_GOVERNANCE.loadPolicy } satisfies SkillGovernanceInfo])) };
  } catch {
    return { skills: {} };
  }
}

async function walkSkillFiles(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) {return [];}
  return (await Promise.all((await fsPromises.readdir(root, { withFileTypes: true })).map(async (entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? walkSkillFiles(filePath) : [filePath];
  }))).flat();
}

async function buildSkillDetail(root: string, filePath: string, sourceFiles: string[]): Promise<SkillDetail> {
  const entryPath = path.relative(root, filePath).split(path.sep).join('/'), skillPath = entryPath.replace(/\/SKILL\.md$/i, ''), parsed = await parseSkillFile(filePath);
  return {
    assets: sourceFiles.filter((candidate) => candidate.startsWith(`${path.dirname(filePath)}${path.sep}`) && path.basename(candidate) !== 'SKILL.md').map((candidate) => ({ executable: isExecutableAsset(path.extname(candidate).toLowerCase()), kind: readSkillAssetKind(path.extname(candidate).toLowerCase()), path: path.relative(path.dirname(filePath), candidate).split(path.sep).join('/'), textReadable: isTextReadableAsset(path.extname(candidate).toLowerCase()) })),
    content: parsed.content,
    description: typeof parsed.frontmatter.description === 'string' ? parsed.frontmatter.description.trim() : '',
    entryPath,
    governance: DEFAULT_SKILL_GOVERNANCE,
    id: `project/${skillPath || 'root'}`,
    name: typeof parsed.frontmatter.name === 'string' && parsed.frontmatter.name.trim().length > 0 ? parsed.frontmatter.name.trim() : (skillPath.split('/').at(-1) ?? 'root').replace(/[-_]+/g, ' ').trim(),
    promptPreview: parsed.content.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 160),
    sourceKind: 'project',
    tags: Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [],
  };
}

async function parseSkillFile(filePath: string): Promise<{ frontmatter: Record<string, unknown>; content: string }> {
  const normalized = (await fsPromises.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {return { frontmatter: {}, content: normalized.trim() };}
  const frontmatterEnd = normalized.indexOf('\n---\n', 4);
  if (frontmatterEnd === -1) {return { frontmatter: {}, content: normalized.trim() };}
  try {
    const frontmatter = YAML.parse(normalized.slice(4, frontmatterEnd));
    return { frontmatter: typeof frontmatter === 'object' && frontmatter !== null && !Array.isArray(frontmatter) ? frontmatter as Record<string, unknown> : {}, content: normalized.slice(frontmatterEnd + '\n---\n'.length).trim() };
  } catch {
    return { frontmatter: {}, content: normalized.trim() };
  }
}

function readSkillAssetKind(extension: string): SkillAssetKind { if (isExecutableAsset(extension)) {return 'script';} if (extension === '.md') {return 'reference';} if (['.json', '.yaml', '.yml', '.toml'].includes(extension)) {return 'template';} return isTextReadableAsset(extension) ? 'asset' : 'other'; }
function isExecutableAsset(extension: string): boolean { return ['.ps1', '.sh', '.bat', '.cmd', '.py', '.js', '.mjs', '.cjs'].includes(extension); }
function isTextReadableAsset(extension: string): boolean { return ['.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.ini', '.csv', '.svg', '.xml', '.html', '.css', '.js', '.mjs', '.cjs', '.ts', '.py', '.ps1', '.sh', '.bat', '.cmd'].includes(extension); }
