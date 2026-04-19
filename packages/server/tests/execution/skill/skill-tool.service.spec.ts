import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillRegistryService } from '../../../src/execution/skill/skill-registry.service';
import { SkillToolService } from '../../../src/execution/skill/skill-tool.service';

describe('SkillToolService', () => {
  let tempRoot: string;
  let registry: SkillRegistryService;
  let service: SkillToolService;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-tool-'));
    await fs.mkdir(path.join(tempRoot, 'skills', 'planner', 'templates'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'skills', 'planner', 'SKILL.md'), [
      '---',
      'name: planner',
      'description: 先拆任务，再逐步执行。',
      '---',
      '',
      '# planner',
      '',
      '先拆任务，再逐步执行。',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(tempRoot, 'skills', 'planner', 'templates', 'task.md'), '# task\n', 'utf8');
    registry = new SkillRegistryService({
      projectSkillsRoot: path.join(tempRoot, 'skills'),
      userSkillsRoot: path.join(tempRoot, 'user-skills'),
    });
    service = new SkillToolService(registry);
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('loads skill content with base directory and sampled files', async () => {
    await expect(service.loadSkill('planner')).resolves.toEqual(expect.objectContaining({
      name: 'planner',
      description: '先拆任务，再逐步执行。',
      entryPath: 'planner/SKILL.md',
      content: expect.stringContaining('# planner'),
      files: expect.arrayContaining([
        expect.objectContaining({
          path: 'templates/task.md',
        }),
      ]),
    }));
  });

  it('filters denied skills from the native skill catalog and blocks direct loading', async () => {
    const skill = await registry.getSkillByName('planner');
    expect(skill).toBeTruthy();
    await registry.updateSkillGovernance(skill!.id, {
      loadPolicy: 'deny',
    });

    await expect(service.listAvailableSkills()).resolves.toEqual([]);
    await expect(service.loadSkill('planner')).rejects.toThrow('denied by governance policy');
  });
});
