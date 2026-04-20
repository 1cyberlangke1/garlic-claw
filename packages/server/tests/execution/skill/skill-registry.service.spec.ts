import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillRegistryService } from '../../../src/execution/skill/skill-registry.service';

describe('SkillRegistryService', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-registry-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('scans skills only from the configured skills directory', async () => {
    const skillsRoot = path.join(tempRoot, 'skills');
    const externalRoot = path.join(tempRoot, 'external-skills');
    await fs.mkdir(path.join(skillsRoot, 'planner'), { recursive: true });
    await fs.mkdir(path.join(externalRoot, 'ignored'), { recursive: true });
    await fs.writeFile(path.join(skillsRoot, 'planner', 'SKILL.md'), [
      '---',
      'name: planner',
      'description: 先拆任务，再逐步执行。',
      '---',
      '',
      '# planner',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(externalRoot, 'ignored', 'SKILL.md'), [
      '---',
      'name: ignored',
      'description: 不应被扫描到。',
      '---',
      '',
      '# ignored',
    ].join('\n'), 'utf8');

    const service = new SkillRegistryService({
      skillsRoot,
    });

    await expect(service.listSkills()).resolves.toEqual([
      expect.objectContaining({
        description: '先拆任务，再逐步执行。',
        entryPath: 'planner/SKILL.md',
        id: 'project/planner',
        name: 'planner',
        sourceKind: 'project',
      }),
    ]);
  });

  it('sorts discovered skills by name before exposing them', async () => {
    const skillsRoot = path.join(tempRoot, 'skills');
    await fs.mkdir(path.join(skillsRoot, 'zeta'), { recursive: true });
    await fs.mkdir(path.join(skillsRoot, 'alpha'), { recursive: true });
    await fs.writeFile(path.join(skillsRoot, 'zeta', 'SKILL.md'), [
      '---',
      'name: zeta',
      'description: zeta skill',
      '---',
      '',
      '# zeta',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(skillsRoot, 'alpha', 'SKILL.md'), [
      '---',
      'name: alpha',
      'description: alpha skill',
      '---',
      '',
      '# alpha',
    ].join('\n'), 'utf8');

    const service = new SkillRegistryService({
      skillsRoot,
    });

    await expect(service.listSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/alpha',
        name: 'alpha',
      }),
      expect.objectContaining({
        id: 'project/zeta',
        name: 'zeta',
      }),
    ]);
  });

  it('resolves skill directories relative to the configured skills root', () => {
    const skillsRoot = path.join(tempRoot, 'skills');
    const service = new SkillRegistryService({
      skillsRoot,
    });

    expect(service.resolveSkillDirectory({
      entryPath: 'planner/SKILL.md',
      sourceKind: 'project',
    })).toBe(path.join(skillsRoot, 'planner'));
  });
});
