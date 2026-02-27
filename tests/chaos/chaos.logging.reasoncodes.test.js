import { jest } from '@jest/globals';
import { loadRoute } from '../routes/_router-helper.js';

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(), locals: {} };
  return res;
}

describe('chaos logging reason codes', () => {
  test('logs redis_unavailable from strict webhook guard with endpoint and correlationId', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';

    jest.resetModules();
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));

    await jest.unstable_mockModule('../../src/utils/logger.js', () => ({ logger }));
    await jest.unstable_mockModule('../../src/utils/api-error.js', () => ({ sendApiError }));
    await jest.unstable_mockModule('../../src/middlewares/rateLimit.js', () => ({ getRateLimitRedisClient: jest.fn(() => ({ incr: jest.fn() })) }));
    await jest.unstable_mockModule('../../src/lib/critical-dependencies.js', () => ({
      assertDatabaseReady: jest.fn().mockResolvedValue(true),
      getDependencyReasonCode: (dependency) => (dependency === 'redis' ? 'redis_unavailable' : 'dependency_unknown'),
    }));

    const { webhookStrictDependencyGuard } = await import('../../src/middlewares/webhookStrictDependencyGuard.js');

    const req = {
      originalUrl: '/api/webhooks/stripe',
      baseUrl: '/api/webhooks',
      path: '/stripe',
      requestId: 'cid-log-redis-1',
      app: { locals: {} },
      get: jest.fn(() => 'cid-log-redis-1'),
    };
    const res = makeRes();

    await webhookStrictDependencyGuard(req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/webhooks/stripe', reasonCode: 'redis_unavailable', correlationId: 'cid-log-redis-1' })
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('logs db_unavailable on orders with reason code and correlationId', async () => {
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const outage = Object.assign(new Error('db down'), { code: 'ECONNRESET' });

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => (_req, _res, next) => next()) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: (_req, _res, next) => next() }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, next) => { req.auth = { sub: 'u1', isGuest: false }; next(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: (_req, _res, next) => next(), enforceOrderOwnership: (_req, _res, next) => next() }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => (_req, _res, next) => next()) }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { createIdempotentWithItemsAndUpdateStock: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/critical-dependencies.js': () => ({
        assertDatabaseReady: jest.fn().mockRejectedValue(outage),
        isDependencyUnavailableError: jest.fn((error) => error?.code === 'ECONNRESET'),
      }),
    });

    const handler = routes.find((route) => route.path === '/').handlers.at(-1);
    const req = { body: { items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'idem-log-db-1' }, auth: { sub: 'u1', isGuest: false }, requestId: 'cid-log-db-1', get: jest.fn() };
    const res = makeRes();

    await handler(req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/orders', reasonCode: 'db_unavailable', correlationId: 'cid-log-db-1' })
    );
  });

  test('logs provider_timeout from paypal webhook verification path with endpoint and correlationId', async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));
    const providerTimeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockRejectedValue(providerTimeout) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim: jest.fn().mockResolvedValue({ accepted: true }) }) }),
      '../../src/middlewares/rateLimit.js': () => ({ getRateLimitRedisClient: jest.fn(() => ({ set: jest.fn(() => 'OK') })) }),
      '../../src/lib/critical-dependencies.js': () => ({ isDependencyUnavailableError: jest.fn((error) => error?.code === 'ETIMEDOUT') }),
      '../../src/middlewares/webhookStrictDependencyGuard.js': () => ({
        sendDependencyUnavailable: (req, res, dependency, error, endpoint) => {
          logger.error('critical_dependency_unavailable', {
            endpoint,
            dependency,
            reasonCode: dependency === 'provider_timeout' ? 'provider_timeout' : 'dependency_unknown',
            reason: error?.code || error?.message,
            correlationId: req.requestId || req.get('x-request-id') || 'unknown',
          });
          return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
        },
      }),
    });

    const paypalHandler = routes.find((route) => route.path === '/paypal').handlers.at(-1);
    const payload = {
      eventId: 'evt-log-timeout-1',
      orderId: 'o1',
      metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'idem-log-timeout-1' },
      payload: { capture: { id: 'cap1', amount: '10.00', currency: 'EUR', status: 'COMPLETED' } },
    };
    const req = {
      body: Buffer.from(JSON.stringify(payload)),
      requestId: 'cid-log-timeout-1',
      app: { locals: {} },
      get: jest.fn((name) => (String(name).toLowerCase() === 'content-length' ? String(Buffer.byteLength(JSON.stringify(payload))) : 'header-value')),
    };
    const res = makeRes();

    await paypalHandler(req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/webhooks/paypal', reasonCode: 'provider_timeout', correlationId: 'cid-log-timeout-1' })
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });
});