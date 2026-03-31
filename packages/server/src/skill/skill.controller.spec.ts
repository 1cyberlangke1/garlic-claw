import { SkillController } from './skill.controller';

describe('SkillController', () => {
  const skillRegistry = {
    listSkills: jest.fn(),
    refreshSkills: jest.fn(),
  };

  let controller: SkillController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SkillController(skillRegistry as never);
  });

  it('returns the discovered skill catalog', async () => {
    skillRegistry.listSkills.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
      },
    ]);

    await expect(controller.listSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/planner',
      }),
    ]);
  });

  it('refreshes the discovered skill catalog', async () => {
    skillRegistry.refreshSkills.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
      },
    ]);

    await expect(controller.refreshSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/planner',
      }),
    ]);
  });
});
