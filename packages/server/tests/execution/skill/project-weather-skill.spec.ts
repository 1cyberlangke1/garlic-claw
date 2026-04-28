import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/execution/project/project-worktree-root.service';

describe('project weather skill', () => {
  const projectRoot = new ProjectWorktreeRootService().resolveRoot(process.cwd());
  const skillPath = path.join(
    projectRoot,
    'config',
    'skills',
    'definitions',
    'weather-query',
    'SKILL.md',
  );

  it('uses the repository script as the default execution path', async () => {
    const content = await fs.readFile(skillPath, 'utf8');

    expect(content).toContain('默认通过仓库内脚本执行');
    expect(content).toContain('node scripts/weather.js "上海"');
    expect(content).not.toContain('curl --fail --silent --show-error');
  });
});
