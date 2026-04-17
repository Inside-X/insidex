import { jest } from '@jest/globals';
import http from 'node:http';
import request from 'supertest';

function buildRawBodySpy() {
  return jest.fn((stream, options, callback) => {
    const payload = Buffer.from('{}');
    if (typeof callback === 'function') {
      callback(null, payload);
      return undefined;
    }
    return Promise.resolve(payload);
  });
}

async function setupRateLimitModuleSpy() {
  const actualRateLimit = await import('../../src/middlewares/rateLimit.js');
  const apiRateLimiterSpy = jest.fn((req, res, next) => actualRateLimit.apiRateLimiter(req, res, next));

  await jest.unstable_mockModule('../../src/middlewares/rateLimit.js', () => ({
    ...actualRateLimit,
    apiRateLimiter: apiRateLimiterSpy,
  }));

  return { actualRateLimit, apiRateLimiterSpy };
}

describe('webhooks middleware ordering runtime guard (real app wiring)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalStrict = process.env.WEBHOOK_IDEMPOTENCY_STRICT;
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
    process.env.CORS_ORIGIN = 'https://allowed.example';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalStrict === undefined) delete process.env.WEBHOOK_IDEMPOTENCY_STRICT;
    else process.env.WEBHOOK_IDEMPOTENCY_STRICT = originalStrict;

    if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalCorsOrigin;

    jest.clearAllMocks();
    jest.resetModules();
  });

  test('POST /api/webhooks/stripe short-circuits 503 before raw-body, verification, DB preflight, and /api rate limiter', async () => {
    jest.resetModules();

    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const stripeConstructEvent = jest.fn();
    const paypalVerify = jest.fn();
    const assertDatabaseReady = jest.fn(() => {
      throw new Error('db preflight must not be called when redis idempotency backend is unavailable');
    });
    const rawBodySpy = buildRawBodySpy();

    await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
    await jest.unstable_mockModule('../../src/lib/stripe.js', () => ({ default: { webhooks: { constructEvent: stripeConstructEvent } } }));
    await jest.unstable_mockModule('../../src/lib/paypal.js', () => ({ default: { webhooks: { verifyWebhookSignature: paypalVerify } } }));
    await jest.unstable_mockModule('../../src/lib/critical-dependencies.js', () => ({
      assertDatabaseReady,
      getDependencyReasonCode: (dependency) => (dependency === 'redis' ? 'redis_unavailable' : dependency === 'db' ? 'db_unavailable' : 'dependency_unknown'),
      isDependencyUnavailableError: jest.fn(() => false),
    }));
    await jest.unstable_mockModule('raw-body', () => ({ default: rawBodySpy }));

    const { actualRateLimit, apiRateLimiterSpy } = await setupRateLimitModuleSpy();
    const rateLimitRedisClient = {
      incr: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    actualRateLimit.setRateLimitRedisClient(rateLimitRedisClient);

    const app = (await import('../../src/app.js')).default;
    app.locals.webhookIdempotencyRedisClient = { incr: jest.fn().mockResolvedValue(1) }; // idempotency backend only: unavailable for set(NX)

    const server = app.listen(0);
    let req;
    let res;

    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      const { port } = server.address();

      res = await new Promise((resolve, reject) => {
        const responseTimeout = setTimeout(() => {
          reject(new Error('stripe runtime guard response timeout'));
        }, 1500);

        req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: '/api/webhooks/stripe',
            method: 'POST',
            agent: false,
            headers: {
              'x-request-id': 'cid-runtime-stripe-1',
              'stripe-signature': 'sig',
              'content-type': 'application/json',
              connection: 'close',
            },
          },
          (incomingResponse) => {
            clearTimeout(responseTimeout);
            resolve(incomingResponse);
          }
        );

        req.on('error', (error) => {
          clearTimeout(responseTimeout);
          reject(error);
        });
        req.end('{"any":"partial');
      });
    } finally {
      if (res) {
        res.resume();
        if (!res.destroyed) {
          res.destroy();
        }
      }

      if (req) {
        req.destroy();
      }

      const closeServer = () =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });

      try {
        await Promise.race([
          closeServer(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('server close timeout')), 500)),
        ]);
      } catch {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        if (typeof server.closeIdleConnections === 'function') {
          server.closeIdleConnections();
        }
        await closeServer();
      }
    }
      
    expect(res.statusCode).toBe(503);
    expect(rawBodySpy).not.toHaveBeenCalled();
    expect(stripeConstructEvent).not.toHaveBeenCalled();
    expect(paypalVerify).not.toHaveBeenCalled();
    expect(assertDatabaseReady).not.toHaveBeenCalled();
    expect(apiRateLimiterSpy).not.toHaveBeenCalled();
    expect(rateLimitRedisClient.incr).not.toHaveBeenCalled();
    expect(rateLimitRedisClient.set).not.toHaveBeenCalled();

    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({
        endpoint: 'POST /api/webhooks/stripe',
        reasonCode: 'redis_unavailable',
        correlationId: 'cid-runtime-stripe-1',
      })
    );
  });

  test('POST /api/webhooks/paypal short-circuits 503 before verification, DB preflight, and /api rate limiter', async () => {
    jest.resetModules();

    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const stripeConstructEvent = jest.fn();
    const paypalVerify = jest.fn();
    const assertDatabaseReady = jest.fn(() => {
      throw new Error('db preflight must not be called when redis idempotency backend is unavailable');
    });
    const rawBodySpy = buildRawBodySpy();

    await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
    await jest.unstable_mockModule('../../src/lib/stripe.js', () => ({ default: { webhooks: { constructEvent: stripeConstructEvent } } }));
    await jest.unstable_mockModule('../../src/lib/paypal.js', () => ({ default: { webhooks: { verifyWebhookSignature: paypalVerify } } }));
    await jest.unstable_mockModule('../../src/lib/critical-dependencies.js', () => ({
      assertDatabaseReady,
      getDependencyReasonCode: (dependency) => (dependency === 'redis' ? 'redis_unavailable' : dependency === 'db' ? 'db_unavailable' : 'dependency_unknown'),
      isDependencyUnavailableError: jest.fn(() => false),
    }));
    await jest.unstable_mockModule('raw-body', () => ({ default: rawBodySpy }));

    const { actualRateLimit, apiRateLimiterSpy } = await setupRateLimitModuleSpy();
    const rateLimitRedisClient = {
      incr: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    actualRateLimit.setRateLimitRedisClient(rateLimitRedisClient);

    const app = (await import('../../src/app.js')).default;
    app.locals.webhookIdempotencyRedisClient = { incr: jest.fn().mockResolvedValue(1) }; // idempotency backend only: unavailable for set(NX)

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('x-request-id', 'cid-runtime-paypal-1')
      .set('content-type', 'application/json')
      .send('{"any":"payload"}');

    expect(res.statusCode).toBe(503);
    expect(rawBodySpy).not.toHaveBeenCalled();
    expect(stripeConstructEvent).not.toHaveBeenCalled();
    expect(paypalVerify).not.toHaveBeenCalled();
    expect(assertDatabaseReady).not.toHaveBeenCalled();
    expect(apiRateLimiterSpy).not.toHaveBeenCalled();
    expect(rateLimitRedisClient.incr).not.toHaveBeenCalled();
    expect(rateLimitRedisClient.set).not.toHaveBeenCalled();

    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({
        endpoint: 'POST /api/webhooks/paypal',
        reasonCode: 'redis_unavailable',
        correlationId: 'cid-runtime-paypal-1',
      })
    );
  });
});
