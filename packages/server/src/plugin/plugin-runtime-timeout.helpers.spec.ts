import { runPromiseWithTimeout } from './plugin-runtime-timeout.helpers';

describe('plugin-runtime-timeout.helpers', () => {
  it('resolves when the promise completes before timeout', async () => {
    await expect(
      runPromiseWithTimeout(Promise.resolve('ok'), 20, 'timeout'),
    ).resolves.toBe('ok');
  });

  it('propagates the original rejection', async () => {
    await expect(
      runPromiseWithTimeout(Promise.reject(new Error('boom')), 20, 'timeout'),
    ).rejects.toThrow('boom');
  });

  it('rejects with the timeout message when the promise takes too long', async () => {
    await expect(
      runPromiseWithTimeout(
        new Promise<string>(() => undefined),
        10,
        'timed out',
      ),
    ).rejects.toThrow('timed out');
  });
});
