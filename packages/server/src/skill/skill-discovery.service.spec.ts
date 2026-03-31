import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillDiscoveryService } from './skill-discovery.service';

describe('SkillDiscoveryService', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-discovery-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('discovers project and user skills from SKILL.md files with frontmatter and tool policies', async () => {
    const projectSkillsRoot = path.join(tempRoot, 'project-skills');
    const userSkillsRoot = path.join(tempRoot, 'user-skills');
    await fs.mkdir(path.join(projectSkillsRoot, 'planner'), { recursive: true });
    await fs.mkdir(path.join(userSkillsRoot, 'ops', 'incident'), { recursive: true });
    await fs.writeFile(
      path.join(projectSkillsRoot, 'planner', 'SKILL.md'),
      [
        '---',
        'name: 规划执行',
        'description: 先拆任务，再逐步执行。',
        'tags:',
        '  - planning',
        '  - execution',
        'tools:',
        '  allow:',
        '    - kb.search',
        '    - llm.generate',
        '  deny:',
        '    - automation.run',
        '---',
        '',
        '# Planner',
        '',
        '把复杂请求拆成 3-5 步，再开始执行。',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(userSkillsRoot, 'ops', 'incident', 'SKILL.md'),
      [
        '---',
        'name: Incident Commander',
        'description: 适合排障和值班场景。',
        'tags:',
        '  - ops',
        '---',
        '',
        '优先确认影响面，再决定是否执行修复动作。',
      ].join('\n'),
      'utf8',
    );

    const service = new SkillDiscoveryService({
      projectSkillsRoot,
      userSkillsRoot,
    });

    await expect(service.discoverSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning', 'execution'],
        sourceKind: 'project',
        entryPath: path.join('planner', 'SKILL.md').replace(/\\/g, '/'),
        promptPreview: expect.stringContaining('把复杂请求拆成 3-5 步'),
        toolPolicy: {
          allow: ['kb.search', 'llm.generate'],
          deny: ['automation.run'],
        },
        content: expect.stringContaining('# Planner'),
      }),
      expect.objectContaining({
        id: 'user/ops/incident',
        name: 'Incident Commander',
        description: '适合排障和值班场景。',
        tags: ['ops'],
        sourceKind: 'user',
        entryPath: path.join('ops', 'incident', 'SKILL.md').replace(/\\/g, '/'),
        promptPreview: expect.stringContaining('优先确认影响面'),
        toolPolicy: {
          allow: [],
          deny: [],
        },
      }),
    ]);
  });
});
