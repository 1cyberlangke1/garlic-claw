import { NotFoundException } from '@nestjs/common';
import { SkillSessionService } from './skill-session.service';

describe('SkillSessionService', () => {
  const prisma = {
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const skillRegistry = {
    listSkillSummaries: jest.fn(),
    listSkills: jest.fn(),
  };

  let service: SkillSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    skillRegistry.listSkillSummaries.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        toolPolicy: {
          allow: ['kb.search'],
          deny: [],
        },
      },
      {
        id: 'project/plugin-operator',
        name: '插件运维',
        description: '统一查看和治理插件。',
        tags: ['plugins'],
        sourceKind: 'project',
        entryPath: 'plugin-operator/SKILL.md',
        promptPreview: '优先检查插件状态和冲突。',
        toolPolicy: {
          allow: [],
          deny: ['automation.run'],
        },
      },
    ]);
    skillRegistry.listSkills.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        toolPolicy: {
          allow: ['kb.search'],
          deny: [],
        },
        content: '先拆任务，再逐步执行。',
      },
      {
        id: 'project/plugin-operator',
        name: '插件运维',
        description: '统一查看和治理插件。',
        tags: ['plugins'],
        sourceKind: 'project',
        entryPath: 'plugin-operator/SKILL.md',
        promptPreview: '优先检查插件状态和冲突。',
        toolPolicy: {
          allow: [],
          deny: ['automation.run'],
        },
        content: '统一查看和治理插件。',
      },
    ]);
    service = new SkillSessionService(
      prisma as never,
      skillRegistry as never,
    );
  });

  it('returns the normalized conversation skill state for the owner and drops missing ids', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      skillsJson: JSON.stringify([
        'project/planner',
        'missing/skill',
      ]),
    });
    prisma.conversation.update.mockResolvedValue(null);

    await expect(
      service.getConversationSkillStateForUser('user-1', 'conversation-1'),
    ).resolves.toEqual({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        expect.objectContaining({
          id: 'project/planner',
          name: '规划执行',
        }),
      ],
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: {
        skillsJson: JSON.stringify(['project/planner']),
      },
    });
  });

  it('persists unique active skills for the owner and rejects unknown ids', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      skillsJson: JSON.stringify([]),
    });
    prisma.conversation.update.mockResolvedValue(null);

    await expect(
      service.updateConversationSkillStateForUser('user-1', 'conversation-1', [
        'project/planner',
        'project/planner',
        'project/plugin-operator',
      ]),
    ).resolves.toEqual({
      activeSkillIds: ['project/planner', 'project/plugin-operator'],
      activeSkills: [
        expect.objectContaining({ id: 'project/planner' }),
        expect.objectContaining({ id: 'project/plugin-operator' }),
      ],
    });

    await expect(
      service.updateConversationSkillStateForUser('user-1', 'conversation-1', [
        'missing/skill',
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
