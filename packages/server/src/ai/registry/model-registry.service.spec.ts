import { ModelRegistryService } from './model-registry.service';
import type { ModelConfig } from '../types/provider.types';

describe('ModelRegistryService', () => {
  const createService = () => {
    const capabilitiesStorage = {
      getAllCapabilities: jest.fn(() => []),
      loadCapabilities: jest.fn(() => null),
      saveCapabilities: jest.fn(),
    };

    return {
      service: new ModelRegistryService(capabilitiesStorage as never),
      capabilitiesStorage,
    };
  };

  it('returns an existing model without rebuilding it', () => {
    const { service } = createService();
    const existing: ModelConfig = {
      id: 'llama-3.3-70b-versatile',
      providerId: 'groq',
      name: 'llama-3.3-70b-versatile',
      capabilities: {
        reasoning: true,
        toolCall: true,
        input: { text: true, image: false },
        output: { text: true, image: false },
      },
      api: {
        id: 'llama-3.3-70b-versatile',
        url: 'https://api.groq.com/openai/v1',
        npm: '@ai-sdk/openai',
      },
      status: 'active',
    };
    service.register(existing);
    const buildConfig = jest.fn(() => existing);

    const resolved = service.getOrRegisterModel(
      'groq',
      'llama-3.3-70b-versatile',
      buildConfig,
    );

    expect(resolved).toStrictEqual(existing);
    expect(buildConfig).not.toHaveBeenCalled();
  });

  it('builds and registers a missing model once', () => {
    const { service } = createService();
    const built: ModelConfig = {
      id: 'gemini-2.0-flash',
      providerId: 'team-gemini',
      name: 'Gemini 2.0 Flash',
      capabilities: {
        reasoning: false,
        toolCall: true,
        input: { text: true, image: true },
        output: { text: true, image: false },
      },
      api: {
        id: 'gemini-2.0-flash',
        url: 'https://compat.example.com/v1beta',
        npm: '@ai-sdk/google',
      },
      status: 'active',
    };
    const buildConfig = jest.fn(() => built);

    const resolved = service.getOrRegisterModel(
      'team-gemini',
      'gemini-2.0-flash',
      buildConfig,
    );

    expect(buildConfig).toHaveBeenCalledTimes(1);
    expect(resolved).toEqual(built);
    expect(service.getModel('team-gemini', 'gemini-2.0-flash')).toEqual(built);
  });
});
