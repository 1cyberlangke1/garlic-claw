import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { EventLogListResult, EventLogQuery, SkillAssetKind, SkillAssetSummary, SkillDetail, SkillGovernanceInfo, SkillSummary, UpdateSkillGovernancePayload } from '@garlic-claw/shared';
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import YAML from 'yaml';
import { RuntimeEventLogService, normalizeEventLogSettings } from '../../runtime/log/runtime-event-log.service';
import { resolveProjectWorkspaceRoot } from '../../runtime/host/project-workspace-root';

interface SkillGovernanceFile {
  skills: Record<string, SkillGovernanceInfo>;
}

export const SKILL_DISCOVERY_OPTIONS = 'SKILL_DISCOVERY_OPTIONS';
export interface SkillDiscoveryOptions {
  skillsRoot?: string;
}

const DEFAULT_SKILL_GOVERNANCE: SkillGovernanceInfo = {
  eventLog: {
    maxFileSizeMb: 1,
  },
  loadPolicy: 'allow',
};

@Injectable()
export class SkillRegistryService {
  private cachedSkills: SkillDetail[] | null = null;
  private readonly governancePath = resolveSkillGovernancePath();
  private governance = readSkillGovernanceFile(this.governancePath);

  constructor(
    @Optional() @Inject(SKILL_DISCOVERY_OPTIONS) private readonly discoveryOptions: SkillDiscoveryOptions = {},
    @Optional() private readonly runtimeEventLogService?: RuntimeEventLogService,
  ) {}

  async listSkills(options?: { refresh?: boolean }): Promise<SkillDetail[]> {
    if (!options?.refresh && this.cachedSkills) {
      return this.cachedSkills;
    }

    this.cachedSkills = (await Promise.all([
      readSkillSource('project', this.discoveryOptions.skillsRoot ?? resolveProjectSkillsRoot()),
    ]))
      .flat()
      .map((skill) => ({
        ...skill,
        governance: this.governance.skills[skill.id] ?? DEFAULT_SKILL_GOVERNANCE,
      }))
      .sort((left, right) => {
        const nameOrder = left.name.localeCompare(right.name);
        return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
      });

    return this.cachedSkills;
  }

  async getSkillByName(skillName: string): Promise<SkillDetail | null> {
    const normalized = skillName.trim();
    if (!normalized) {return null;}
    const skills = await this.listSkills();
    return skills.find((entry) => entry.name === normalized) ?? null;
  }

  async listSkillSummaries(options?: { refresh?: boolean }): Promise<SkillSummary[]> {
    return (await this.listSkills(options)).map(({ content: _content, assets: _assets, ...summary }) => summary);
  }

  resolveSkillDirectory(skill: Pick<SkillDetail, 'entryPath' | 'sourceKind'>): string {
    const sourceRoot = this.discoveryOptions.skillsRoot ?? resolveProjectSkillsRoot();
    return path.join(sourceRoot, path.dirname(skill.entryPath));
  }

  async listSkillEvents(skillId: string, query: EventLogQuery = {}): Promise<EventLogListResult> {
    const skill = (await this.listSkills()).find((entry) => entry.id === skillId);
    if (!skill) {throw new NotFoundException(`Unknown skill: ${skillId}`);}
    return this.getRuntimeEventLogService().listLogs('skill', skillId, query);
  }

  async updateSkillGovernance(skillId: string, patch: UpdateSkillGovernancePayload): Promise<SkillDetail> {
    const skill = (await this.listSkills()).find((entry) => entry.id === skillId);
    if (!skill) {throw new NotFoundException(`Unknown skill: ${skillId}`);}
    const nextGovernance: SkillGovernanceInfo = {
      eventLog: normalizeEventLogSettings(patch.eventLog ?? skill.governance.eventLog),
      loadPolicy: patch.loadPolicy ?? skill.governance.loadPolicy,
    };
    this.governance.skills[skillId] = nextGovernance;
    writeSkillGovernanceFile(this.governancePath, this.governance);
    this.cachedSkills = null;
    this.getRuntimeEventLogService().appendLog('skill', skillId, nextGovernance.eventLog, {
      level: 'info',
      message: `Updated skill governance for ${skill.name}`,
      metadata: {
        loadPolicy: nextGovernance.loadPolicy,
        maxFileSizeMb: nextGovernance.eventLog.maxFileSizeMb,
      },
      type: 'governance:updated',
    });
    return { ...skill, governance: nextGovernance };
  }

  private getRuntimeEventLogService(): RuntimeEventLogService {
    return this.runtimeEventLogService ?? new RuntimeEventLogService();
  }
}

function resolveProjectSkillsRoot(): string {
  return path.join(resolveProjectWorkspaceRoot(process.cwd()), 'skills');
}

function resolveSkillGovernancePath(): string {
  if (process.env.GARLIC_CLAW_SKILL_GOVERNANCE_PATH) {
    return path.resolve(process.env.GARLIC_CLAW_SKILL_GOVERNANCE_PATH);
  }
  if (process.env.JEST_WORKER_ID) {
    return path.join(process.cwd(), 'tmp', `skill-governance.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  }
  return path.join(process.cwd(), 'tmp', 'skill-governance.server.json');
}

function readSkillGovernanceFile(filePath: string): SkillGovernanceFile {
  try {
    if (!fs.existsSync(filePath)) {return { skills: {} };}
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SkillGovernanceFile;
    if (!parsed || typeof parsed !== 'object' || !parsed.skills) {
      return { skills: {} };
    }
    return {
      skills: Object.fromEntries(
        Object.entries(parsed.skills).map(([skillId, governance]) => [
          skillId,
          {
            eventLog: normalizeEventLogSettings(governance?.eventLog),
            loadPolicy: governance?.loadPolicy ?? DEFAULT_SKILL_GOVERNANCE.loadPolicy,
          } satisfies SkillGovernanceInfo,
        ]),
      ),
    };
  } catch {
    return { skills: {} };
  }
}

function writeSkillGovernanceFile(filePath: string, data: SkillGovernanceFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readSkillSource(
  kind: SkillDetail['sourceKind'],
  root: string,
): Promise<SkillDetail[]> {
  const filePaths = await walkFiles(root);
  return Promise.all(filePaths.filter((filePath) => path.basename(filePath) === 'SKILL.md').map((filePath) => buildSkillDetail(kind, root, filePath, filePaths)));
}

async function buildSkillDetail(
  kind: SkillDetail['sourceKind'],
  root: string,
  filePath: string,
  sourceFiles: string[],
): Promise<SkillDetail> {
  const entryPath = path.relative(root, filePath).split(path.sep).join('/');
  const skillPath = entryPath.replace(/\/SKILL\.md$/i, '');
  const parsed = await parseSkillFile(filePath);
  const name = typeof parsed.frontmatter.name === 'string' ? parsed.frontmatter.name.trim() : '';

  return {
    id: `${kind}/${skillPath || 'root'}`,
    name: name || (skillPath.split('/').at(-1) ?? 'root').replace(/[-_]+/g, ' ').trim(),
    description: typeof parsed.frontmatter.description === 'string'
      ? parsed.frontmatter.description.trim()
      : '',
    tags: normalizeStringList(parsed.frontmatter.tags),
    sourceKind: kind,
    entryPath,
    promptPreview: parsed.content.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 160),
    governance: DEFAULT_SKILL_GOVERNANCE,
    assets: sourceFiles
      .filter((candidate) => candidate.startsWith(`${path.dirname(filePath)}${path.sep}`) && path.basename(candidate) !== 'SKILL.md')
      .map((candidate) => {
        const extension = path.extname(candidate).toLowerCase();
        return {
          path: path.relative(path.dirname(filePath), candidate).split(path.sep).join('/'),
          kind: readAssetKind(extension),
          textReadable: isTextReadable(extension),
          executable: isExecutable(extension),
        } satisfies SkillAssetSummary;
      }),
    content: parsed.content,
  };
}

async function parseSkillFile(filePath: string): Promise<{
  frontmatter: Record<string, unknown>;
  content: string;
}> {
  const normalized = (await fsPromises.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
  const fallback = { frontmatter: {}, content: normalized.trim() };
  if (!normalized.startsWith('---\n')) {return fallback;}
  const frontmatterEnd = normalized.indexOf('\n---\n', 4);
  if (frontmatterEnd === -1) {return fallback;}

  try {
    return {
      frontmatter: readUnknownObject(YAML.parse(normalized.slice(4, frontmatterEnd))) ?? {},
      content: normalized.slice(frontmatterEnd + '\n---\n'.length).trim(),
    };
  } catch {
    return fallback;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) {return [];}
  const entries = await fsPromises.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {files.push(...await walkFiles(absolutePath));} else {files.push(absolutePath);}
  }
  return files;
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function readAssetKind(extension: string): SkillAssetKind {
  if (isExecutable(extension)) {
    return 'script';
  }
  if (extension === '.md') {
    return 'reference';
  }
  if (['.json', '.yaml', '.yml', '.toml'].includes(extension)) {
    return 'template';
  }
  return isTextReadable(extension) ? 'asset' : 'other';
}

function isExecutable(extension: string): boolean {
  return ['.ps1', '.sh', '.bat', '.cmd', '.py', '.js', '.mjs', '.cjs'].includes(extension);
}

function isTextReadable(extension: string): boolean {
  return ['.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.ini', '.csv', '.svg', '.xml', '.html', '.css', '.js', '.mjs', '.cjs', '.ts', '.py', '.ps1', '.sh', '.bat', '.cmd'].includes(extension);
}

function readUnknownObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
