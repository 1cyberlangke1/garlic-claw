/**
 * skill 来源类型。
 */
export type SkillSourceKind = 'project' | 'user';

/**
 * skill 可声明的工具策略。
 */
export interface SkillToolPolicy {
  /** 显式允许的工具名。 */
  allow: string[];
  /** 显式禁止的工具名。 */
  deny: string[];
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
  /** 工具白名单/黑名单策略。 */
  toolPolicy: SkillToolPolicy;
}

/**
 * skill 详情。
 */
export interface SkillDetail extends SkillSummary {
  /** 完整 markdown 内容。 */
  content: string;
}

/**
 * 会话级已激活 skill 状态。
 */
export interface ConversationSkillState {
  /** 已激活 skill ID。 */
  activeSkillIds: string[];
  /** 已解析到的 skill 摘要。 */
  activeSkills: SkillSummary[];
}

/**
 * 更新会话技能状态时的请求体。
 */
export interface UpdateConversationSkillsPayload {
  /** 要设置的激活 skill ID 列表。 */
  activeSkillIds: string[];
}
