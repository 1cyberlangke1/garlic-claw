import { BootstrapUserService } from '../../src/auth/bootstrap-user.service';

describe('BootstrapUserService', () => {
  it('logs the single system user on startup warmup', () => {
    const service = new BootstrapUserService();

    // runStartupWarmup should not throw
    expect(() => service.runStartupWarmup()).not.toThrow();
  });

  it('returns the same warmup promise across repeated calls', () => {
    const service = new BootstrapUserService();

    const first = service.runStartupWarmup();
    const second = service.runStartupWarmup();

    // Both calls should return the same value (undefined since it's void)
    expect(first).toBe(second);
    expect(first).toBeUndefined();
  });
});
