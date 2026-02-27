import { jest } from '@jest/globals';
import { loadRoute } from '../routes/_router-helper.js';

const pass = (_req, _res, next) => next();

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(), locals: {} };
  return res;
}

describe('chaos fail-closed money paths', () => {
  test('POST /api/orders returns 503 on db unavailable before any repository mutation', async () => {
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const orderRepository = { createIdempotentWithItemsAndUpdateStock: jest.fn() };
    const outage = Object.assign(new Error('transaction begin failed'), { code: 'ECONNRESET' });

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, next) => { req.auth = { sub: 'u1', isGuest: false }; next(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/critical-dependencies.js': () => ({
        assertDatabaseReady: jest.fn().mockRejectedValue(outage),
        isDependencyUnavailableError: jest.fn((error) => error?.code === 'ECONNRESET'),
      }),
    });

    const handler = routes.find((route) => route.path === '/').handlers.at(-1);
    const req = {
      body: { items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'chaos-idem-orders-0001' },
      auth: { sub: 'u1', isGuest: false },
      get: jest.fn(() => 'cid-orders-chaos-1'),
    };
    const res = makeRes();

    await handler(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
    expect(orderRepository.createIdempotentWithItemsAndUpdateStock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/orders', reasonCode: 'db_unavailable', correlationId: 'cid-orders-chaos-1' })
    );
  });

  test('POST /api/payments/create-intent returns 503 on db unavailable before any prisma write/mutation', async () => {
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const orderRepository = { createPendingPaymentOrder: jest.fn() };
    const prisma = {
      product: { findMany: jest.fn() },
      order: { create: jest.fn(), update: jest.fn() },
    };
    const outage = Object.assign(new Error('db unavailable'), { code: 'ECONNRESET' });

    const routes = await loadRoute('../../src/routes/payments.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { createIntent: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, next) => { req.auth = { sub: 'u2', isGuest: false }; next(); } }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass }),
      '../../src/lib/prisma.js': () => ({ default: prisma }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/critical-dependencies.js': () => ({
        assertDatabaseReady: jest.fn().mockRejectedValue(outage),
        isDependencyUnavailableError: jest.fn((error) => error?.code === 'ECONNRESET'),
      }),
    });

    const handler = routes.find((route) => route.path === '/create-intent').handlers.at(-1);
    const req = {
      body: { currency: 'EUR', items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'chaos-idem-payments-0001' },
      auth: { sub: 'u2', isGuest: false },
      requestId: 'cid-payments-chaos-1',
      get: jest.fn(),
    };
    const res = makeRes();

    await handler(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(orderRepository.createPendingPaymentOrder).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'critical_dependency_unavailable',
      expect.objectContaining({ endpoint: 'POST /api/payments/create-intent', reasonCode: 'db_unavailable', correlationId: 'cid-payments-chaos-1' })
    );
  });
});