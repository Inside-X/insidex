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

function createMemoryFallback() {
  const buckets = new Map();

  return {
    increment(key, windowMs) {
      const now = Date.now();
      const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };
      if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
      }
      bucket.count += 1;
      buckets.set(key, bucket);
      return { totalHits: bucket.count, resetTime: new Date(bucket.resetAt), source: 'memory' };
    },
    reset() {
      buckets.clear();
    },
  };
}

export function createRateLimitRedisStore({ redisClient, fallbackMode = 'strict' } = {}) {
  const memoryFallback = createMemoryFallback();

  async function increment(key, windowMs) {
    if (!redisClient) {
      return handleRedisFailure(new Error('Redis client unavailable'), key, windowMs);
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
      return handleRedisFailure(error, key, windowMs);
    }
  }

  function handleRedisFailure(error, key, windowMs) {
    logger.error('rate_limit_redis_failure', {
      key,
      fallbackMode,
      message: error.message,
    });

    if (fallbackMode === 'graceful') {
      logger.warn('rate_limit_memory_fallback_activated', { key });
      return memoryFallback.increment(key, windowMs);
    }

    throw error;
  }

  function reset() {
    memoryFallback.reset();
  }

  return {
    increment,
    reset,
    _script: LUA_INCREMENT_WITH_TTL,
  };
}

export { LUA_INCREMENT_WITH_TTL };

export default createRateLimitRedisStore;