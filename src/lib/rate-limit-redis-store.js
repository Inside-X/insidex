import { createRedisClient } from './simple-redis-client.js';

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const KEY_PREFIX = 'ratelimit';

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]

local min_score = now - window_ms
redis.call('ZREMRANGEBYSCORE', key, 0, min_score)
redis.call('ZADD', key, now, member)

local count = redis.call('ZCARD', key)
redis.call('PEXPIRE', key, window_ms)

if count > max_requests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_ms = window_ms

  if oldest[2] then
    retry_ms = math.max(1, window_ms - (now - tonumber(oldest[2])))
  end

  return {0, count, retry_ms}
end

return {1, count, 0}
`;

function normalizeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

let sharedClient = null;
let sharedConnectPromise = null;

export function createRedisRateLimitStore(options = {}) {
  const redisUrl = options.redisUrl || process.env.REDIS_URL || DEFAULT_REDIS_URL;
  const keyPrefix = options.keyPrefix || process.env.RATE_LIMIT_KEY_PREFIX || KEY_PREFIX;
  const namespace = options.namespace || process.env.RATE_LIMIT_NAMESPACE || 'api';
  const ttlJitterMs = normalizeInteger(process.env.RATE_LIMIT_TTL_JITTER_MS, 250);
  const client = options.client || getSharedClient(redisUrl);

  async function consume({ key, now, windowMs, max }) {
    const window = normalizeInteger(windowMs, 60_000);
    const limit = normalizeInteger(max, 120);
    const member = `${now}-${Math.random().toString(36).slice(2, 12)}`;
    const redisKey = `${keyPrefix}:${namespace}:${key}`;

    const result = await client.eval(SLIDING_WINDOW_SCRIPT, {
      keys: [redisKey],
      arguments: [String(now), String(window + ttlJitterMs), String(limit), member],
    });

    return {
      allowed: Number(result?.[0]) === 1,
      count: Number(result?.[1] || 0),
      retryAfterMs: Number(result?.[2] || 0),
    };
  }

  async function reset() {
    const pattern = `${keyPrefix}:${namespace}:*`;
    const keys = [];

    for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }

    if (keys.length > 0) await client.del(keys);
  }

  return { consume, reset, kind: 'redis-sliding-window' };
}

function getSharedClient(redisUrl) {
  if (!sharedClient) {
    sharedClient = createRedisClient({ url: redisUrl });
    sharedClient.on('error', () => {});
  }

  async function ensureConnected() {
    if (!sharedConnectPromise) {
      sharedConnectPromise = sharedClient.connect().catch((error) => {
        sharedConnectPromise = null;
        throw error;
      });
    }
    await sharedConnectPromise;
  }

  return {
    async eval(script, payload) {
      await ensureConnected();
      return sharedClient.eval(script, payload);
    },
    async *scanIterator(payload) {
      await ensureConnected();
      let cursor = '0';

      do {
        const result = await sharedClient.scan(cursor, payload);
        cursor = String(result?.[0] || '0');
        const keys = Array.isArray(result?.[1]) ? result[1] : [];

        for (const key of keys) {
          yield key;
        }
      } while (cursor !== '0');
    },
    async del(keys) {
      await ensureConnected();
      return sharedClient.del(keys);
    },
  };
}

export async function resetRedisRateLimitStore() {
  if (sharedClient?.isOpen) await sharedClient.quit();
  sharedClient = null;
  sharedConnectPromise = null;
}

export { SLIDING_WINDOW_SCRIPT };

export default createRedisRateLimitStore;