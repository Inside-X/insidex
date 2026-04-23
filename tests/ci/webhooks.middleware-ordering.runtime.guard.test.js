import { jest } from '@jest/globals';
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

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('x-request-id', 'cid-runtime-stripe-1')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send('{"any":"partial');

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
