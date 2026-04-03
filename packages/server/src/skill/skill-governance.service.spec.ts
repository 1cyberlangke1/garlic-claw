import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillGovernanceService } from './skill-governance.service';

describe('SkillGovernanceService', () => {
  let tempRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'garlic-claw-skill-governance-'));
    settingsPath = path.join(tempRoot, 'skill-governance.json');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('defaults to prompt-only governance for undiscovered entries and persists updates', () => {
    const service = new SkillGovernanceService({
      settingsPath,
    });

    expect(service.getSkillGovernance('project/planner')).toEqual({
      trustLevel: 'prompt-only',
    });

    expect(
      service.updateSkillGovernance('project/planner', {
        trustLevel: 'local-script',
      }),
    ).toEqual({
      trustLevel: 'local-script',
    });

    const reloaded = new SkillGovernanceService({
      settingsPath,
    });
    expect(reloaded.getSkillGovernance('project/planner')).toEqual({
      trustLevel: 'local-script',
    });
  });

  it('ignores legacy enabled fields and keeps the persisted trust level', () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        version: 1,
        skills: {
          'project/planner': {
            enabled: false,
            trustLevel: 'asset-read',
          },
        },
      }, null, 2),
      'utf-8',
    );

    const reloaded = new SkillGovernanceService({
      settingsPath,
    });
    expect(reloaded.getSkillGovernance('project/planner')).toEqual({
      trustLevel: 'asset-read',
    });
  });

  it('keeps valid persisted governance entries while dropping malformed ones', () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        version: 1,
        skills: {
          'project/planner': {
            trustLevel: 'asset-read',
          },
          'project/broken-enabled': {
            enabled: 'nope',
            trustLevel: 'prompt-only',
          },
          'project/broken-trust': {
            trustLevel: 'shell-access',
          },
          'project/not-object': 'bad',
        },
      }, null, 2),
      'utf-8',
    );

    const service = new SkillGovernanceService({
      settingsPath,
    });

    expect(service.getSkillGovernance('project/planner')).toEqual({
      trustLevel: 'asset-read',
    });
    expect(service.getSkillGovernance('project/broken-enabled')).toEqual({
      trustLevel: 'prompt-only',
    });
    expect(service.getSkillGovernance('project/broken-trust')).toEqual({
      trustLevel: 'prompt-only',
    });
  });
});
