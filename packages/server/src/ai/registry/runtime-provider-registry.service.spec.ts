import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { AiProviderMode } from '@garlic-claw/shared';
import { RuntimeProviderRegistryService } from './runtime-provider-registry.service';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn((options?: { name?: string }) => {
    const provider = jest.fn((modelId: string) => ({
      provider: `${options?.name ?? 'openai'}.responses`,
      modelId,
    }));

    return Object.assign(provider, {
      chat: jest.fn((modelId: string) => ({
        provider: `${options?.name ?? 'openai'}.chat`,
        modelId,
      })),
    });
  }),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn((options?: { name?: string }) => ({
    chat: jest.fn((modelId: string) => ({
      provider: options?.name ?? 'anthropic',
      modelId,
    })),
  })),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn((options?: { name?: string }) => ({
    chat: jest.fn((modelId: string) => ({
      provider: options?.name ?? 'gemini',
      modelId,
    })),
  })),
}));

describe('RuntimeProviderRegistryService', () => {
  type ConfiguredProvider = {
    id: string;
    name: string;
    mode: AiProviderMode;
    driver: string;
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    models: string[];
  };

  type ConfigManagerLike = {
    listProviders: jest.Mock<ConfiguredProvider[], []>;
    getSettingsVersion: jest.Mock<string, []>;
  };

  type ModelRegistryLike = {
    clearProviderModels: jest.Mock<void, [string]>;
  };

  const createService = (
    configManagerOverrides?: Partial<ConfigManagerLike>,
  ) => {
    const configManager: ConfigManagerLike = {
      listProviders: jest.fn(() => []),
      getSettingsVersion: jest.fn(() => 'v1'),
      ...configManagerOverrides,
    };

    const modelRegistry: ModelRegistryLike = {
      clearProviderModels: jest.fn(),
    };

    return {
      service: Reflect.construct(
        RuntimeProviderRegistryService,
        [configManager, modelRegistry],
      ) as RuntimeProviderRegistryService,
      configManager,
      modelRegistry,
    };
  };

  it('registers configured runtime providers from config storage', () => {
    const { service } = createService({
      listProviders: jest.fn(() => [
        {
          id: 'groq',
          name: 'Groq',
          mode: 'catalog',
          driver: 'groq',
          apiKey: 'groq-key',
          baseUrl: 'https://api.groq.com/openai/v1',
          defaultModel: 'llama-3.3-70b-versatile',
          models: ['llama-3.3-70b-versatile'],
        },
      ]),
    });

    const registration = service.getRegistration('groq');
    const model = registration.createModel('llama-3.3-70b-versatile');

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'groq-key',
        baseURL: 'https://api.groq.com/openai/v1',
        name: 'groq',
      }),
    );
    expect(registration.id).toBe('groq');
    expect(registration.defaultModel).toBe('llama-3.3-70b-versatile');
    expect(model).toEqual({
      provider: 'groq.chat',
      modelId: 'llama-3.3-70b-versatile',
    });
    expect(service.listProviderIds()).toEqual(['groq']);
  });

  it('does not rescan configured providers when the settings version is unchanged', () => {
    const configuredProviders: ConfiguredProvider[] = [
      {
        id: 'team-gemini',
        name: 'Team Gemini',
        mode: 'protocol',
        driver: 'gemini',
        apiKey: 'team-key',
        baseUrl: 'https://compat.example.com/v1beta',
        defaultModel: 'gemini-2.0-flash',
        models: ['gemini-2.0-flash'],
      },
    ];
    const { service, configManager } = createService({
      listProviders: jest.fn(() => configuredProviders),
      getSettingsVersion: jest.fn(() => 'stable-version'),
    });

    expect(configManager.listProviders).toHaveBeenCalledTimes(1);

    service.getRegistration('team-gemini');
    service.listProviderIds();

    expect(createGoogleGenerativeAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'team-key',
        baseURL: 'https://compat.example.com/v1beta',
        name: 'team-gemini',
      }),
    );
    expect(configManager.getSettingsVersion).toHaveBeenCalledTimes(3);
    expect(configManager.listProviders).toHaveBeenCalledTimes(1);
  });

  it('clears removed provider models after the config version changes', () => {
    const { service, modelRegistry } = createService({
      listProviders: jest
        .fn()
        .mockReturnValueOnce([
          {
            id: 'groq',
            name: 'Groq',
            mode: 'catalog',
            driver: 'groq',
            apiKey: 'groq-key',
            baseUrl: 'https://api.groq.com/openai/v1',
            defaultModel: 'llama-3.3-70b-versatile',
            models: ['llama-3.3-70b-versatile'],
          },
        ])
        .mockReturnValueOnce([]),
      getSettingsVersion: jest
        .fn()
        .mockReturnValueOnce('v1')
        .mockReturnValueOnce('v1')
        .mockReturnValueOnce('v2'),
    });

    expect(service.listProviderIds()).toEqual(['groq']);
    expect(modelRegistry.clearProviderModels).not.toHaveBeenCalled();

    expect(service.listProviderIds()).toEqual([]);
    expect(modelRegistry.clearProviderModels).toHaveBeenCalledWith('groq');
  });
});
