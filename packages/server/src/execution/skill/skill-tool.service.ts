import type {
  PluginParamSchema,
  SkillAssetSummary,
  SkillLoadPolicy,
  SkillLoadResult,
  SkillSummary,
} from '@garlic-claw/shared';
import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { RuntimeEventLogService } from '../../runtime/log/runtime-event-log.service';
import { SkillRegistryService } from './skill-registry.service';

const MODEL_OUTPUT_FILE_LIMIT = 10;
const SKILL_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  name: {
    description: 'The name of the skill from available_skills.',
    required: true,
    type: 'string',
  },
};

@Injectable()
export class SkillToolService {
  constructor(
    private readonly skillRegistryService: SkillRegistryService,
    @Optional() private readonly runtimeEventLogService?: RuntimeEventLogService,
  ) {}

  async listAvailableSkills(): Promise<SkillSummary[]> {
    return (await this.skillRegistryService.listSkillSummaries()).filter((skill) => skill.governance.loadPolicy === 'allow');
  }

  buildToolDescription(skills: SkillSummary[]): string {
    return skills.length === 0
      ? 'Load a specialized skill that provides domain-specific instructions and workflows. No skills are currently available.'
      : [
          'Load a specialized skill that provides domain-specific instructions and workflows.',
          '',
          'When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.',
          '',
          'The skill injects the full skill content, base directory, and sampled file list into the current conversation.',
          '',
          'Tool output includes a `<skill_content name="...">` block with the loaded content.',
          '',
          '<available_skills>',
          ...skills.map((skill) => ['  <skill>', `    <name>${escapeXml(skill.name)}</name>`, `    <description>${escapeXml(skill.description)}</description>`, `    <location>${escapeXml(`config/skills/definitions/${skill.entryPath}`)}</location>`, '  </skill>'].join('\n')),
          '</available_skills>',
        ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return SKILL_TOOL_PARAMETERS;
  }

  toModelOutput(result: SkillLoadResult): { type: 'text'; value: string } {
    return { type: 'text', value: result.modelOutput };
  }

  async loadSkill(skillName: string): Promise<SkillLoadResult> {
    const skill = await this.skillRegistryService.getSkillByName(skillName);
    if (!skill) {
      throw new NotFoundException(`Unknown skill: ${skillName}`);
    }
    if (skill.governance.loadPolicy !== 'allow') {
      const message = readBlockedSkillMessage(skill.governance.loadPolicy, skill.name);
      this.runtimeEventLogService?.appendLog('skill', skill.id, skill.governance.eventLog, {
        level: 'warn',
        message,
        metadata: { skillName },
        type: 'skill:load-blocked',
      });
      throw new ForbiddenException(message);
    }
    this.runtimeEventLogService?.appendLog('skill', skill.id, skill.governance.eventLog, {
      level: 'info',
      message: `Loaded skill ${skill.name}`,
      metadata: { entryPath: skill.entryPath },
      type: 'skill:loaded',
    });
    const files = skill.assets.map(copySkillAssetSummary);
    const baseDirectory = this.skillRegistryService.resolveSkillDirectory(skill);
    return {
      baseDirectory,
      content: skill.content,
      description: skill.description,
      entryPath: skill.entryPath,
      files,
      id: skill.id,
      modelOutput: renderSkillModelOutput({ ...skill, baseDirectory, files }),
      name: skill.name,
    };
  }
}

function renderSkillModelOutput(input: Omit<SkillLoadResult, 'modelOutput'>): string {
  const sampled = input.files.slice(0, MODEL_OUTPUT_FILE_LIMIT);
  return [
    `<skill_content name="${escapeXml(input.name)}">`,
    `# Skill: ${input.name}`,
    '',
    input.content.trim(),
    '',
    `Base directory for this skill: ${input.baseDirectory}`,
    `Entry file: ${input.entryPath}`,
    'Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.',
    sampled.length < input.files.length ? `Note: file list is sampled (${sampled.length}/${input.files.length}).` : 'Note: file list is sampled.',
    '',
    '<skill_files>',
    ...sampled.map((file) => `<file>${escapeXml(file.path)}</file>`),
    '</skill_files>',
    '</skill_content>',
  ].join('\n');
}

function readBlockedSkillMessage(loadPolicy: SkillLoadPolicy, skillName: string): string {
  return loadPolicy === 'ask'
    ? `Skill "${skillName}" requires host confirmation and is not available for automatic loading`
    : `Skill "${skillName}" is denied by governance policy`;
}

function copySkillAssetSummary(asset: SkillAssetSummary): SkillAssetSummary {
  return {
    executable: asset.executable,
    kind: asset.kind,
    path: asset.path,
    textReadable: asset.textReadable,
  };
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}
