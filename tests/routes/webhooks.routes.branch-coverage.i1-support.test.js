import { jest } from '@jest/globals';
import { loadRoute } from './_router-helper.js';

describe('webhooks route branch support coverage for I1 gate stability', () => {
  test('stripe seam uses defensive defaults when boundary engines return null', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const markPaidFromWebhook = jest.fn();
    const recordUnderReviewCommunicationUnitFromWebhook = jest.fn().mockResolvedValue({
      recorded: false,
      deduped: false,
      reason: 'insufficient_context',
      communicationUnitId: null,
    });
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
          recordUnderReviewCommunicationUnitFromWebhook,
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
    const req = {
      get: (h) => (h === 'stripe-signature' ? 'sig' : null),
      body: Buffer.from('{}'),
      app: { locals: { webhookIdempotencyStore: { claim } } },
    };
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

  test('stripe seam keeps blocked response when fallback identity path is used', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const markPaidFromWebhook = jest.fn();
    const recordUnderReviewCommunicationUnitFromWebhook = jest.fn().mockResolvedValue({
      recorded: false,
      deduped: false,
      reason: '',
      communicationUnitId: null,
    });
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({
        default: {
          webhooks: {
            constructEvent: jest.fn(() => ({
              id: 'evt_cov_2',
              type: 'payment_intent.succeeded',
              data: {
                object: {
                  id: 'pi_cov_2',
                  status: 'succeeded',
                  amount_received: 1000,
                  currency: 'EUR',
                  metadata: { orderId: '', userId: 'usr_2', idempotencyKey: 'idem_cov_2' },
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
            id: 'ord_cov_2',
            status: 'pending',
            totalAmount: '10.00',
            currency: null,
            idempotencyKey: 'idem_cov_2',
            items: [{ productId: '' }, { productId: '' }],
          }),
          markPaidFromWebhook,
          processPaymentWebhookEvent: jest.fn(),
          recordUnderReviewCommunicationUnitFromWebhook,
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
    const req = {
      get: (h) => (h === 'stripe-signature' ? 'sig' : null),
      body: Buffer.from('{}'),
      app: { locals: { webhookIdempotencyStore: { claim } } },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());

    expect(markPaidFromWebhook).not.toHaveBeenCalled();
    expect(recordUnderReviewCommunicationUnitFromWebhook).toHaveBeenCalledTimes(1);
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

  test('stripe seam fails closed when strict and fallback identities are both missing', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const markPaidFromWebhook = jest.fn();
    const recordUnderReviewCommunicationUnitFromWebhook = jest.fn().mockResolvedValue({
      recorded: false,
      deduped: false,
      reason: 'insufficient_context',
      communicationUnitId: null,
    });
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({
        default: {
          webhooks: {
            constructEvent: jest.fn(() => ({
              id: '',
              type: 'payment_intent.succeeded',
              data: {
                object: {
                  id: 'pi_cov_3',
                  status: 'succeeded',
                  amount_received: 1000,
                  currency: 'EUR',
                  metadata: { orderId: '', userId: 'usr_3', idempotencyKey: 'idem_cov_3' },
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
            id: '',
            status: 'pending',
            totalAmount: '10.00',
            currency: 'EUR',
            idempotencyKey: 'idem_cov_3',
            items: [{ productId: '' }, { productId: '' }],
          }),
          markPaidFromWebhook,
          processPaymentWebhookEvent: jest.fn(),
          recordUnderReviewCommunicationUnitFromWebhook,
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
    const req = {
      get: (h) => (h === 'stripe-signature' ? 'sig' : null),
      body: Buffer.from('{}'),
      app: { locals: { webhookIdempotencyStore: { claim } } },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());

    expect(markPaidFromWebhook).not.toHaveBeenCalled();
    expect(recordUnderReviewCommunicationUnitFromWebhook).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        ignored: true,
        reason: 'success_emission_blocked',
        boundary: {
          finalizationBlockingReasonCodes: ['finalization_boundary_uncertain'],
          remediationSignalingReasonCodes: ['remediation_boundary_uncertain'],
        },
      },
    });
  });

  test('stripe currency mismatch path uses default expected currency fallback', async () => {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const markPaidFromWebhook = jest.fn();
    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({
        default: {
          webhooks: {
            constructEvent: jest.fn(() => ({
              id: 'evt_cov_currency_fallback',
              type: 'payment_intent.succeeded',
              data: {
                object: {
                  id: 'pi_cov_currency_fallback',
                  status: 'succeeded',
                  amount_received: 1000,
                  currency: 'USD',
                  metadata: { orderId: 'ord_cov_currency_fallback', userId: 'usr_4', idempotencyKey: 'idem_cov_4' },
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
            id: 'ord_cov_currency_fallback',
            status: 'pending',
            totalAmount: '10.00',
            currency: null,
            idempotencyKey: 'idem_cov_4',
            items: [{ productId: 'prod_cov_4' }],
          }),
          markPaidFromWebhook,
          processPaymentWebhookEvent: jest.fn(),
          recordUnderReviewCommunicationUnitFromWebhook: jest.fn(),
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
    const req = {
      get: (h) => (h === 'stripe-signature' ? 'sig' : null),
      body: Buffer.from('{}'),
      app: { locals: { webhookIdempotencyStore: { claim } } },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };

    await stripe(req, res, jest.fn());

    expect(markPaidFromWebhook).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: { ignored: true, reason: 'currency_mismatch' } });
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
