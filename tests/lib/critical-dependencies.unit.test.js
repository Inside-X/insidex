import { jest } from '@jest/globals';

describe('critical-dependencies helpers', () => {
  test('isDependencyUnavailableError covers transient and HTTP status cases', async () => {
    jest.resetModules();
    const mod = await import('../../src/lib/critical-dependencies.js');

    expect(mod.isDependencyUnavailableError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(mod.isDependencyUnavailableError({ code: 'DB_OPERATION_FAILED' })).toBe(true);
    expect(mod.isDependencyUnavailableError({ statusCode: 502 })).toBe(true);
    expect(mod.isDependencyUnavailableError({ statusCode: 503 })).toBe(true);
    expect(mod.isDependencyUnavailableError({ code: 'EACCES', statusCode: 500 })).toBe(false);
    expect(mod.isDependencyUnavailableError({})).toBe(false);
  });

  test('getDependencyReasonCode resolves known dependency classes', async () => {
    jest.resetModules();
    const mod = await import('../../src/lib/critical-dependencies.js');

    expect(mod.getDependencyReasonCode('db')).toBe('db_unavailable');
    expect(mod.getDependencyReasonCode('redis')).toBe('redis_unavailable');
    expect(mod.getDependencyReasonCode('provider_timeout')).toBe('provider_timeout');
    expect(mod.getDependencyReasonCode('anything-else')).toBe('dependency_unknown');
  });

  test('assertDatabaseReady executes prisma transaction preflight', async () => {
    jest.resetModules();
    const tx = jest.fn(async (callback) => callback());

    await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
      default: {
        $transaction: tx,
      },
    }));

    const mod = await import('../../src/lib/critical-dependencies.js');
    await mod.assertDatabaseReady();

    expect(tx).toHaveBeenCalledTimes(1);
  });
});