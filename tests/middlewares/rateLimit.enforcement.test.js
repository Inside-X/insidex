import { jest } from '@jest/globals';
import { createRateLimiter } from '../../src/middlewares/rateLimit.js';

function buildReq({ ip = '127.0.0.1', path = '/auth/login', headers = {}, trustProxy = false } = {}) {
  return {
    ip,
    path,
    headers,
    app: { get: () => trustProxy },
    socket: { remoteAddress: ip },
  };
}

function buildRes() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

describe('rate limit middleware enforcement', () => {
  test('allows request under limit', async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 2,
      code: 'LIMIT',
      message: 'Too many',
      keyBuilder: () => 'rate:auth:127.0.0.1',
    });
    const next = jest.fn();

    await limiter(buildReq(), buildRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('blocks request with 429 when limit exceeded', async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      code: 'LIMIT',
      message: 'Too many',
      keyBuilder: () => 'rate:auth:127.0.0.1',
    });

    await limiter(buildReq(), buildRes(), jest.fn());
    const res = buildRes();
    await limiter(buildReq(), res, jest.fn());

    expect(res.statusCode).toBe(429);
  });

  test('resets after ttl', async () => {
    const limiter = createRateLimiter({
      windowMs: 20,
      max: 1,
      code: 'LIMIT',
      message: 'Too many',
      keyBuilder: () => 'rate:auth:127.0.0.1',
    });

    await limiter(buildReq(), buildRes(), jest.fn());
    await new Promise((resolve) => setTimeout(resolve, 25));
    const next = jest.fn();
    await limiter(buildReq(), buildRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('rejects ip spoofing when proxy is not trusted', async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      code: 'LIMIT',
      message: 'Too many',
      keyBuilder: (req) => {
        if (req.headers['x-forwarded-for']) throw new Error('spoof');
        return 'rate:auth:127.0.0.1';
      },
    });

    const res = buildRes();
    await limiter(buildReq({ headers: { 'x-forwarded-for': '8.8.8.8' } }), res, jest.fn());

    expect(res.statusCode).toBe(400);
  });

  test('rejects malformed forwarded header when trust proxy is enabled', async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 10,
      code: 'LIMIT',
      message: 'Too many',
      keyBuilder: (req) => {
        const xff = req.headers['x-forwarded-for'];
        if (xff && xff.includes('not-an-ip')) {
          throw new Error('malformed');
        }
        return 'rate:auth:127.0.0.1';
      },
    });

    const res = buildRes();
    await limiter(buildReq({ trustProxy: true, headers: { 'x-forwarded-for': 'not-an-ip' } }), res, jest.fn());

    expect(res.statusCode).toBe(400);
  });
});