import { NotFoundException } from '@nestjs/common';
import {
  resolveCachedRuntimeService,
  resolveCachedRuntimeServiceAsync,
  resolveCachedRuntimeServicePromise,
} from './plugin-runtime-module.helpers';

describe('plugin-runtime-module.helpers', () => {
  it('resolves cached sync services and caches fresh values', () => {
    const cache = jest.fn();

    expect(
      resolveCachedRuntimeService({
        current: 'cached-service',
        resolve: () => 'fresh-service',
        cache,
        notFoundMessage: 'service missing',
      }),
    ).toBe('cached-service');
    expect(cache).not.toHaveBeenCalled();

    expect(
      resolveCachedRuntimeService({
        current: undefined,
        resolve: () => 'fresh-service',
        cache,
        notFoundMessage: 'service missing',
      }),
    ).toBe('fresh-service');
    expect(cache).toHaveBeenCalledWith('fresh-service');

    expect(() =>
      resolveCachedRuntimeService({
        current: undefined,
        resolve: () => undefined,
        cache,
        notFoundMessage: 'service missing',
      }),
    ).toThrow(new NotFoundException('service missing'));
  });

  it('resolves cached async services and caches fresh values', async () => {
    const cache = jest.fn();

    await expect(
      resolveCachedRuntimeServiceAsync({
        current: 'cached-service',
        resolve: async () => 'fresh-service',
        cache,
        notFoundMessage: 'service missing',
      }),
    ).resolves.toBe('cached-service');
    expect(cache).not.toHaveBeenCalled();

    await expect(
      resolveCachedRuntimeServiceAsync({
        current: undefined,
        resolve: async () => 'fresh-service',
        cache,
        notFoundMessage: 'service missing',
      }),
    ).resolves.toBe('fresh-service');
    expect(cache).toHaveBeenCalledWith('fresh-service');

    await expect(
      resolveCachedRuntimeServiceAsync({
        current: undefined,
        resolve: async () => undefined,
        cache,
        notFoundMessage: 'service missing',
      }),
    ).rejects.toThrow(new NotFoundException('service missing'));
  });

  it('reuses cached promises for async module services', async () => {
    const cache = jest.fn();
    const current = Promise.resolve('cached-service');

    await expect(
      resolveCachedRuntimeServicePromise({
        current,
        resolve: async () => 'fresh-service',
        cache,
        notFoundMessage: 'service missing',
      }),
    ).resolves.toBe('cached-service');
    expect(cache).not.toHaveBeenCalled();

    const nextPromise = resolveCachedRuntimeServicePromise({
      current: undefined,
      resolve: async () => 'fresh-service',
      cache,
      notFoundMessage: 'service missing',
    });

    expect(cache).toHaveBeenCalledWith(nextPromise);
    await expect(nextPromise).resolves.toBe('fresh-service');

    await expect(
      resolveCachedRuntimeServicePromise({
        current: undefined,
        resolve: async () => undefined,
        cache,
        notFoundMessage: 'service missing',
      }),
    ).rejects.toThrow(new NotFoundException('service missing'));
  });
});
