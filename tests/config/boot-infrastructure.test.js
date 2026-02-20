import { jest } from '@jest/globals';
import { assertProductionInfrastructureOrExit } from '../../src/config/boot-infrastructure.js';

describe('boot infrastructure hardening', () => {
  test('exits in production when redis is unavailable', async () => {
    const exit = jest.fn();
    const onError = jest.fn();

    const result = await assertProductionInfrastructureOrExit({
      env: { NODE_ENV: 'production' },
      connectRedis: async () => null,
      verifyRedis: async () => {},
      connectDb: async () => {},
      exit,
      onError,
    });

    expect(result.ok).toBe(false);
    expect(exit).toHaveBeenCalledWith(1);
    expect(onError).toHaveBeenCalledWith('boot_infra_unavailable', expect.objectContaining({
      event: 'boot_infra_unavailable',
    }));
  });

  test('exits in production when database connection fails', async () => {
    const exit = jest.fn();
    const onError = jest.fn();

    const result = await assertProductionInfrastructureOrExit({
      env: { NODE_ENV: 'production' },
      connectRedis: async () => ({ ping: async () => 'PONG' }),
      verifyRedis: async () => {},
      connectDb: async () => { throw new Error('db down'); },
      exit,
      onError,
    });

    expect(result.ok).toBe(false);
    expect(exit).toHaveBeenCalledWith(1);
    expect(onError).toHaveBeenCalledWith('boot_infra_unavailable', expect.objectContaining({
      message: 'db down',
    }));
  });

  test('does not exit outside production', async () => {
    const exit = jest.fn();
    const onError = jest.fn();

    const result = await assertProductionInfrastructureOrExit({
      env: { NODE_ENV: 'test' },
      connectRedis: async () => { throw new Error('should not run'); },
      verifyRedis: async () => { throw new Error('should not run'); },
      connectDb: async () => { throw new Error('should not run'); },
      exit,
      onError,
    });

    expect(result.ok).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('succeeds in production when dependencies are healthy and yields redis client callback', async () => {
    const exit = jest.fn();
    const onError = jest.fn();
    const onRedisClient = jest.fn();
    const redisClient = { ping: jest.fn() };

    const result = await assertProductionInfrastructureOrExit({
      env: { NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' },
      connectRedis: async () => redisClient,
      verifyRedis: async () => {},
      connectDb: async () => {},
      onRedisClient,
      exit,
      onError,
    });

    expect(result.ok).toBe(true);
    expect(onRedisClient).toHaveBeenCalledWith(redisClient);
    expect(onError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  test('logs unknown when thrown value is not an Error', async () => {
    const exit = jest.fn();
    const onError = jest.fn();

    const result = await assertProductionInfrastructureOrExit({
      env: { NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' },
      connectRedis: async () => { throw 'boom'; },
      verifyRedis: async () => {},
      connectDb: async () => {},
      exit,
      onError,
    });

    expect(result.ok).toBe(false);
    expect(onError).toHaveBeenCalledWith('boot_infra_unavailable', expect.objectContaining({
      message: 'unknown',
    }));
    expect(exit).toHaveBeenCalledWith(1);
  });
});