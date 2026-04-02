/**
 * CustomProviderService 协议接入协议族测试
 *
 * 输入:
 * - 自定义供应商注册参数
 *
 * 输出:
 * - 断言服务会根据 protocol 字段语义选择正确的 SDK 适配器和模型 npm 标识
 *
 * 预期行为:
 * - 只支持 openai / anthropic / gemini 三种协议接入协议族
 * - 未显式指定 protocol 时默认走 openai
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { CustomProviderService } from './custom-provider.service';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import { ModelRegistryService } from '../registry/model-registry.service';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn((modelId: string) => ({ provider: 'openai', modelId })),
  })),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => ({
    chat: jest.fn((modelId: string) => ({ provider: 'anthropic', modelId })),
  })),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => ({
    chat: jest.fn((modelId: string) => ({ provider: 'gemini', modelId })),
  })),
}));

describe('CustomProviderService protocol providers', () => {
  let service: CustomProviderService;
  let providerRegistry: {
    hasProvider: jest.Mock;
    registerProvider: jest.Mock;
    unregisterProvider: jest.Mock;
    getProviderConfig: jest.Mock;
  };
  let modelRegistry: {
    register: jest.Mock;
    clearProviderModels: jest.Mock;
    listModels: jest.Mock;
  };
  beforeEach(async () => {
    providerRegistry = {
      hasProvider: jest.fn().mockReturnValue(false),
      registerProvider: jest.fn((config) => config),
      unregisterProvider: jest.fn(),
      getProviderConfig: jest.fn(),
    };

    modelRegistry = {
      register: jest.fn(),
      clearProviderModels: jest.fn(),
      listModels: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomProviderService,
        {
          provide: ProviderRegistryService,
          useValue: providerRegistry,
        },
        {
          provide: ModelRegistryService,
          useValue: modelRegistry,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-api-key') },
        },
      ],
    }).compile();

    service = module.get<CustomProviderService>(CustomProviderService);
    jest.clearAllMocks();
  });

  it('uses the google adapter for gemini protocol providers', async () => {
    const result = await service.registerProvider({
      id: 'gemini-proxy',
      name: 'Gemini Proxy',
      baseUrl: 'https://gemini.example.com/v1beta',
      protocol: 'gemini' as never,
      models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    });

    expect(result.npm).toBe('@ai-sdk/google');
    expect(modelRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          npm: '@ai-sdk/google',
        }),
      }),
    );
    expect(providerRegistry.registerProvider.mock.calls[0]).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: 'Gemini Proxy',
        npm: '@ai-sdk/google',
      }),
    ]);
    expect(createGoogleGenerativeAI).not.toHaveBeenCalled();
  });

  it('uses the anthropic adapter for anthropic protocol providers', async () => {
    const result = await service.registerProvider({
      id: 'anthropic-proxy',
      name: 'Anthropic Proxy',
      baseUrl: 'https://anthropic.example.com/v1',
      protocol: 'anthropic',
      models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' }],
    });

    expect(result.npm).toBe('@ai-sdk/anthropic');
    expect(modelRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          npm: '@ai-sdk/anthropic',
        }),
      }),
    );
    expect(providerRegistry.registerProvider.mock.calls[0]).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: 'Anthropic Proxy',
        npm: '@ai-sdk/anthropic',
      }),
    ]);
    expect(createAnthropic).not.toHaveBeenCalled();
  });

  it('defaults to the openai adapter when protocol is omitted', async () => {
    const result = await service.registerProvider({
      id: 'openai-proxy',
      name: 'OpenAI Proxy',
      baseUrl: 'https://openai.example.com/v1',
      models: [{ id: 'gpt-4.1', name: 'GPT 4.1' }],
    });

    expect(result.npm).toBe('@ai-sdk/openai');
    expect(modelRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          npm: '@ai-sdk/openai',
        }),
      }),
    );
    expect(providerRegistry.registerProvider.mock.calls[0]).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: 'OpenAI Proxy',
        npm: '@ai-sdk/openai',
      }),
    ]);
    expect(createOpenAI).not.toHaveBeenCalled();
  });
});
