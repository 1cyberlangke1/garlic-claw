import fs from 'node:fs';
import path from 'node:path';
import type { PluginSubagentTypeSummary } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import YAML from 'yaml';
import { ProjectWorktreeRootService } from './project-worktree-root.service';

export interface ProjectSubagentTypeDefinition {
  id: string;
  name: string;
  description?: string;
  modelId?: string;
  providerId?: string;
  system?: string;
  toolNames?: string[];
}

type StoredSubagentTypeRecord = Partial<ProjectSubagentTypeDefinition>;

const DEFAULT_SUBAGENT_TYPES: ProjectSubagentTypeDefinition[] = [
  {
    id: 'general',
    name: '通用',
    description: '默认子代理类型。沿用当前请求显式指定的模型与系统提示词，不额外裁剪工具。',
  },
  {
    id: 'explore',
    name: '探索',
    description: '偏向资料探索与技能加载。默认开放 webfetch 与 skill，并附带探索导向提示词。',
    system: ['你是一个专注于探索与信息收集的子代理。', '优先检索、抓取、整理上下文，不主动修改文件。', '如果信息不足，先继续检索，再给出结论。'].join('\n'),
    toolNames: ['webfetch', 'skill'],
  },
];

@Injectable()
export class ProjectSubagentTypeRegistryService {
  private readonly storageRoot: string;

  constructor(projectWorktreeRootService: ProjectWorktreeRootService) {
    this.storageRoot = process.env.GARLIC_CLAW_SUBAGENT_PATH
      ? path.resolve(process.env.GARLIC_CLAW_SUBAGENT_PATH)
      : path.join(projectWorktreeRootService.resolveRoot(process.cwd()), 'subagent');
  }

  listTypes(): PluginSubagentTypeSummary[] {
    return loadProjectSubagentTypes(this.storageRoot).map(({ description, id, name }) => ({ ...(description ? { description } : {}), id, name }));
  }

  getType(subagentType: string): ProjectSubagentTypeDefinition | null {
    return loadProjectSubagentTypes(this.storageRoot).find((entry) => entry.id === subagentType) ?? null;
  }
}

function loadProjectSubagentTypes(storageRoot: string): ProjectSubagentTypeDefinition[] {
  fs.mkdirSync(storageRoot, { recursive: true });
  for (const entry of DEFAULT_SUBAGENT_TYPES) {
    const filePath = path.join(storageRoot, `${encodeURIComponent(entry.id)}.yaml`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, YAML.stringify(entry), 'utf-8');
    }
  }
  return fs.readdirSync(storageRoot, { withFileTypes: true })
    .flatMap((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.yaml'
      ? [readStoredProjectSubagentType(path.join(storageRoot, entry.name))]
      : [])
    .filter((entry): entry is ProjectSubagentTypeDefinition => Boolean(entry))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readStoredProjectSubagentType(filePath: string): ProjectSubagentTypeDefinition | null {
  try {
    const fallbackId = decodeURIComponent(path.basename(filePath, '.yaml'));
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8')) as StoredSubagentTypeRecord;
    return normalizeStoredProjectSubagentType(parsed, fallbackId);
  } catch {
    return null;
  }
}

function normalizeStoredProjectSubagentType(
  record: StoredSubagentTypeRecord,
  fallbackId: string,
): ProjectSubagentTypeDefinition | null {
  const id = normalizeOptionalText(record.id) ?? fallbackId;
  if (!id) {
    return null;
  }
  const toolNames = Array.isArray(record.toolNames)
    ? [...new Set(record.toolNames.flatMap((entry) => {
        const toolName = normalizeOptionalText(entry);
        return toolName ? [toolName] : [];
      }))]
    : undefined;
  return {
    ...(normalizeOptionalText(record.description) ? { description: normalizeOptionalText(record.description) } : {}),
    id,
    ...(normalizeOptionalText(record.modelId) ? { modelId: normalizeOptionalText(record.modelId) } : {}),
    name: normalizeOptionalText(record.name) ?? id,
    ...(normalizeOptionalText(record.providerId) ? { providerId: normalizeOptionalText(record.providerId) } : {}),
    ...(normalizeOptionalText(record.system) ? { system: normalizeOptionalText(record.system) } : {}),
    ...(toolNames && toolNames.length > 0 ? { toolNames } : {}),
  };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
