import { jest } from '@jest/globals';
import { strictAuthRateLimiter, resetRateLimiters } from '../../src/middlewares/rateLimit.js';

function buildReq(ip = '127.0.0.1') {
  return {
    ip,
    path: '/auth/login',
    headers: {},
    app: { get: () => false },
    socket: { remoteAddress: ip },
  };
}

function buildRes() {
  return {
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('authRateLimiter attack scenarios', () => {
  beforeEach(() => {
    process.env.AUTH_RATE_WINDOW_MS = '40';
    process.env.AUTH_RATE_MAX = '4';
    resetRateLimiters();
  });

  test('1 to 4 attempts are allowed', async () => {
    for (let i = 0; i < 4; i += 1) {
      const next = jest.fn();
      await strictAuthRateLimiter(buildReq('10.0.0.1'), buildRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  test('5th attempt is blocked', async () => {
    for (let i = 0; i < 4; i += 1) {
      await strictAuthRateLimiter(buildReq('10.0.0.2'), buildRes(), jest.fn());
    }
    const res = buildRes();

    await strictAuthRateLimiter(buildReq('10.0.0.2'), res, jest.fn());

    expect(res.statusCode).toBe(429);
  });

  test('attempt remains blocked in same window', async () => {
    for (let i = 0; i < 5; i += 1) {
      await strictAuthRateLimiter(buildReq('10.0.0.3'), buildRes(), jest.fn());
    }
    const res = buildRes();

    await strictAuthRateLimiter(buildReq('10.0.0.3'), res, jest.fn());

    expect(res.statusCode).toBe(429);
  });

  test('counter resets after ttl', async () => {
    for (let i = 0; i < 5; i += 1) {
      await strictAuthRateLimiter(buildReq('10.0.0.4'), buildRes(), jest.fn());
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const next = jest.fn();

    await strictAuthRateLimiter(buildReq('10.0.0.4'), buildRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});