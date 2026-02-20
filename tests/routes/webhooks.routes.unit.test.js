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

    constructEvent.mockReturnValueOnce({
      id: 'e2',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi', status: 'succeeded', amount_received: 1000, currency: 'EUR', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k' } } },
    });
    claim.mockResolvedValueOnce({ accepted: true });
    orderRepository.findById.mockResolvedValueOnce({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' });
    orderRepository.markPaidFromWebhook.mockResolvedValueOnce({ ok: true });

    req = { ...req, app: { locals: {} } };
    res = { status: jest.fn(() => res), json: jest.fn() };
    await stripe(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);

    req = {
      get: (h) => (h === 'content-length' ? '10' : null),
      body: Buffer.from(JSON.stringify({ eventId: 'e1', orderId: 'o1', metadata: { orderId: 'o1' }, payload: { capture: { status: 'COMPLETED', amount: '10.00', currency: 'EUR' } } })),
      headers: {},
      app: { locals: {} },
    };
    claim.mockResolvedValueOnce({ accepted: true });
    verifyWebhookSignature.mockResolvedValueOnce({ verified: true, verificationStatus: 'SUCCESS' });
    orderRepository.findById.mockResolvedValueOnce({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' });
    orderRepository.processPaymentWebhookEvent.mockResolvedValueOnce({ ok: true });

    res = { status: jest.fn(() => res), json: jest.fn() };
    await paypal(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(toMinorUnits).toHaveBeenCalled();
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
});