import { jest } from '@jest/globals';
import {
  createRateLimiter,
  endpointToken,
  resolveClientIp,
  apiRateLimiter,
  resetRateLimiters,
  setRateLimitRedisClient,
} from '../../src/middlewares/rateLimit.js';
import authRateLimiter, { authRateLimiter as namedAuthRateLimiter } from '../../src/middlewares/authRateLimiter.js';
import { strictAuthRateLimiter } from '../../src/middlewares/rateLimit.js';
import { createFakeRedisClient } from '../helpers/fake-redis-client.js';

function reqBase(overrides = {}) {
  return {
    ip: '::ffff:127.0.0.1',
    socket: { remoteAddress: '::ffff:127.0.0.1' },
    headers: {},
    app: { get: () => false },
    path: '/v1/public/items',
    ...overrides,
  };
}

describe('rateLimit helpers', () => {
  beforeEach(() => {
    setRateLimitRedisClient(createFakeRedisClient());
    resetRateLimiters();
  });

  test('resolveClientIp handles direct ipv4 mapping', () => {
    expect(resolveClientIp(reqBase())).toBe('127.0.0.1');
  });

  test('resolveClientIp validates trusted x-forwarded-for', () => {
    const req = reqBase({ app: { get: () => true }, headers: { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' } });
    expect(resolveClientIp(req)).toBe('127.0.0.1');
  });

  test('resolveClientIp rejects malformed x-forwarded-for', () => {
    const req = reqBase({ app: { get: () => true }, headers: { 'x-forwarded-for': 'invalid-ip' } });
    expect(() => resolveClientIp(req)).toThrow('x-forwarded-for_malformed');
  });

  test('resolveClientIp rejects unresolved ip', () => {
    const req = reqBase({ ip: 'invalid', socket: { remoteAddress: 'bad' } });
    expect(() => resolveClientIp(req)).toThrow('ip_unresolved');
  });

  test('endpoint token defaults to root', () => {
    expect(endpointToken({ path: '/' })).toBe('root');
  });

  test('middleware returns 503 when backend fails', async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      code: 'X',
      message: 'Y',
      keyBuilder: () => 'rate:root:127.0.0.1',
      store: { increment: async () => { throw new Error('store down'); } },
    });
    const res = { statusCode: null, status(code) { this.statusCode = code; return this; }, json() { return this; } };

    await limiter(reqBase(), { status: () => ({ json: () => null }) }, next);

    expect(res.statusCode).toBe(503);
  });

  test('resolveClientIp rejects spoofing when proxy is not trusted', () => {
    const req = reqBase({ headers: { 'x-forwarded-for': '8.8.8.8' } });
    expect(() => resolveClientIp(req)).toThrow('x-forwarded-for_not_trusted');
  });

  test('apiRateLimiter builds endpoint+ip key and enforces limits', async () => {
    process.env.API_RATE_WINDOW_MS = '100';
    process.env.API_RATE_MAX = '1';
    resetRateLimiters();

    const req = reqBase({ path: '/catalog/search' });
    const next = jest.fn();
    const res1 = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status() { return this; }, json() { return this; } };
    await apiRateLimiter(req, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    const res2 = { statusCode: null, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json() { return this; } };
    await apiRateLimiter(req, res2, jest.fn());
    expect(res2.statusCode).toBe(429);
  });

  test('authRateLimiter re-exports strict limiter', () => {
    expect(namedAuthRateLimiter).toBe(strictAuthRateLimiter);
    expect(authRateLimiter).toBe(strictAuthRateLimiter);
  });

  test('resolveClientIp rejects when ip fields are absent', () => {
    const req = { headers: {}, app: { get: () => false } };
    expect(() => resolveClientIp(req)).toThrow('ip_unresolved');
  });

  test('endpoint token can use originalUrl fallback', () => {
    expect(endpointToken({ originalUrl: '/foo/bar?x=1' })).toBe('foo:bar');
  });

  test('limiter works when response has no setHeader function', async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 5,
      code: 'X',
      message: 'Y',
      keyBuilder: () => 'rate:root:127.0.0.1',
      store: { increment: async () => ({ totalHits: 1, resetTime: new Date(Date.now() + 1000) }) },
    });
    const next = jest.fn();

    await limiter(reqBase(), { status: () => ({ json: () => null }) }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});