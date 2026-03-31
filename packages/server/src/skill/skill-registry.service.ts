import type { SkillDetail, SkillSummary } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { SkillDiscoveryService } from './skill-discovery.service';

@Injectable()
export class SkillRegistryService {
  private cachedSkills: SkillDetail[] | null = null;

  constructor(
    private readonly discovery: SkillDiscoveryService,
  ) {}

  async listSkills(options?: { refresh?: boolean }): Promise<SkillDetail[]> {
    if (options?.refresh || this.cachedSkills === null) {
      this.cachedSkills = await this.discovery.discoverSkills();
    }

    return this.cachedSkills.map(cloneSkillDetail);
  }

  async refreshSkills(): Promise<SkillDetail[]> {
    return this.listSkills({ refresh: true });
  }

  async listSkillSummaries(options?: { refresh?: boolean }): Promise<SkillSummary[]> {
    const skills = await this.listSkills(options);
    return skills.map(toSkillSummary);
  }
}

export function toSkillSummary(skill: SkillDetail): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: [...skill.tags],
    sourceKind: skill.sourceKind,
    entryPath: skill.entryPath,
    promptPreview: skill.promptPreview,
    toolPolicy: {
      allow: [...skill.toolPolicy.allow],
      deny: [...skill.toolPolicy.deny],
    },
  };
}

function cloneSkillDetail(skill: SkillDetail): SkillDetail {
  return {
    ...toSkillSummary(skill),
    content: skill.content,
  };
}
