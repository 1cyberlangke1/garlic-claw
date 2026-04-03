import { NotFoundException } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service';

describe('SkillRegistryService', () => {
  const discovery = {
    discoverSkills: jest.fn(),
  };

  const governance = {
    getSkillGovernance: jest.fn(),
    updateSkillGovernance: jest.fn(),
  };

  let service: SkillRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    discovery.discoverSkills.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂任务拆成 3-5 步',
        toolPolicy: {
          allow: [],
          deny: [],
        },
        governance: {
          trustLevel: 'prompt-only',
        },
        assets: [],
        content: 'planner',
      },
      {
        id: 'user/ops/incident',
        name: 'Incident Commander',
        description: '适合值班处理',
        tags: ['ops'],
        sourceKind: 'user',
        entryPath: 'ops/incident/SKILL.md',
        promptPreview: '先确认影响面',
        toolPolicy: {
          allow: [],
          deny: [],
        },
        governance: {
          trustLevel: 'prompt-only',
        },
        assets: [],
        content: 'incident',
      },
    ]);
    governance.getSkillGovernance.mockImplementation((skillId: string) =>
      skillId === 'project/planner'
        ? {
            trustLevel: 'local-script',
          }
        : {
            trustLevel: 'asset-read',
          });
    governance.updateSkillGovernance.mockImplementation(
      (_skillId: string, patch: { trustLevel?: string }) => ({
        trustLevel: patch.trustLevel ?? 'prompt-only',
      }),
    );
    service = new SkillRegistryService(
      discovery as never,
      governance as never,
    );
  });

  it('merges persisted governance into discovered skills', async () => {
    await expect(service.listSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/planner',
        governance: {
          trustLevel: 'local-script',
        },
      }),
      expect.objectContaining({
        id: 'user/ops/incident',
        governance: {
          trustLevel: 'asset-read',
        },
      }),
    ]);
  });

  it('updates governance for an existing skill and rejects unknown ids', async () => {
    await expect(
      service.updateSkillGovernance('project/planner', {
        trustLevel: 'asset-read',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'project/planner',
        governance: {
          trustLevel: 'asset-read',
        },
      }),
    );

    await expect(
      service.updateSkillGovernance('missing/skill', {
        trustLevel: 'prompt-only',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
