import { jest } from '@jest/globals';
import { loadRoute } from './_router-helper.js';

describe('webhooks route branch support coverage for I1 gate stability', () => {
  test('stripe seam uses defensive defaults when boundary engines return null', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const markPaidFromWebhook = jest.fn();
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({
        default: {
          webhooks: {
            constructEvent: jest.fn(() => ({
              id: 'evt_cov_1',
              type: 'payment_intent.succeeded',
              data: {
                object: {
                  id: 'pi_cov_1',
                  status: 'succeeded',
                  amount_received: 1000,
                  currency: 'EUR',
                  metadata: { orderId: 'ord_cov_1', userId: 'usr_1', idempotencyKey: 'idem_cov_1' },
                },
              },
            })),
          },
        },
      }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message })) }),
      '../../src/repositories/order.repository.js': () => ({
        orderRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'ord_cov_1',
            status: 'pending',
            totalAmount: '10.00',
            currency: 'EUR',
            idempotencyKey: 'idem_cov_1',
            items: [{ productId: '' }],
          }),
          markPaidFromWebhook,
          processPaymentWebhookEvent: jest.fn(),
        },
      }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
      '../../src/domain/order-state-machine.js': () => ({
        OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {},
        nextStatusForEvent: jest.fn(() => 'paid'),
        assertValidTransition: jest.fn(),
      }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
      '../../src/domain/finalization-boundary-enforcer.js': () => ({ enforceFinalizationBoundary: jest.fn(async () => null) }),
      '../../src/domain/reconciliation-remediation-boundary-signaler.js': () => ({ signalReconciliationRemediationBoundary: jest.fn(async () => null) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    await stripe(req, res, jest.fn());

    expect(markPaidFromWebhook).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: {
        ignored: true,
        reason: 'success_emission_blocked',
        boundary: {
          finalizationBlockingReasonCodes: ['finalization_boundary_uncertain'],
          remediationSignalingReasonCodes: [],
        },
      },
    });
  });

  test('paypal signature-verification unexpected error propagates to next', async () => {
    const unexpected = new Error('paypal verify exploded');
    const next = jest.fn();
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockRejectedValue(unexpected) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim: jest.fn().mockResolvedValue({ accepted: true }) }) }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = { eventId: 'evt_paypal_1', orderId: 'o1', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' }, payload: { capture: { amount: '10.00', currency: 'EUR', id: 'cap_1' } } };
    const req = { get: (h) => (h === 'content-length' ? '10' : 'hdr'), body: Buffer.from(JSON.stringify(body)), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, next);
    expect(next).toHaveBeenCalledWith(unexpected);
  });

  test('paypal transition checker unexpected error propagates to next', async () => {
    const unexpected = new Error('transition checker exploded');
    const next = jest.fn();
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent: jest.fn() } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn().mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS' }) } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status) => res.status(status).json({})) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn().mockResolvedValue({ id: 'o1', status: 'pending', totalAmount: '10.00', currency: 'EUR' }), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim: jest.fn().mockResolvedValue({ accepted: true }) }) }),
      '../../src/domain/order-state-machine.js': () => ({
        OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {},
        nextStatusForEvent: jest.fn(() => 'paid'),
        assertValidTransition: jest.fn(() => {
          throw unexpected;
        }),
      }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
    });

    const paypal = routes.find((r) => r.path === '/paypal').handlers.at(-1);
    const body = { eventId: 'evt_paypal_2', orderId: 'o1', metadata: { orderId: 'o1', userId: 'u1', idempotencyKey: 'k1' }, payload: { capture: { amount: '10.00', currency: 'EUR', id: 'cap_2' } } };
    const req = { get: (h) => (h === 'content-length' ? '10' : 'hdr'), body: Buffer.from(JSON.stringify(body)), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await paypal(req, res, next);
    expect(next).toHaveBeenCalledWith(unexpected);
  });
});
