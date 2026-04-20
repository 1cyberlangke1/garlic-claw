import type { EventLogSettings } from './plugin-records';

/**
 * skill 来源类型。
 */
export type SkillSourceKind = 'project';

export type SkillLoadPolicy = 'allow' | 'ask' | 'deny';

export type SkillAssetKind = 'script' | 'template' | 'reference' | 'asset' | 'other';

export interface SkillGovernanceInfo {
  loadPolicy: SkillLoadPolicy;
  eventLog: EventLogSettings;
}

export interface SkillAssetSummary {
  path: string;
  kind: SkillAssetKind;
  textReadable: boolean;
  executable: boolean;
}

/**
 * skill 摘要。
 */
export interface SkillSummary {
  /** 稳定 skill ID。 */
  id: string;
  /** 展示名称。 */
  name: string;
  /** 简短说明。 */
  description: string;
  /** 标签。 */
  tags: string[];
  /** 来源类型。 */
  sourceKind: SkillSourceKind;
  /** 相对入口路径。 */
  entryPath: string;
  /** 内容预览。 */
  promptPreview: string;
  /** 全局治理信息。 */
  governance: SkillGovernanceInfo;
}

/**
 * skill 详情。
 */
export interface SkillDetail extends SkillSummary {
  /** 完整 markdown 内容。 */
  content: string;
  /** 目录资产列表。 */
  assets: SkillAssetSummary[];
}

export interface SkillLoadResult {
  id: string;
  name: string;
  description: string;
  content: string;
  entryPath: string;
  baseDirectory: string;
  files: SkillAssetSummary[];
  modelOutput: string;
}

export interface UpdateSkillGovernancePayload {
  loadPolicy?: SkillLoadPolicy;
  eventLog?: EventLogSettings;
}
