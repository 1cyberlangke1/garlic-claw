import type {
  ConversationSkillState,
  SkillDetail,
  SkillSummary,
} from '@garlic-claw/shared';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillRegistryService } from './skill-registry.service';

interface ConversationSkillContext {
  activeSkills: SkillDetail[];
  systemPrompt: string;
  allowedToolNames: string[] | null;
  deniedToolNames: string[];
}

@Injectable()
export class SkillSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async getConversationSkillStateForUser(
    userId: string,
    conversationId: string,
  ): Promise<ConversationSkillState> {
    const conversation = await this.getOwnedConversationRecord(userId, conversationId);
    return this.resolveConversationState(conversation.id, conversation.skillsJson, {
      persistCleanup: true,
    });
  }

  async updateConversationSkillStateForUser(
    userId: string,
    conversationId: string,
    activeSkillIds: string[],
  ): Promise<ConversationSkillState> {
    const conversation = await this.getOwnedConversationRecord(userId, conversationId);
    const skillSummaries = await this.skillRegistry.listSkillSummaries();
    const availableIds = new Set(skillSummaries.map((skill) => skill.id));
    const normalizedIds = normalizeSkillIds(activeSkillIds);
    const missingIds = normalizedIds.filter((id) => !availableIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException(`Unknown skills: ${missingIds.join(', ')}`);
    }

    await this.persistConversationSkills(conversation.id, normalizedIds);
    return buildConversationSkillState(
      normalizedIds,
      skillSummaries.filter((skill) => normalizedIds.includes(skill.id)),
    );
  }

  async getConversationSkillContext(conversationId: string): Promise<ConversationSkillContext> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        skillsJson: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skills = await this.skillRegistry.listSkills();
    const normalizedIds = normalizeSkillIds(parseSkillIds(conversation.skillsJson))
      .filter((id) => skills.some((skill) => skill.id === id));
    const activeSkills = skills.filter((skill) => normalizedIds.includes(skill.id));
    const allowedToolNames = collectAllowedToolNames(activeSkills);
    const deniedToolNames = collectDeniedToolNames(activeSkills);

    return {
      activeSkills,
      systemPrompt: buildConversationSkillPrompt(activeSkills),
      allowedToolNames,
      deniedToolNames,
    };
  }

  private async getOwnedConversationRecord(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        userId: true,
        skillsJson: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    return conversation;
  }

  private async resolveConversationState(
    conversationId: string,
    rawSkillIds: string | null,
    options?: { persistCleanup?: boolean },
  ): Promise<ConversationSkillState> {
    const skillSummaries = await this.skillRegistry.listSkillSummaries();
    const availableIds = new Set(skillSummaries.map((skill) => skill.id));
    const parsedIds = parseSkillIds(rawSkillIds);
    const normalizedIds = normalizeSkillIds(parsedIds)
      .filter((id) => availableIds.has(id));

    if (
      options?.persistCleanup &&
      JSON.stringify(parsedIds) !== JSON.stringify(normalizedIds)
    ) {
      await this.persistConversationSkills(conversationId, normalizedIds);
    }

    return buildConversationSkillState(
      normalizedIds,
      skillSummaries.filter((skill) => normalizedIds.includes(skill.id)),
    );
  }

  private async persistConversationSkills(
    conversationId: string,
    activeSkillIds: string[],
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        skillsJson: JSON.stringify(activeSkillIds),
      },
    });
  }
}

function parseSkillIds(rawSkillIds: string | null): string[] {
  if (!rawSkillIds) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawSkillIds);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeSkillIds(skillIds: string[]): string[] {
  return [...new Set(
    skillIds
      .filter((skillId) => typeof skillId === 'string')
      .map((skillId) => skillId.trim())
      .filter(Boolean),
  )];
}

function buildConversationSkillState(
  activeSkillIds: string[],
  activeSkills: SkillSummary[],
): ConversationSkillState {
  const summariesById = new Map(activeSkills.map((skill) => [skill.id, skill]));
  return {
    activeSkillIds,
    activeSkills: activeSkillIds
      .map((skillId) => summariesById.get(skillId))
      .filter((skill): skill is SkillSummary => Boolean(skill)),
  };
}

function collectAllowedToolNames(activeSkills: SkillDetail[]): string[] | null {
  const allowLists = activeSkills
    .map((skill) => skill.toolPolicy.allow)
    .filter((list) => list.length > 0);
  if (allowLists.length === 0) {
    return null;
  }

  return [...new Set(allowLists.flat())];
}

function collectDeniedToolNames(activeSkills: SkillDetail[]): string[] {
  return [...new Set(activeSkills.flatMap((skill) => skill.toolPolicy.deny))];
}

function buildConversationSkillPrompt(activeSkills: SkillDetail[]): string {
  if (activeSkills.length === 0) {
    return '';
  }

  const sections = activeSkills.map((skill) => {
    const lines = [
      `### ${skill.name} (${skill.id})`,
    ];
    if (skill.description) {
      lines.push(skill.description);
    }
    if (skill.content.trim()) {
      lines.push(skill.content.trim());
    }
    if (skill.toolPolicy.allow.length > 0) {
      lines.push(`Allowed tools: ${skill.toolPolicy.allow.join(', ')}`);
    }
    if (skill.toolPolicy.deny.length > 0) {
      lines.push(`Denied tools: ${skill.toolPolicy.deny.join(', ')}`);
    }
    return lines.join('\n');
  });

  return [
    '以下是当前会话已激活的 skills。它们属于高层工作流/提示资产，回答时必须同时遵守：',
    ...sections,
  ].join('\n\n');
}
