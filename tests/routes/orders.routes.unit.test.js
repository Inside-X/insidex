import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass = (_r, _s, n) => n?.();

describe('orders.routes', () => {
  test('create, webhook, get', async () => {
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn().mockResolvedValue({ order: { id: 'o1' }, replayed: false }),
      processPaymentWebhookEvent: jest.fn().mockResolvedValue({ ok: true }),
    };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
    });

    const create = routes.find((r) => r.path === '/' && r.method === 'post');
    let req = { body: { items: [], idempotencyKey: 'k' }, auth: { sub: 'u1', isGuest: false } };
    let res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();
    await create.handlers.at(-1)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const hook = routes.find((r) => r.path === '/webhooks/payments');
    req = { body: {}, get: () => 'bad' };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await hook.handlers.at(-1)(req, res, next);
    expect(sendApiError).toHaveBeenCalled();

    req = { body: { a: 1 }, get: () => 'sec' };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await hook.handlers.at(-1)(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { ok: true } });

    const webhookErr = new Error('repo failed');
    orderRepository.processPaymentWebhookEvent.mockRejectedValueOnce(webhookErr);
    req = { body: { a: 2 }, get: () => 'sec' };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await hook.handlers.at(-1)(req, res, next);
    expect(next).toHaveBeenCalledWith(webhookErr);

    const byId = routes.find((r) => r.method === 'get');
    req = { params: { id: 'i1' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    byId.handlers.at(-1)(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'i1' } });
  });

  test('create endpoint returns 503 when database dependency is unavailable', async () => {
    const outage = new Error('database unavailable');
    const assertDatabaseReady = jest.fn().mockRejectedValue(outage);
    const isDependencyUnavailableError = jest.fn(() => true);
    const logger = { error: jest.fn() };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      processPaymentWebhookEvent: jest.fn(),
    };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
    });

    const create = routes.find((r) => r.path === '/' && r.method === 'post');
    const req = { body: { items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k-1234567890' }, auth: { sub: 'u1', isGuest: false }, get: jest.fn(() => 'req-42') };
    const res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await create.handlers.at(-1)(req, res, next);

    expect(assertDatabaseReady).toHaveBeenCalledTimes(1);
    expect(orderRepository.createIdempotentWithItemsAndUpdateStock).not.toHaveBeenCalled();
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({ reasonCode: 'db_unavailable', reason: 'database unavailable', correlationId: 'req-42' }));
    expect(next).not.toHaveBeenCalled();
  });
});