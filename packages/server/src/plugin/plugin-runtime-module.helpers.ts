import { NotFoundException } from '@nestjs/common';

export function resolveCachedRuntimeService<T>(input: {
  current: T | undefined;
  resolve: () => T | undefined;
  cache: (value: T) => void;
  notFoundMessage: string;
}): T {
  if (input.current) {
    return input.current;
  }

  const resolved = input.resolve();
  if (!resolved) {
    throw new NotFoundException(input.notFoundMessage);
  }

  input.cache(resolved);
  return resolved;
}

export async function resolveCachedRuntimeServiceAsync<T>(input: {
  current: T | undefined;
  resolve: () => Promise<T | undefined>;
  cache: (value: T) => void;
  notFoundMessage: string;
}): Promise<T> {
  if (input.current) {
    return input.current;
  }

  const resolved = await input.resolve();
  if (!resolved) {
    throw new NotFoundException(input.notFoundMessage);
  }

  input.cache(resolved);
  return resolved;
}

export function resolveCachedRuntimeServicePromise<T>(input: {
  current: Promise<T> | undefined;
  resolve: () => Promise<T | undefined>;
  cache: (value: Promise<T>) => void;
  notFoundMessage: string;
}): Promise<T> {
  if (input.current) {
    return input.current;
  }

  const promise = (async () => {
    const resolved = await input.resolve();
    if (!resolved) {
      throw new NotFoundException(input.notFoundMessage);
    }

    return resolved;
  })();
  input.cache(promise);
  return promise;
}
