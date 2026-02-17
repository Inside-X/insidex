import { resolveIdentifier, resolveRouteScope } from '../../src/middlewares/rateLimit.js';
import createRateLimiter from '../../src/middlewares/rateLimit.js';

function createMockResponse() {
  return {
    headers: {},
    statusCode: null,
    jsonPayload: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
  };
}

function createSlidingStore() {
  const buckets = new Map();

  return {
    async consume({ key, now, windowMs, max }) {
      const entries = buckets.get(key) || [];
      const valid = entries.filter((timestamp) => timestamp > now - windowMs);
      valid.push(now);
      buckets.set(key, valid);

      if (valid.length > max) {
        const retryAfterMs = windowMs - (now - valid[0]);
        return { allowed: false, count: valid.length, retryAfterMs };
      }

      return { allowed: true, count: valid.length, retryAfterMs: 0 };
    },
    async reset() {
      buckets.clear();
    },
  };
}

async function runLimiter(limiter, req) {
  const res = createMockResponse();
  let passed = false;

  limiter(req, res, () => {
    passed = true;
  });

  await new Promise((resolve) => setImmediate(resolve));

  return { res, passed };
}

describe('rate limiter redis semantics', () => {
  test('builds isolated keys for sensitive scopes', () => {
    expect(resolveRouteScope({ originalUrl: '/api/auth/login' })).toBe('auth');
    expect(resolveRouteScope({ originalUrl: '/api/checkout/session' })).toBe('checkout');
    expect(resolveRouteScope({ originalUrl: '/api/orders' })).toBe('orders');
    expect(resolveRouteScope({ originalUrl: '/api/webhooks/stripe' })).toBe('webhooks');

    const key = resolveIdentifier({
      ip: '203.0.113.5',
      method: 'POST',
      baseUrl: '/api/auth',
      path: '/login',
      originalUrl: '/api/auth/login',
    });

    expect(key).toContain('auth:203.0.113.5:POST:/api/auth');
  });

  test('simulates ip rotation under concurrent volume', async () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      code: 'RATE_LIMITED',
      message: 'limited',
      namespace: 'auth',
      store: createSlidingStore(),
    });

    const requestSet = [];

    for (let i = 0; i < 20; i += 1) {
      const ip = `198.51.100.${(i % 5) + 1}`;
      requestSet.push(runLimiter(limiter, {
        ip,
        method: 'POST',
        baseUrl: '/api/auth',
        path: '/login',
        originalUrl: '/api/auth/login',
        requestId: `req-${i}`,
      }));
    }

    const results = await Promise.all(requestSet);
    const denied = results.filter((result) => result.res.statusCode === 429);
    const passed = results.filter((result) => result.passed);

    expect(denied.length).toBe(5);
    expect(passed.length).toBe(15);
    for (const denial of denied) {
      expect(denial.res.headers['retry-after']).toBeGreaterThanOrEqual(1);
      expect(denial.res.jsonPayload.error.code).toBe('RATE_LIMITED');
    }
  });

  test('shared store behaves consistently across two instances (cluster-safe)', async () => {
    const sharedStore = createSlidingStore();

    const instanceA = createRateLimiter({
      windowMs: 10_000,
      max: 2,
      code: 'RATE_LIMITED',
      message: 'limited',
      namespace: 'orders',
      store: sharedStore,
    });

    const instanceB = createRateLimiter({
      windowMs: 10_000,
      max: 2,
      code: 'RATE_LIMITED',
      message: 'limited',
      namespace: 'orders',
      store: sharedStore,
    });

    await runLimiter(instanceA, { ip: '203.0.113.99', method: 'GET', baseUrl: '/api/orders', path: '/', originalUrl: '/api/orders' });
    await runLimiter(instanceB, { ip: '203.0.113.99', method: 'GET', baseUrl: '/api/orders', path: '/', originalUrl: '/api/orders' });
    const blocked = await runLimiter(instanceA, { ip: '203.0.113.99', method: 'GET', baseUrl: '/api/orders', path: '/', originalUrl: '/api/orders', requestId: 'cluster-3' });

    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.passed).toBe(false);
  });
});