import { createSimpleRedisClient } from './simple-redis-client.js';

let cachedClient = null;

async function resolveRedisFactory() {
  const mod = await import('redis');
  if (typeof mod.createClient !== 'function') {
    throw new Error('redis package does not expose createClient');
  }
  return mod.createClient;
}

export async function connectRefreshTokenRedis({ env = process.env, required = env.NODE_ENV === 'production' } = {}) {
  if (cachedClient) {
    return cachedClient;
  }

  const redisUrl = String(env.REDIS_URL || '').trim();
  if (!redisUrl) {
    if (required) {
      throw new Error('REDIS_URL is required for refresh token storage');
    }
    return null;
  }

  const createClient = await resolveRedisFactory();
  const wrapper = createSimpleRedisClient({
    required,
    createClient: () => createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (attempt) => Math.min(attempt * 50, 2_000),
      },
    }),
  });

  cachedClient = await wrapper.connect();
  return cachedClient;
}

export function resetRefreshTokenRedisClientForTests() {
  cachedClient = null;
}