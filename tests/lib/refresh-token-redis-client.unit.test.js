import {
  connectRefreshTokenRedis,
  resetRefreshTokenRedisClientForTests,
} from '../../src/lib/refresh-token-redis-client.js';

describe('refresh-token-redis-client failure paths', () => {
  afterEach(() => {
    resetRefreshTokenRedisClientForTests();
  });

  test('returns null when REDIS_URL is missing and redis is optional', async () => {
    await expect(connectRefreshTokenRedis({ env: { REDIS_URL: '' }, required: false })).resolves.toBeNull();
  });

  test('throws when REDIS_URL is missing and redis is required', async () => {
    await expect(connectRefreshTokenRedis({ env: { REDIS_URL: '' }, required: true })).rejects.toThrow(
      'REDIS_URL is required for refresh token storage',
    );
  });

  test('propagates dynamic import/connect failure when REDIS_URL is set but redis module is unavailable', async () => {
    await expect(
      connectRefreshTokenRedis({ env: { REDIS_URL: 'redis://localhost:6379' }, required: true }),
    ).rejects.toThrow(/redis|Cannot find module/i);
  });
});