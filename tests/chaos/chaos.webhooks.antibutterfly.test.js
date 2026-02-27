import { jest } from '@jest/globals';

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn() };
  return res;
}

async function loadGuardWithStrictRedisOutage({ logger, sendApiError }) {
  jest.resetModules();
  await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
  await jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
  await jest.unstable_mockModule('../../src/middlewares/rateLimit.js', () => ({
    // Rate limiter backend is operational for its own path (incr exists),
    // but webhook strict guard requires `set`, so this simulates separated outage.
    getRateLimitRedisClient: jest.fn(() => ({ incr: jest.fn().mockResolvedValue(1) })),
  }));
  await jest.unstable_mockModule('../../src/lib/critical-dependencies.js', () => ({
    assertDatabaseReady: jest.fn().mockResolvedValue(true),
    getDependencyReasonCode: (dependency) => (dependency === 'redis' ? 'redis_unavailable' : 'dependency_unknown'),
  }));

  return import('../../src/middlewares/webhookStrictDependencyGuard.js');
}

describe('chaos webhook anti-butterfly early-fail', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
  });

  test('stripe strict guard fails closed (503) before body/stream access and before expensive verification', async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));
    const { webhookStrictDependencyGuard } = await loadGuardWithStrictRedisOutage({ logger, sendApiError });

    const stripeConstructEvent = jest.fn();
    const paypalVerify = jest.fn();

    const streamTrap = jest.fn(() => {
      throw new Error('stream/read trap must not be called');
    });

    const req = {
      originalUrl: '/api/webhooks/stripe',
      baseUrl: '/api/webhooks',
      path: '/stripe',
      requestId: 'cid-antibutterfly-stripe-1',
      app: { locals: {} },
      get: jest.fn(() => 'cid-antibutterfly-stripe-1'),
      on: streamTrap,
      read: streamTrap,
    };

    Object.defineProperty(req, 'body', {
      get() {
        throw new Error('req.body should not be touched on strict early-fail');
      },
      configurable: true,
    });

    Object.defineProperty(req, 'rawBody', {
      get() {
        throw new Error('req.rawBody should not be touched on strict early-fail');
      },
      configurable: true,
    });

    const res = makeRes();
    const next = jest.fn();

    await webhookStrictDependencyGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(streamTrap).not.toHaveBeenCalled();
    expect(stripeConstructEvent).not.toHaveBeenCalled();
    expect(paypalVerify).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/webhooks/stripe', reasonCode: 'redis_unavailable', correlationId: 'cid-antibutterfly-stripe-1' })
    );
  });

  test('paypal strict guard fails closed (503) before body/stream access and before verify SDK', async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));
    const { webhookStrictDependencyGuard } = await loadGuardWithStrictRedisOutage({ logger, sendApiError });

    const paypalVerify = jest.fn();

    const streamTrap = jest.fn(() => {
      throw new Error('stream/read trap must not be called');
    });

    const req = {
      originalUrl: '/api/webhooks/paypal',
      baseUrl: '/api/webhooks',
      path: '/paypal',
      requestId: 'cid-antibutterfly-paypal-1',
      app: { locals: {} },
      get: jest.fn(() => 'cid-antibutterfly-paypal-1'),
      on: streamTrap,
      read: streamTrap,
    };

    Object.defineProperty(req, 'body', {
      get() {
        throw new Error('req.body should not be touched on strict early-fail');
      },
      configurable: true,
    });

    Object.defineProperty(req, 'raw', {
      get() {
        throw new Error('req.raw should not be touched on strict early-fail');
      },
      configurable: true,
    });

    const res = makeRes();
    const next = jest.fn();

    await webhookStrictDependencyGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    expect(streamTrap).not.toHaveBeenCalled();
    expect(paypalVerify).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/webhooks/paypal', reasonCode: 'redis_unavailable', correlationId: 'cid-antibutterfly-paypal-1' })
    );
  });
});