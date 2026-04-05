/**
 * AiProviderService 运行时模型访问测试
 *
 * 输入:
 * - 运行时 provider 注册表
 * - 模型注册表中的能力覆盖
 *
 * 输出:
 * - 断言服务通过 runtime provider registry 获取模型
 * - 断言模型能力优先使用注册表中的已配置结果
 *
 * 预期行为:
 * - provider 同步和版本控制不再留在 AiProviderService
 * - AiProviderService 只保留模型获取和配置兜底
 */

import type { RuntimeProviderRegistration } from './ai-provider.helpers';
import { AiProviderService } from './ai-provider.service';
import type { ModelConfig } from './types/provider.types';

describe('AiProviderService', () => {
  type ModelRegistryLike = {
    getModel: jest.Mock<ModelConfig | null, [string, string]>;
    getOrRegisterModel: jest.Mock<ModelConfig, [string, string, () => ModelConfig]>;
    register: jest.Mock<void, [ModelConfig]>;
  };

  type RuntimeProviderRegistryLike = {
    getRegistration: jest.Mock<RuntimeProviderRegistration, [string?]>;
    listProviderIds: jest.Mock<string[], []>;
  };

  const createService = (
    overrides?: {
      registration?: RuntimeProviderRegistration;
      registeredModel?: ModelConfig | null;
      availableProviders?: string[];
    },
  ) => {
    const runtimeProviderRegistry: RuntimeProviderRegistryLike = {
      getRegistration: jest.fn(
        () =>
          overrides?.registration ?? {
            id: 'groq',
            driver: 'openai',
            createModel: (modelId: string) => ({
              provider: 'groq.chat',
              modelId,
            }),
            baseUrl: 'https://api.groq.com/openai/v1',
            npm: '@ai-sdk/openai',
            defaultModel: 'llama-3.3-70b-versatile',
          },
      ),
      listProviderIds: jest.fn(() => overrides?.availableProviders ?? ['groq']),
    };

    const modelRegistry: ModelRegistryLike = {
      getModel: jest.fn(
        (_providerId: string, _modelId: string) =>
          overrides?.registeredModel ?? null,
      ),
      getOrRegisterModel: jest.fn(
        (_providerId: string, _modelId: string, buildConfig: () => ModelConfig) =>
          overrides?.registeredModel ?? buildConfig(),
      ),
      register: jest.fn((_config: ModelConfig) => undefined),
    };

    return {
      service: Reflect.construct(
        AiProviderService,
        [runtimeProviderRegistry, modelRegistry],
      ) as AiProviderService,
      runtimeProviderRegistry,
      modelRegistry,
    };
  };

  it('gets models from the runtime provider registry', () => {
    const { service, runtimeProviderRegistry } = createService({
      registration: {
        id: 'groq',
        driver: 'openai',
        createModel: (modelId: string) => ({
          provider: 'groq.chat',
          modelId,
        }),
        baseUrl: 'https://api.groq.com/openai/v1',
        npm: '@ai-sdk/openai',
        defaultModel: 'llama-3.3-70b-versatile',
      },
    });

    const model = service.getModel('groq', 'llama-3.3-70b-versatile');

    expect(runtimeProviderRegistry.getRegistration).toHaveBeenCalledWith('groq');
    expect(model).toEqual({
      provider: 'groq.chat',
      modelId: 'llama-3.3-70b-versatile',
    });
  });

  it('builds and registers inferred model config when the model registry misses', () => {
    const { service, modelRegistry, runtimeProviderRegistry } = createService({
      registration: {
        id: 'team-gemini',
        driver: 'gemini',
        createModel: (modelId: string) => ({
          provider: 'team-gemini',
          modelId,
        }),
        baseUrl: 'https://compat.example.com/v1beta',
        npm: '@ai-sdk/google',
        defaultModel: 'gemini-2.0-flash',
      },
      availableProviders: ['team-gemini'],
    });

    const modelConfig = service.getModelConfig('team-gemini', 'gemini-2.0-flash');

    expect(runtimeProviderRegistry.getRegistration).toHaveBeenCalledWith(
      'team-gemini',
    );
    expect(modelRegistry.getOrRegisterModel).toHaveBeenCalledWith(
      'team-gemini',
      'gemini-2.0-flash',
      expect.any(Function),
    );
    expect(modelConfig.providerId).toBe('team-gemini');
    expect(modelConfig.api.npm).toBe('@ai-sdk/google');
  });

  it('uses the runtime provider default model when model id is omitted', () => {
    const { service } = createService({
      registration: {
        id: 'team-gemini',
        driver: 'gemini',
        createModel: (modelId: string) => ({
          provider: 'team-gemini',
          modelId,
        }),
        baseUrl: 'https://compat.example.com/v1beta',
        npm: '@ai-sdk/google',
        defaultModel: 'gemini-2.0-flash',
      },
    });

    const model = service.getModel('team-gemini');

    expect(model).toEqual({
      provider: 'team-gemini',
      modelId: 'gemini-2.0-flash',
    });
  });

  it('prefers the model registry config over inferred capabilities', () => {
    const registeredModel: ModelConfig = {
      id: 'llama-3.3-70b-versatile',
      providerId: 'groq',
      name: 'llama-3.3-70b-versatile',
      capabilities: {
        reasoning: true,
        toolCall: false,
        input: { text: true, image: true },
        output: { text: true, image: false },
      },
      api: {
        id: 'llama-3.3-70b-versatile',
        url: 'https://api.groq.com/openai/v1',
        npm: '@ai-sdk/openai',
      },
      status: 'active',
    };
    const { service, modelRegistry } = createService({
      registeredModel,
    });

    const modelConfig = service.getModelConfig('groq', 'llama-3.3-70b-versatile');

    expect(modelRegistry.getOrRegisterModel).toHaveBeenCalledWith(
      'groq',
      'llama-3.3-70b-versatile',
      expect.any(Function),
    );
    expect(modelConfig).toBe(registeredModel);
  });

  it('throws when the runtime provider registry has no configured provider', () => {
    const error = new Error(
      'AI provider "unset" is not configured. Available providers: ',
    );
    const { runtimeProviderRegistry } = createService({
      availableProviders: [],
    });
    runtimeProviderRegistry.getRegistration.mockImplementation(() => {
      throw error;
    });

    const service = Reflect.construct(
      AiProviderService,
      [runtimeProviderRegistry, { getModel: jest.fn(), register: jest.fn() }],
    ) as AiProviderService;

    expect(() => service.getModel()).toThrow(error.message);
  });

  it('delegates available provider listing to the runtime provider registry', () => {
    const { service, runtimeProviderRegistry } = createService({
      availableProviders: ['groq', 'team-gemini'],
    });

    expect(service.getAvailableProviders()).toEqual(['groq', 'team-gemini']);
    expect(runtimeProviderRegistry.listProviderIds).toHaveBeenCalledTimes(1);
  });
});
