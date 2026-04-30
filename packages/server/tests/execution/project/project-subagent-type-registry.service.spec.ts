import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/execution/project/project-worktree-root.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/execution/project/project-subagent-type-registry.service';

describe('ProjectSubagentTypeRegistryService', () => {
  const envKey = 'GARLIC_CLAW_SUBAGENT_PATH';
  let storageRoot: string;

  beforeEach(() => {
    storageRoot = path.join(os.tmpdir(), `gc-subagent-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env[envKey] = storageRoot;
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(storageRoot, { force: true, recursive: true });
  });

  it('loads builtin defaults from independent folders and picks up user-defined types', () => {
    const service = new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService());

    expect(service.listTypes()).toEqual([
      {
        id: 'explore',
        name: '探索',
        description: '偏向资料探索与技能加载。默认开放 webfetch 与 skill，并附带探索导向提示词。',
      },
      {
        id: 'general',
        name: '通用',
        description: '默认子代理类型。沿用当前请求显式指定的模型与系统提示词，不额外裁剪工具。',
      },
    ]);
    expect(fs.existsSync(path.join(storageRoot, 'general', 'subagent.json'))).toBe(true);
    expect(fs.existsSync(path.join(storageRoot, 'explore', 'subagent.json'))).toBe(true);
    expect(fs.readFileSync(path.join(storageRoot, 'explore', 'prompt.md'), 'utf-8')).toBe('你是一个专注于探索与信息收集的子代理。\n优先检索、抓取、整理上下文，不主动修改文件。\n如果信息不足，先继续检索，再给出结论。');

    fs.mkdirSync(path.join(storageRoot, 'review'), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, 'review', 'subagent.json'), JSON.stringify({
      id: 'review',
      name: '审阅',
      description: '聚焦审阅与风险检查。',
      providerId: 'openai',
      modelId: 'gpt-5.4',
      toolNames: ['webfetch'],
    }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(storageRoot, 'review', 'prompt.md'), '你是一个审阅子代理。\n优先指出风险与缺口。', 'utf-8');

    expect(service.listTypes()).toEqual([
      {
        id: 'explore',
        name: '探索',
        description: '偏向资料探索与技能加载。默认开放 webfetch 与 skill，并附带探索导向提示词。',
      },
      {
        id: 'general',
        name: '通用',
        description: '默认子代理类型。沿用当前请求显式指定的模型与系统提示词，不额外裁剪工具。',
      },
      {
        id: 'review',
        name: '审阅',
        description: '聚焦审阅与风险检查。',
      },
    ]);
    expect(service.getType('review')).toEqual({
      description: '聚焦审阅与风险检查。',
      id: 'review',
      modelId: 'gpt-5.4',
      name: '审阅',
      providerId: 'openai',
      system: '你是一个审阅子代理。\n优先指出风险与缺口。',
      toolNames: ['webfetch'],
    });
  });
});
