import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';

const pass = (_r, _s, n) => n?.();
const schemaMocks = () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } });

describe('payments.routes', () => {
  test('create-intent branches', async () => {
    const prisma = { product: { findMany: jest.fn() } };
    const orderRepository = { createPendingPaymentOrder: jest.fn() };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    // Safe in this suite: we force preflight success so branch tests reach validation/business logic,
    // while still asserting the preflight runs to avoid accidentally bypassing production safeguards.
    const assertDatabaseReady = jest.fn().mockResolvedValue(undefined);

    const routes = await loadRoute('../../src/routes/payments.routes.js', {
      '../../src/validation/schemas/index.js': () => schemaMocks(),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass }),
      '../../src/lib/prisma.js': () => ({ default: prisma }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError: jest.fn(() => false) }),
    });

    const h = routes[0].handlers.at(-1);
    const next = jest.fn();

    let req = { body: { currency: 'JPY', items: [], idempotencyKey: 'k', email: 'e' }, auth: { sub: 'u1', isGuest: false } };
    let res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, next);
    expect(sendApiError).toHaveBeenCalled();

    prisma.product.findMany.mockResolvedValueOnce([]);
    req = { body: { currency: 'EUR', items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k', email: 'e' }, auth: { sub: 'u1', isGuest: false } };
    res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);

    prisma.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '10.00' }]);
    orderRepository.createPendingPaymentOrder.mockResolvedValueOnce({ order: { id: 'o1', stripePaymentIntentId: 'pi1' }, replayed: false });
    req = { body: { currency: 'EUR', items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k', email: 'e' }, auth: { sub: 'u1', isGuest: false } };
    res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);

    prisma.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '10.00' }]);
    orderRepository.createPendingPaymentOrder.mockResolvedValueOnce({ order: { id: 'o2', stripePaymentIntentId: null }, replayed: true });
    req = { body: { items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k2', email: 'e2' }, auth: { sub: 'u1', isGuest: true } };
    res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: 'EUR', paymentIntentId: expect.stringMatching(/^pi_/) }) }));
    expect(assertDatabaseReady).toHaveBeenCalledTimes(4);
  });

  test('create-intent fails closed with 503 on dependency outage before business logic', async () => {
    const prisma = { product: { findMany: jest.fn() } };
    const orderRepository = { createPendingPaymentOrder: jest.fn() };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const logger = { error: jest.fn() };
    const outage = Object.assign(new Error('db timeout'), { code: 'ETIMEDOUT' });
    const assertDatabaseReady = jest.fn().mockRejectedValue(outage);
    const isDependencyUnavailableError = jest.fn((error) => error?.code === 'ETIMEDOUT');

    const routes = await loadRoute('../../src/routes/payments.routes.js', {
      '../../src/validation/schemas/index.js': () => schemaMocks(),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass }),
      '../../src/lib/prisma.js': () => ({ default: prisma }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
    });

    const h = routes[0].handlers.at(-1);
    const req = { body: { currency: 'EUR', items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k1234567890', email: 'e' }, auth: { sub: 'u1', isGuest: false }, get: jest.fn(() => 'rid-1') };
    const res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, jest.fn());

    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(orderRepository.createPendingPaymentOrder).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({ reasonCode: 'db_unavailable', correlationId: 'rid-1' }));
  });

  test('create-intent dependency log uses requestId and error message fallbacks', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const logger = { error: jest.fn() };
    const outage = new Error('transient dependency failure');

    const routes = await loadRoute('../../src/routes/payments.routes.js', {
      '../../src/validation/schemas/index.js': () => schemaMocks(),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass }),
      '../../src/lib/prisma.js': () => ({ default: { product: { findMany: jest.fn() } } }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { createPendingPaymentOrder: jest.fn() } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockRejectedValue(outage), isDependencyUnavailableError: jest.fn(() => true) }),
    });

    const h = routes[0].handlers.at(-1);
    const req = { body: { currency: 'EUR', items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k1234567890', email: 'e' }, auth: { sub: 'u1', isGuest: false }, requestId: 'req-direct-id', get: jest.fn() };
    const res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({ reason: 'transient dependency failure', correlationId: 'req-direct-id' }));
    expect(req.get).not.toHaveBeenCalled();
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
  });

  test('create-intent dependency log falls back to unknown correlation id', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const logger = { error: jest.fn() };
    const routes = await loadRoute('../../src/routes/payments.routes.js', {
      '../../src/validation/schemas/index.js': () => schemaMocks(),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass }),
      '../../src/lib/prisma.js': () => ({ default: { product: { findMany: jest.fn() } } }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { createPendingPaymentOrder: jest.fn() } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockRejectedValue(new Error('outage')), isDependencyUnavailableError: jest.fn(() => true) }),
    });

    const h = routes[0].handlers.at(-1);
    const req = { body: { currency: 'EUR', items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k1234567890', email: 'e' }, auth: { sub: 'u1', isGuest: false }, get: jest.fn(() => undefined) };
    const res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };
    await h(req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({ correlationId: 'unknown' }));
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
  });

});