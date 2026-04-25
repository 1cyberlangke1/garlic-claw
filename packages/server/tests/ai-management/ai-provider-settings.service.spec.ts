import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiProviderSettingsService } from '../../src/ai-management/ai-provider-settings.service';

describe('AiProviderSettingsService runtime config', () => {
  const tempSettingsPath = path.join(
    process.cwd(),
    'tmp',
    'ai-provider-settings.service.spec',
  );
  const envKey = 'GARLIC_CLAW_AI_SETTINGS_PATH';

  afterEach(() => {
    delete process.env[envKey];

    fs.rmSync(tempSettingsPath, { force: true, recursive: true });
  });

  it('defaults to the repository root config/ai directory when no environment variable is set', () => {
    const workspaceRoot = path.join(os.tmpdir(), `ai-provider-settings.workspace-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const defaultConfigRoot = path.join(workspaceRoot, 'config', 'ai');
    const originalCwd = process.cwd();
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    fs.mkdirSync(path.join(defaultConfigRoot, 'providers'), { recursive: true });
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'ai-config-test' }), 'utf-8');
    fs.writeFileSync(path.join(defaultConfigRoot, 'providers', 'openai.json'), JSON.stringify({
      id: 'openai',
      name: 'OpenAI',
      mode: 'protocol',
      driver: 'openai',
      apiKey: 'test-openai-key',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4',
      models: ['gpt-5.4'],
      persistedModels: [],
    }, null, 2), 'utf-8');

    delete process.env[envKey];
    delete process.env.JEST_WORKER_ID;
    process.chdir(nestedServerRoot);

    try {
      const service = new AiProviderSettingsService();
      expect(service.listProviders()).toEqual([
        expect.objectContaining({
          id: 'openai',
          name: 'OpenAI',
        }),
      ]);
      expect(fs.existsSync(path.join(defaultConfigRoot, 'providers', 'openai.json'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      if (originalJestWorkerId) {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('persists host model routing config into the shared ai settings file', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new AiProviderSettingsService();
    service.updateHostModelRoutingConfig({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      },
    });

    expect(service.getHostModelRoutingConfig()).toEqual({
      fallbackChatModels: [
        {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      ],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4.1-mini',
        },
      },
    });
  });

  it('persists vision fallback config into the shared ai settings file', () => {
    process.env[envKey] = tempSettingsPath;

    const service = new AiProviderSettingsService();
    service.updateVisionFallbackConfig({
      enabled: true,
      maxDescriptionLength: 200,
      modelId: 'gpt-4.1-mini',
      prompt: 'describe image',
      providerId: 'openai',
    });

    expect(service.getVisionFallbackConfig()).toEqual({
      enabled: true,
      maxDescriptionLength: 200,
      modelId: 'gpt-4.1-mini',
      prompt: 'describe image',
      providerId: 'openai',
    });
  });
});
