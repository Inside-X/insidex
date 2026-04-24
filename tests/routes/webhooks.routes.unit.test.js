import { loadRoute } from './_router-helper.js';
import { jest } from '@jest/globals';

describe('webhooks.routes', () => {
  test('stripe/paypal major branches and minor-units delegation', async () => {
    const constructEvent = jest.fn();
    const verifyWebhookSignature = jest.fn();
    const parseStripe = jest.fn((x) => x);
    const parsePaypal = jest.fn((x) => x);
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const orderRepository = { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() };
    const createConfirmedCommunicationIntent = jest.fn().mockResolvedValue({ ok: true, outcome: 'created', sourceEventId: 'comm.confirmed.order:o1' });
    const createUnderReviewCommunicationIntent = jest.fn().mockResolvedValue({ ok: false, outcome: 'suppressed', reason: 'stronger_or_missing_truth' });
    const claim = jest.fn();
    const realMinorUnits = await import('../../src/utils/minor-units.js');
    const toMinorUnits = jest.fn(realMinorUnits.toMinorUnits);

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: { stripeWebhook: { parse: parseStripe }, paypalWebhook: { parse: parsePaypal } },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/logger.js': () => ({ logger }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/utils/minor-units.js': () => ({ ...realMinorUnits, toMinorUnits }),
      '../../src/services/transactional-communication.service.js': () => ({
        createConfirmedCommunicationIntent,
        createUnderReviewCommunicationIntent,
      }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const next = jest.fn();

    let req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), headers: {}, app: { locals: {} } };
    let res = { status: jest.fn(() => res), json: jest.fn() };

    constructEvent.mockReturnValueOnce({ id: 'e1', type: 'other', data: { object: {} } });
    await stripe(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(createConfirmedCommunicationIntent).toHaveBeenCalledTimes(0);

    constructEvent.mockReturnValueOnce({
      id: 'e2',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi', status: 'succeeded', amount_received: 1000, currency: 'EUR', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k' } } },
    });
    claim.mockResolvedValueOnce({ accepted: true });
    orderRepository.findById.mockResolvedValueOnce({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' });
    orderRepository.markPaidFromWebhook.mockResolvedValueOnce({ replayed: false, orderMarkedPaid: true });

    req = { ...req, app: { locals: {} } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await stripe(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(createConfirmedCommunicationIntent).toHaveBeenCalledTimes(1);

    req = {
      get: (h) => (h === 'content-length' ? '10' : null),
      body: Buffer.from(JSON.stringify({ eventId: 'e1', orderId: 'o1', metadata: { orderId: 'o1' }, payload: { capture: { status: 'COMPLETED', id: 'cap_u1', amount: '10.00', currency: 'EUR' } } })),
      headers: {},
      app: { locals: {} },
    };
    claim.mockResolvedValueOnce({ accepted: true });
    verifyWebhookSignature.mockResolvedValueOnce({ verified: true, verificationStatus: 'SUCCESS' });
    orderRepository.findById.mockResolvedValueOnce({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' });
    orderRepository.processPaymentWebhookEvent.mockResolvedValueOnce({ replayed: false, orderMarkedPaid: true });

    res = { status: jest.fn(() => res), json: jest.fn() };
    await paypal(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(toMinorUnits).toHaveBeenCalled();
    expect(createConfirmedCommunicationIntent).toHaveBeenCalledTimes(2);
  });

  test('paypal rejects numeric monetary value right after JSON parse', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const realMinorUnits = await import('../../src/utils/minor-units.js');

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({
        orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() },
      }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/utils/minor-units.js': () => realMinorUnits,
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const req = {
      get: (h) => (h === 'content-length' ? '10' : null),
      body: Buffer.from(JSON.stringify({ eventId: 'e1', orderId: 'o1', metadata: { orderId: 'o1' }, payload: { capture: { amount: 10.5, currency: 'EUR' } } })),
      headers: {},
      app: { locals: {} },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req, res, 400, 'VALIDATION_ERROR', 'Invalid request payload');
  });

  test('paypal rejects oversized payload by content-length before parse', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({
        orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() },
      }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim: jest.fn() }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const req = { get: () => String(1024 * 1024 + 1), body: Buffer.from('{}'), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
  });

  test('paypal returns amount_mismatch when capture amount conversion throws', async () => {
    const processPaymentWebhookEvent = jest.fn();
    const verifyWebhookSignature = jest.fn().mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS' });
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: {
          stripeWebhook: { parse: jest.fn((x) => x) },
          paypalWebhook: { parse: jest.fn((x) => x) },
        },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({
        orderRepository: {
          findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }),
          markPaidFromWebhook: jest.fn(),
          processPaymentWebhookEvent,
        },
      }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/utils/minor-units.js': () => ({
        toMinorUnits: (amount, currency) => {
          if (currency === 'XXX') throw new Error('unsupported currency');
          return amount === '10.00' ? 1000 : 0;
        },
      }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = {
      eventId: 'evt_bad_capture',
      orderId: 'o1',
      metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'idem_1234567890' },
      payload: { capture: { amount: '10.00', currency: 'XXX' } },
    };
    const req = {
      get: (h) => (h === 'content-length' ? '10' : 'header'),
      body: Buffer.from(JSON.stringify(body)),
      app: { locals: {} },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { ignored: true, reason: 'amount_mismatch' } });
    expect(processPaymentWebhookEvent).not.toHaveBeenCalled();
  });


  test('stripe propagates non-transition error branch to next', async () => {
    const next = jest.fn();
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn(() => ({ id: 'evt_throw_branch', type: 'payment_intent.succeeded', data: { object: { id: 'pi1', status: 'succeeded', amount_received: 1000, currency: 'EUR', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' } } } })) } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/domain/order-state-machine.js': () => ({ OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {}, nextStatusForEvent: jest.fn(() => 'paid'), assertValidTransition: jest.fn(() => { throw new Error('unexpected transition checker crash'); }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: { webhookIdempotencyStore: { claim } } } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('paypal parseRawJsonBody enforces raw buffer size limit when content-length is small', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim: jest.fn().mockResolvedValue({ accepted: true }) }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const req = { get: (h) => (h === 'content-length' ? '10' : null), body: Buffer.alloc(1024 * 1024 + 1), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    await paypal(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(413);
  });

  test('stripe returns 400 when idempotency claim marks invalid_event_id', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const claim = jest.fn().mockResolvedValue({ accepted: false, reason: 'invalid_event_id' });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({
        default: {
          webhooks: {
            constructEvent: jest.fn(() => ({
              id: 'evt_bad_id',
              type: 'payment_intent.succeeded',
              data: { object: { id: 'pi1', status: 'succeeded', amount_received: 1000, currency: 'EUR', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' } } },
            })),
          },
        },
      }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: { webhookIdempotencyStore: { claim } } } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req, res, 400, 'VALIDATION_ERROR', 'Invalid event id');
  });

  test('stripe returns unsupported_event_type when state-mapper yields null for succeeded event', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const constructEvent = jest.fn(() => ({
      id: 'evt_map_null',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi1',
          status: 'succeeded',
          amount_received: 1000,
          currency: 'EUR',
          metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' },
        },
      },
    }));

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/domain/order-state-machine.js': () => ({
        OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {},
        nextStatusForEvent: jest.fn(() => null),
        assertValidTransition: jest.fn(),
      }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { ignored: true, reason: 'unsupported_event_type' } });
  });

  test('paypal returns 400 when COMPLETED capture has no resource id', async () => {
    const sendApiError = jest.fn((_req, res, status) => res.status(status).json({}));
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS' }) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn((amount) => (amount === '10.00' ? 1000 : 1000)) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = { eventId: 'evt_missing_cap', orderId: 'o1', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'idem' }, payload: { capture: { amount: '10.00', currency: 'EUR', status: 'COMPLETED' } } };
    const req = { get: (h) => (h === 'content-length' ? '10' : 'header'), body: Buffer.from(JSON.stringify(body)), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(sendApiError).toHaveBeenCalledWith(req, res, 400, 'VALIDATION_ERROR', 'Missing capture/resource id');
  });


  test('allows test fallback idempotency store when redis backend is absent', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WEBHOOK_IDEMPOTENCY_ALLOW_TEST_FALLBACK = 'true';

    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const createWebhookIdempotencyStore = jest.fn(() => ({ claim }));
    const constructEvent = jest.fn(() => ({
      id: 'evt_fallback',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi1',
          status: 'succeeded',
          amount_received: 1000,
          currency: 'EUR',
          metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' },
        },
      },
    }));

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue(null), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore }),
      '../../src/middlewares/rateLimit.js': () => ({ getRateLimitRedisClient: jest.fn(() => null) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());

    expect(createWebhookIdempotencyStore).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);

    delete process.env.WEBHOOK_IDEMPOTENCY_ALLOW_TEST_FALLBACK;
  });


  test('paypal maps provider-timeout verification error to dependency unavailable', async () => {
    const sendDependencyUnavailable = jest.fn((_req, res, _dep, _err, _ep) => res.status(503).json({}));
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/lib/critical-dependencies.js': () => ({ isDependencyUnavailableError: jest.fn(() => true) }),
      '../../src/middlewares/webhookStrictDependencyGuard.js': () => ({ sendDependencyUnavailable }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = { eventId: 'evt_timeout', orderId: 'o1', metadata: { orderId: 'o1' }, payload: { capture: { amount: '10.00', currency: 'EUR', status: 'COMPLETED', id: 'cap_1' } } };
    const req = { get: (h) => (h === 'content-length' ? '10' : 'hdr'), body: Buffer.from(JSON.stringify(body)), app: { locals: { webhookIdempotencyStore: { claim } } } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(sendDependencyUnavailable).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('paypal maps repository dependency failures to dependency unavailable', async () => {
    const sendDependencyUnavailable = jest.fn((_req, res, _dep, _err, _ep) => res.status(503).json({}));
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS' }) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockRejectedValue(Object.assign(new Error('db'), { code: 'ECONNRESET' })), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/lib/critical-dependencies.js': () => ({ isDependencyUnavailableError: jest.fn(() => true) }),
      '../../src/middlewares/webhookStrictDependencyGuard.js': () => ({ sendDependencyUnavailable }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = { eventId: 'evt_db', orderId: 'o1', metadata: { orderId: 'o1' }, payload: { capture: { amount: '10.00', currency: 'EUR', status: 'COMPLETED', id: 'cap_1' } } };
    const req = { get: (h) => (h === 'content-length' ? '10' : 'hdr'), body: Buffer.from(JSON.stringify(body)), app: { locals: { webhookIdempotencyStore: { claim } } } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(sendDependencyUnavailable).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });


  test('paypal defaults missing content-length header to zero', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS' }) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue(null), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = { eventId: 'evt_no_cl', orderId: 'o1', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'idem' }, payload: { capture: { amount: '10.00', currency: 'EUR', status: 'COMPLETED', id: 'cap_1' } } };
    const req = { get: () => undefined, body: Buffer.from(JSON.stringify(body)), app: { locals: { webhookIdempotencyStore: { claim } } } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });


  test('stripe treats missing payment currency as mismatch', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({
        default: {
          webhooks: {
            constructEvent: jest.fn(() => ({
              id: 'evt_currency_missing',
              type: 'payment_intent.succeeded',
              data: { object: { id: 'pi1', status: 'succeeded', amount_received: 1000, metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' } } },
            })),
          },
        },
      }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/domain/order-state-machine.js': () => ({
        OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {},
        nextStatusForEvent: jest.fn(() => 'paid'),
        assertValidTransition: jest.fn(() => true),
      }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: { webhookIdempotencyStore: { claim } } } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { ignored: true, reason: 'currency_mismatch' } });
  });

});
