import { createRateLimitRedisStore } from '../../src/lib/rate-limit-redis-store.js';

function createAtomicRedisMock() {
  const state = new Map();

  return {
    async eval(_script, { keys, arguments: args }) {
      const key = keys[0];
      const ttl = Number(args[0]);
      const now = Date.now();
      const current = state.get(key);

      if (!current || now > current.expiresAt) {
        state.set(key, { count: 1, expiresAt: now + ttl });
      } else {
        current.count += 1;
      }

      const snapshot = state.get(key);
      return [snapshot.count, snapshot.expiresAt - now];
    },
  };
}

describe('rate-limit redis store atomicity', () => {
  test('first request initializes counter and ttl', async () => {
    const store = createRateLimitRedisStore({ redisClient: createAtomicRedisMock() });

    const result = await store.increment('rate:auth:127.0.0.1', 1000);

    expect(result.totalHits).toBe(1);
    expect(result.resetTime).toBeInstanceOf(Date);
    expect(result.source).toBe('redis');
  });

  test('second request increments same key', async () => {
    const store = createRateLimitRedisStore({ redisClient: createAtomicRedisMock() });

    await store.increment('rate:auth:127.0.0.1', 1000);
    const second = await store.increment('rate:auth:127.0.0.1', 1000);

    expect(second.totalHits).toBe(2);
  });

  test('ttl expiration resets counter', async () => {
    const store = createRateLimitRedisStore({ redisClient: createAtomicRedisMock() });

    await store.increment('rate:user:42', 20);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterExpiry = await store.increment('rate:user:42', 20);

    expect(afterExpiry.totalHits).toBe(1);
  });

  test('different keys do not collide', async () => {
    const store = createRateLimitRedisStore({ redisClient: createAtomicRedisMock() });

    const a = await store.increment('rate:auth:1.1.1.1', 1000);
    const b = await store.increment('rate:auth:2.2.2.2', 1000);

    expect(a.totalHits).toBe(1);
    expect(b.totalHits).toBe(1);
  });

  test('concurrent increments stay atomic', async () => {
    const store = createRateLimitRedisStore({ redisClient: createAtomicRedisMock() });

    const calls = Array.from({ length: 20 }, () => store.increment('rate:auth:3.3.3.3', 1000));
    const results = await Promise.all(calls);
    const totals = results.map((entry) => entry.totalHits);

    expect(Math.max(...totals)).toBe(20);
  });

  test('redis unavailable in strict mode throws', async () => {
    const store = createRateLimitRedisStore({
      redisClient: { eval: async () => { throw new Error('down'); } },
      fallbackMode: 'strict',
    });

    await expect(store.increment('rate:auth:9.9.9.9', 1000)).rejects.toThrow('down');
  });

  test('redis unavailable in graceful mode falls back to memory', async () => {
    const store = createRateLimitRedisStore({
      redisClient: { eval: async () => { throw new Error('down'); } },
      fallbackMode: 'graceful',
    });

    const result = await store.increment('rate:auth:9.9.9.9', 1000);

    expect(result.source).toBe('memory');
    expect(result.totalHits).toBe(1);
  });
});

test('missing redis client throws in strict mode', async () => {
  const store = createRateLimitRedisStore();
  await expect(store.increment('rate:auth:none', 1000)).rejects.toThrow('Redis client unavailable');
});

test('reset clears graceful fallback memory state', async () => {
  const store = createRateLimitRedisStore({
    redisClient: { eval: async () => { throw new Error('down'); } },
    fallbackMode: 'graceful',
  });
  await store.increment('rate:auth:reset', 1000);
  store.reset();
  const afterReset = await store.increment('rate:auth:reset', 1000);
  expect(afterReset.totalHits).toBe(1);
});

test('graceful fallback memory resets after ttl expiry', async () => {
  const store = createRateLimitRedisStore({
    redisClient: { eval: async () => { throw new Error('down'); } },
    fallbackMode: 'graceful',
  });

  await store.increment('rate:auth:ttl-reset', 10);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const afterWindow = await store.increment('rate:auth:ttl-reset', 10);

  expect(afterWindow.totalHits).toBe(1);
});