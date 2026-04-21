import * as fs from 'node:fs';
import * as path from 'node:path';
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

const SUBAGENT_TYPE_FILE_EXTENSION = '.yaml';

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
    system: [
      '你是一个专注于探索与信息收集的子代理。',
      '优先检索、抓取、整理上下文，不主动修改文件。',
      '如果信息不足，先继续检索，再给出结论。',
    ].join('\n'),
    toolNames: ['webfetch', 'skill'],
  },
];

@Injectable()
export class ProjectSubagentTypeRegistryService {
  private readonly storageRoot: string;
  private types: ProjectSubagentTypeDefinition[];

  constructor(private readonly projectWorktreeRootService: ProjectWorktreeRootService) {
    this.storageRoot = this.resolveSubagentTypeStorageRoot();
    this.types = loadSubagentTypes(this.storageRoot);
  }

  listTypes(): PluginSubagentTypeSummary[] {
    this.types = loadSubagentTypes(this.storageRoot);
    return this.types.map((entry) => ({
      ...(entry.description ? { description: entry.description } : {}),
      id: entry.id,
      name: entry.name,
    }));
  }

  getType(subagentType: string): ProjectSubagentTypeDefinition | null {
    this.types = loadSubagentTypes(this.storageRoot);
    return this.types.find((entry) => entry.id === subagentType) ?? null;
  }

  private resolveSubagentTypeStorageRoot(): string {
    if (process.env.GARLIC_CLAW_SUBAGENT_PATH) {
      return path.resolve(process.env.GARLIC_CLAW_SUBAGENT_PATH);
    }
    return path.join(this.projectWorktreeRootService.resolveRoot(process.cwd()), 'subagent');
  }
}

function loadSubagentTypes(storageRoot: string): ProjectSubagentTypeDefinition[] {
  fs.mkdirSync(storageRoot, { recursive: true });
  seedDefaultSubagentTypes(storageRoot);
  const collected = new Map<string, ProjectSubagentTypeDefinition>();
  for (const entry of fs.readdirSync(storageRoot, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== SUBAGENT_TYPE_FILE_EXTENSION) {
      continue;
    }
    const fileRecord = readStoredSubagentType(path.join(storageRoot, entry.name));
    if (!fileRecord) {
      continue;
    }
    collected.set(fileRecord.id, fileRecord);
  }
  return [...collected.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function seedDefaultSubagentTypes(storageRoot: string): void {
  for (const entry of DEFAULT_SUBAGENT_TYPES) {
    const filePath = readSubagentTypeFilePath(storageRoot, entry.id);
    if (fs.existsSync(filePath)) {
      continue;
    }
    fs.writeFileSync(filePath, readSubagentTypeYaml(entry), 'utf-8');
  }
}

function readStoredSubagentType(filePath: string): ProjectSubagentTypeDefinition | null {
  try {
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8')) as StoredSubagentTypeRecord;
    const fallbackId = decodeURIComponent(path.basename(filePath, SUBAGENT_TYPE_FILE_EXTENSION));
    return normalizeStoredSubagentType(parsed, fallbackId);
  } catch {
    return null;
  }
}

function normalizeStoredSubagentType(
  record: StoredSubagentTypeRecord,
  fallbackId: string,
): ProjectSubagentTypeDefinition | null {
  const id = normalizeOptionalText(record.id) ?? fallbackId;
  if (!id) {
    return null;
  }
  const name = normalizeOptionalText(record.name) ?? id;
  const description = normalizeOptionalText(record.description);
  const providerId = normalizeOptionalText(record.providerId);
  const modelId = normalizeOptionalText(record.modelId);
  const system = normalizeOptionalText(record.system);
  const toolNames = normalizeToolNames(record.toolNames);
  return {
    ...(description ? { description } : {}),
    id,
    ...(modelId ? { modelId } : {}),
    name,
    ...(providerId ? { providerId } : {}),
    ...(system ? { system } : {}),
    ...(toolNames ? { toolNames } : {}),
  };
}

function normalizeToolNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = [...new Set(value.flatMap((entry) => {
    const next = normalizeOptionalText(entry);
    return next ? [next] : [];
  }))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readSubagentTypeFilePath(storageRoot: string, subagentTypeId: string): string {
  return path.join(storageRoot, `${encodeURIComponent(subagentTypeId)}${SUBAGENT_TYPE_FILE_EXTENSION}`);
}

function readSubagentTypeYaml(entry: ProjectSubagentTypeDefinition): string {
  return [
    '# Subagent Type 配置',
    '# 每个类型一个文件；新增文件后，重启服务或再次读取列表即可生效。',
    '# providerId / modelId 留空时，沿用调用方显式指定的模型链。',
    '',
    '# 子代理类型唯一 ID。建议与文件名保持一致。',
    ...formatSubagentTypeField('id', entry.id),
    '',
    '# 显示名称。',
    ...formatSubagentTypeField('name', entry.name),
    '',
    '# 类型简介。没有可写 null。',
    ...formatSubagentTypeField('description', entry.description ?? null),
    '',
    '# 默认 provider / model。没有可写 null。',
    ...formatSubagentTypeField('providerId', entry.providerId ?? null),
    ...formatSubagentTypeField('modelId', entry.modelId ?? null),
    '',
    '# 默认允许的工具列表。null 表示不额外裁剪，[] 表示不开放任何工具。',
    ...formatSubagentTypeField('toolNames', entry.toolNames ?? null),
    '',
    '# 默认系统提示词。推荐用 YAML 多行字符串维护。',
    ...formatSubagentTypeField('system', entry.system ?? null),
    '',
  ].join('\n');
}

function formatSubagentTypeField(fieldName: string, value: unknown): string[] {
  const serialized = YAML.stringify(value).trimEnd();
  if (!serialized) {
    return [`${fieldName}: null`];
  }
  if (!serialized.includes('\n')) {
    return [`${fieldName}: ${serialized}`];
  }
  return [
    `${fieldName}:`,
    ...serialized.split('\n').map((line) => `  ${line}`),
  ];
}
