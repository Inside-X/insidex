import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';
const pass = (_r, _s, n) => n?.();

describe('orders.routes', () => {
  test('create, webhook, get', async () => {
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn().mockResolvedValue({ order: { id: 'o1' }, replayed: false }),
      listCustomerOrderVisibility: jest.fn().mockResolvedValue([]),
      processPaymentWebhookEvent: jest.fn().mockResolvedValue({ ok: true }),
      markFulfillmentReady: jest.fn().mockResolvedValue({ id: 'o-ready' }),
      markFulfillmentCompleted: jest.fn().mockResolvedValue({ id: 'o-complete' }),
    };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const create = routes.find((r) => r.path === '/' && r.method === 'post');
    let req = { body: { items: [{ id: 'p1', quantity: 2 }], idempotencyKey: 'k', fulfillment: { mode: 'pickup_local' }, email: 'u1@test.dev' }, auth: { sub: 'u1', isGuest: false } };
    let res = { locals: { implicitGuestToken: 'guest-token-1' }, status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();
    await create.handlers.at(-1)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ guestSessionToken: 'guest-token-1' }),
    }));

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

    const byId = routes.find((r) => r.path === '/:id' && r.method === 'get');
    req = { params: { id: 'i1' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    byId.handlers.at(-1)(req, res);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'i1' } });

    const mine = routes.find((r) => r.path === '/mine' && r.method === 'get');
    req = { auth: { sub: 'u1' }, query: { limit: '12' }, get: jest.fn(() => 'r-1') };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await mine.handlers.at(-1)(req, res, next);
    expect(orderRepository.listCustomerOrderVisibility).toHaveBeenCalledWith({ userId: 'u1', take: 12 });
    expect(res.status).toHaveBeenCalledWith(200);

    const readiness = routes.find((r) => r.path === '/:id/readiness' && r.method === 'post');
    req = { params: { id: 'o-ready' }, body: { target: 'ready_for_pickup', note: 'n' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await readiness.handlers.at(-1)(req, res, next);
    expect(orderRepository.markFulfillmentReady).toHaveBeenCalledWith({
      orderId: 'o-ready',
      target: 'ready_for_pickup',
      actorType: 'admin',
      note: 'n',
    });
    expect(res.status).toHaveBeenCalledWith(200);

    const completion = routes.find((r) => r.path === '/:id/completion' && r.method === 'post');
    req = { params: { id: 'o-complete' }, body: { target: 'collected', note: 'done' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await completion.handlers.at(-1)(req, res, next);
    expect(orderRepository.markFulfillmentCompleted).toHaveBeenCalledWith({
      orderId: 'o-complete',
      target: 'collected',
      actorType: 'admin',
      note: 'done',
    });
    expect(res.status).toHaveBeenCalledWith(200);

    const completionErr = new Error('completion failed');
    orderRepository.markFulfillmentCompleted.mockRejectedValueOnce(completionErr);
    req = { params: { id: 'o-complete' }, body: { target: 'collected' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await completion.handlers.at(-1)(req, res, next);
    expect(next).toHaveBeenCalledWith(completionErr);

    const readinessErr = new Error('readiness failed');
    orderRepository.markFulfillmentReady.mockRejectedValueOnce(readinessErr);
    req = { params: { id: 'o-ready' }, body: { target: 'ready_for_pickup' } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await readiness.handlers.at(-1)(req, res, next);
    expect(next).toHaveBeenCalledWith(readinessErr);
  });

  test('create endpoint returns 503 when database dependency is unavailable', async () => {
    const outage = new Error('database unavailable');
    const assertDatabaseReady = jest.fn().mockRejectedValue(outage);
    const isDependencyUnavailableError = jest.fn(() => true);
    const logger = { error: jest.fn() };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
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

  test('readiness endpoint creates ready communication intent and logs bounded suppression on fail-closed outcome', async () => {
    const createReadyCommunicationIntent = jest.fn()
      .mockResolvedValueOnce({ ok: true, outcome: 'created' })
      .mockResolvedValueOnce({ ok: false, outcome: 'suppressed', reason: 'duplicate_semantic_intent' });
    const logger = { info: jest.fn(), error: jest.fn() };
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn().mockResolvedValue({ id: 'o-ready-1', status: 'paid' }),
      markFulfillmentCompleted: jest.fn(),
    };
    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn() }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({
        createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }),
        createReadyCommunicationIntent,
      }),
    });

    const readiness = routes.find((r) => r.path === '/:id/readiness' && r.method === 'post');
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await readiness.handlers.at(-1)({ params: { id: 'o-ready-1' }, body: { target: 'ready_for_pickup' }, requestId: 'rid-1' }, res, next);
    await readiness.handlers.at(-1)({ params: { id: 'o-ready-1' }, body: { target: 'ready_for_pickup' } }, res, next);

    expect(createReadyCommunicationIntent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      orderId: 'o-ready-1',
      correlationId: 'rid-1',
      authoritativeOrder: expect.objectContaining({ id: 'o-ready-1' }),
    }));
    expect(logger.info).toHaveBeenCalledWith('transactional_comm_intent_suppressed', expect.objectContaining({
      classKey: 'ready',
      orderId: 'o-ready-1',
      reasonCode: 'duplicate_semantic_intent',
      correlationId: 'unknown',
    }));
  });

  test('mine endpoint emits degraded metadata when mapped orders are degraded', async () => {
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn().mockResolvedValue([{
        id: 'ord-1',
        userId: 'u1',
        createdAt: '2026-04-20T08:30:00.000Z',
        status: 'pending',
        fulfillmentMode: '',
        fulfillmentSnapshot: {},
        items: [],
        totalAmount: '12.90',
      }]),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };
    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn() }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const mine = routes.find((r) => r.path === '/mine' && r.method === 'get');
    const req = { auth: { sub: 'u1' }, query: {}, get: jest.fn(() => 'req-degraded') };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await mine.handlers.at(-1)(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        count: 1,
        degraded: true,
        message: 'Some order details are currently limited.',
      }),
    }));
  });

  test('mine endpoint returns 503 when dependency is unavailable', async () => {
    const outage = new Error('database unavailable');
    const assertDatabaseReady = jest.fn().mockRejectedValue(outage);
    const isDependencyUnavailableError = jest.fn(() => true);
    const logger = { error: jest.fn() };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const mine = routes.find((r) => r.path === '/mine' && r.method === 'get');
    const req = { auth: { sub: 'u1' }, query: { limit: '5' }, get: jest.fn(() => 'req-503') };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await mine.handlers.at(-1)(req, res, jest.fn());

    expect(orderRepository.listCustomerOrderVisibility).not.toHaveBeenCalled();
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Order history is temporarily unavailable');
    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({
      endpoint: 'GET /api/orders/mine',
      reasonCode: 'db_unavailable',
      reason: 'database unavailable',
      correlationId: 'req-503',
    }));
  });

  test('mine endpoint forwards non-dependency errors to next', async () => {
    const outage = new Error('unexpected failure');
    const assertDatabaseReady = jest.fn().mockResolvedValue(undefined);
    const isDependencyUnavailableError = jest.fn(() => false);
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn().mockRejectedValue(outage),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn() }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const mine = routes.find((r) => r.path === '/mine' && r.method === 'get');
    const req = { auth: { sub: 'u1' }, query: {}, get: jest.fn(() => undefined) };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await mine.handlers.at(-1)(req, res, next);

    expect(next).toHaveBeenCalledWith(outage);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('mine/:id detail returns customer-safe detail and degraded metadata when needed', async () => {
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      findCustomerOrderDetailVisibility: jest.fn().mockResolvedValue({
        id: 'ord-detail-1',
        userId: 'u1',
        createdAt: '2026-04-20T10:00:00.000Z',
        status: 'pending',
        fulfillmentMode: '',
        fulfillmentSnapshot: {},
        items: [{ quantity: 1, product: { name: 'Inside X Kit' } }],
        totalAmount: '149.90',
      }),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };
    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn() }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const detail = routes.find((r) => r.path === '/mine/:id' && r.method === 'get');
    const req = { auth: { sub: 'u1' }, params: { id: 'ord-detail-1' }, get: jest.fn(() => 'req-detail') };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await detail.handlers.at(-1)(req, res, jest.fn());

    expect(orderRepository.findCustomerOrderDetailVisibility).toHaveBeenCalledWith({ userId: 'u1', orderId: 'ord-detail-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orderId: 'ord-detail-1' }),
      meta: expect.objectContaining({ degraded: true, message: 'Some order details are currently limited.' }),
    }));
  });

  test('mine/:id detail returns not found when order is missing', async () => {
    const sendApiError = jest.fn((_req, res, status, code) => res.status(status).json({ error: { code } }));
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      findCustomerOrderDetailVisibility: jest.fn().mockResolvedValue(null),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };
    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const detail = routes.find((r) => r.path === '/mine/:id' && r.method === 'get');
    const req = { auth: { sub: 'u1' }, params: { id: 'ord-missing' }, get: jest.fn(() => 'req-detail-missing') };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await detail.handlers.at(-1)(req, res, jest.fn());

    expect(sendApiError).toHaveBeenCalledWith(req, res, 404, 'NOT_FOUND', 'Order not found');
  });

  test('mine/:id detail returns 503 on dependency outage and forwards non-dependency errors', async () => {
    const outage = new Error('db unavailable');
    const sendApiError = jest.fn((_req, res, status, code) => res.status(status).json({ error: { code } }));
    const logger = { error: jest.fn() };
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      findCustomerOrderDetailVisibility: jest.fn()
        .mockRejectedValueOnce(outage)
        .mockRejectedValueOnce(new Error('unexpected detail failure')),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };
    const assertDatabaseReady = jest.fn().mockResolvedValue(undefined);
    const isDependencyUnavailableError = jest.fn((error) => error === outage);

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const detail = routes.find((r) => r.path === '/mine/:id' && r.method === 'get');
    const req = { auth: { sub: 'u1' }, params: { id: 'ord-outage' }, get: jest.fn(() => 'req-outage') };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await detail.handlers.at(-1)(req, res, next);
    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Order details are temporarily unavailable');
    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({ endpoint: 'GET /api/orders/mine/:id' }));

    await detail.handlers.at(-1)(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unexpected detail failure' }));
  });

  test('create endpoint logs bounded suppression outcome when communication intent is fail-closed', async () => {
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn().mockResolvedValue({ order: { id: 'ord-1' }, replayed: false }),
      listCustomerOrderVisibility: jest.fn().mockResolvedValue([]),
      processPaymentWebhookEvent: jest.fn().mockResolvedValue({ ok: true }),
      markFulfillmentReady: jest.fn().mockResolvedValue({ id: 'o-ready' }),
      markFulfillmentCompleted: jest.fn().mockResolvedValue({ id: 'o-complete' }),
    };
    const logger = { info: jest.fn(), error: jest.fn() };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({
        createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({
          ok: false,
          outcome: 'suppressed',
          reason: 'duplicate_semantic_intent',
        }),
        createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }),
      }),
    });

    const create = routes.find((r) => r.path === '/' && r.method === 'post');
    const req = {
      body: {
        items: [{ id: 'p1', quantity: 1 }],
        idempotencyKey: 'k-comm-1',
        fulfillment: { mode: 'pickup_local' },
        email: 'u1@test.dev',
      },
      auth: { sub: 'u1', isGuest: false },
      get: jest.fn(() => 'req-comm-1'),
      requestId: 'req-comm-1',
    };
    const res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };

    await create.handlers.at(-1)(req, res, jest.fn());

    expect(logger.info).toHaveBeenCalledWith('transactional_comm_intent_suppressed', expect.objectContaining({
      classKey: 'order_received_pending_confirmation',
      orderId: 'ord-1',
      reasonCode: 'duplicate_semantic_intent',
      correlationId: 'req-comm-1',
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('create endpoint suppression log falls back to null orderId and unknown correlation when unavailable', async () => {
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn().mockResolvedValue({ order: {}, replayed: false }),
      listCustomerOrderVisibility: jest.fn().mockResolvedValue([]),
      processPaymentWebhookEvent: jest.fn().mockResolvedValue({ ok: true }),
      markFulfillmentReady: jest.fn().mockResolvedValue({ id: 'o-ready' }),
      markFulfillmentCompleted: jest.fn().mockResolvedValue({ id: 'o-complete' }),
    };
    const logger = { info: jest.fn(), error: jest.fn() };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: (req, _res, n) => { req.auth = { sub: 'u1', isGuest: false }; n(); } }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady: jest.fn().mockResolvedValue(undefined), isDependencyUnavailableError: jest.fn(() => false) }),
      '../../src/services/transactional-communication.service.js': () => ({
        createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({
          ok: false,
          outcome: 'suppressed',
          reason: 'missing_order_reference',
        }),
        createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }),
      }),
    });

    const create = routes.find((r) => r.path === '/' && r.method === 'post');
    const req = {
      body: {
        items: [{ id: 'p1', quantity: 1 }],
        idempotencyKey: 'k-comm-2',
        fulfillment: { mode: 'pickup_local' },
        email: 'u1@test.dev',
      },
      auth: { sub: 'u1', isGuest: false },
    };
    const res = { locals: {}, status: jest.fn(() => res), json: jest.fn() };

    await create.handlers.at(-1)(req, res, jest.fn());

    expect(logger.info).toHaveBeenCalledWith('transactional_comm_intent_suppressed', expect.objectContaining({
      orderId: null,
      correlationId: 'unknown',
    }));
  });

  test('dependency-outage logging falls back to unknown correlation when request correlation is absent', async () => {
    const outage = new Error('database unavailable');
    const assertDatabaseReady = jest.fn().mockRejectedValue(outage);
    const isDependencyUnavailableError = jest.fn(() => true);
    const logger = { error: jest.fn() };
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const orderRepository = {
      createIdempotentWithItemsAndUpdateStock: jest.fn(),
      listCustomerOrderVisibility: jest.fn(),
      processPaymentWebhookEvent: jest.fn(),
      markFulfillmentReady: jest.fn(),
      markFulfillmentCompleted: jest.fn(),
    };

    const routes = await loadRoute('../../src/routes/orders.routes.js', {
      '../../src/validation/schemas/index.js': () => ({ authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} }, ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {}, markReadiness: {}, markCompletion: {}, mineListQuery: {} }, paymentsSchemas: { createIntent: {} }, cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} }, productsSchemas: { listQuery: {}, byIdParams: {}, create: {} }, leadsSchemas: { create: {}, listQuery: {} }, analyticsSchemas: { track: {}, listQuery: {} } }),
      '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
      '../../src/middlewares/authenticate.js': () => ({ default: pass }),
      '../../src/middlewares/authorizeRole.js': () => ({ default: jest.fn(() => pass) }),
      '../../src/middlewares/checkoutIdentity.js': () => ({ default: pass }),
      '../../src/middlewares/checkoutCustomerAccess.js': () => ({ default: pass, enforceOrderOwnership: pass }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/lib/critical-dependencies.js': () => ({ assertDatabaseReady, isDependencyUnavailableError }),
      '../../src/services/transactional-communication.service.js': () => ({ createPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }), createReadyCommunicationIntent: jest.fn().mockResolvedValue({ ok: true, outcome: 'created' }) }),
    });

    const create = routes.find((r) => r.path === '/' && r.method === 'post');
    await create.handlers.at(-1)({ body: { items: [{ id: 'p1', quantity: 1 }], idempotencyKey: 'k-3' }, auth: { sub: 'u1', isGuest: false } }, { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() }, jest.fn());

    const mine = routes.find((r) => r.path === '/mine' && r.method === 'get');
    await mine.handlers.at(-1)({ auth: { sub: 'u1' }, query: {} }, { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() }, jest.fn());

    const detail = routes.find((r) => r.path === '/mine/:id' && r.method === 'get');
    await detail.handlers.at(-1)({ auth: { sub: 'u1' }, params: { id: 'ord-1' } }, { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() }, jest.fn());

    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({
      endpoint: 'POST /api/orders',
      correlationId: 'unknown',
    }));
    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({
      endpoint: 'GET /api/orders/mine',
      correlationId: 'unknown',
    }));
    expect(logger.error).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({
      endpoint: 'GET /api/orders/mine/:id',
      correlationId: 'unknown',
    }));
  });
});
