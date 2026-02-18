import { logger } from '../utils/logger.js';

const LUA_INCREMENT_WITH_TTL = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

function nowPlus(ms) {
  return new Date(Date.now() + ms);
}

export function createRateLimitRedisStore({ getRedisClient } = {}) {
  if (typeof getRedisClient !== 'function') {
    throw new Error('createRateLimitRedisStore requires a getRedisClient function');
  }

  async function increment(key, windowMs) {
    const redisClient = getRedisClient();

    if (!redisClient) {
      const error = new Error('Redis client unavailable');
      logger.error('rate_limit_backend_down', {
        event: 'rate_limit_backend_down',
        key,
        message: error.message,
      });
      throw error;
    }

    try {
      const response = await redisClient.eval(LUA_INCREMENT_WITH_TTL, {
        keys: [key],
        arguments: [String(windowMs)],
      });
      const totalHits = Number(response?.[0] ?? 0);
      const ttlMs = Number(response?.[1] ?? windowMs);
      return {
        totalHits,
        resetTime: nowPlus(ttlMs > 0 ? ttlMs : windowMs),
        source: 'redis',
      };
    } catch (error) {
      logger.error('rate_limit_backend_down', {
        event: 'rate_limit_backend_down',
        key,
        message: error.message,
      });
      throw error;
    }
  }

  return {
    increment,
    reset() {
      const redisClient = getRedisClient();
      if (redisClient && typeof redisClient.flushAll === 'function') {
        redisClient.flushAll();
      }
    },
    _script: LUA_INCREMENT_WITH_TTL,
  };
}

export { LUA_INCREMENT_WITH_TTL };

export default createRateLimitRedisStore;