import { jest } from '@jest/globals';
import { loadRoute } from './_router-helper.js';

describe('I1 stripe success emission boundary wiring', () => {
  const baseEvent = {
    id: 'evt_i1_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_i1_1',
        status: 'succeeded',
        amount_received: 1000,
        currency: 'EUR',
        metadata: {
          orderId: 'ord_1',
          userId: 'usr_1',
          idempotencyKey: 'idem_1',
        },
      },
    },
  };

  function buildReqRes(claim) {
    const req = {
      get: (header) => {
        if (header === 'stripe-signature') return 'sig';
        return null;
      },
      body: Buffer.from('{}'),
      app: { locals: { webhookIdempotencyStore: { claim } } },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    return { req, res };
  }

  async function loadStripeHandler({
    order,
    enforceBoundary,
    signalBoundary,
    stripeEvent = baseEvent,
    markPaidResult = { replayed: false, orderMarkedPaid: true },
    communicationIntentResult = { ok: false, outcome: 'suppressed', reason: 'stronger_or_missing_truth' },
    confirmedIntentResult = { ok: true, outcome: 'created', sourceEventId: 'comm.confirmed.order:ord_1' },
  }) {
    const claim = jest.fn().mockResolvedValue({ accepted: true });
    const constructEvent = jest.fn(() => stripeEvent);
    const orderRepository = {
      findById: jest.fn().mockResolvedValue(order),
      markPaidFromWebhook: jest.fn().mockResolvedValue(markPaidResult),
      processPaymentWebhookEvent: jest.fn(),
    };
    const createUnderReviewCommunicationIntent = jest.fn().mockResolvedValue(communicationIntentResult);
    const createConfirmedCommunicationIntent = jest.fn().mockResolvedValue(confirmedIntentResult);

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: {
          stripeWebhook: { parse: jest.fn((x) => x) },
          paypalWebhook: { parse: jest.fn((x) => x) },
        },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message })) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/domain/order-state-machine.js': () => ({
        OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {},
        nextStatusForEvent: jest.fn(() => 'paid'),
        assertValidTransition: jest.fn(),
      }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
      '../../src/domain/finalization-boundary-enforcer.js': () => ({ enforceFinalizationBoundary: enforceBoundary }),
      '../../src/domain/reconciliation-remediation-boundary-signaler.js': () => ({
        signalReconciliationRemediationBoundary: signalBoundary,
      }),
      '../../src/services/transactional-communication.service.js': () => ({
        createConfirmedCommunicationIntent,
        createUnderReviewCommunicationIntent,
      }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    return {
      stripe,
      orderRepository,
      createUnderReviewCommunicationIntent,
      createConfirmedCommunicationIntent,
      claim,
      constructEvent,
      ...buildReqRes(claim),
    };
  }

  test('emits success only when R4 allows and R5 does not signal remediation boundary', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    }));

    const { stripe, req, res, orderRepository, createUnderReviewCommunicationIntent, createConfirmedCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
    });

    await stripe(req, res, jest.fn());

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledTimes(1);
    expect(createConfirmedCommunicationIntent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { replayed: false, orderMarkedPaid: true } });
  });

  test('confirmed seam dedupes deterministic retries after success', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    }));

    const { stripe, req, res, createConfirmedCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
      confirmedIntentResult: {
        ok: false,
        outcome: 'suppressed',
        reason: 'duplicate_semantic_intent',
        sourceEventId: 'comm.confirmed.order:ord_1',
      },
    });

    await stripe(req, res, jest.fn());
    expect(createConfirmedCommunicationIntent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('confirmed seam suppresses stale/uncertain confirmed truth fail-closed after success mutation', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    }));

    const { stripe, req, res, createConfirmedCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
      confirmedIntentResult: {
        ok: false,
        outcome: 'suppressed',
        reason: 'stronger_or_missing_truth',
      },
    });

    await stripe(req, res, jest.fn());
    expect(createConfirmedCommunicationIntent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('blocked/contradictory upstream state prevents success emission', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: ['finalization_boundary_attempt_blocked', 'finalization_boundary_uncertain'],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    }));

    const { stripe, req, res, orderRepository, createUnderReviewCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
    });

    await stripe(req, res, jest.fn());

    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(createUnderReviewCommunicationIntent).toHaveBeenCalledTimes(1);
    expect(createUnderReviewCommunicationIntent).toHaveBeenCalledWith({
      orderId: 'ord_1',
      correlationId: 'unknown',
    });
    expect(res.json).toHaveBeenCalledWith({
      data: {
        ignored: true,
        reason: 'success_emission_blocked',
        boundary: {
          finalizationBlockingReasonCodes: ['finalization_boundary_attempt_blocked', 'finalization_boundary_uncertain'],
          remediationSignalingReasonCodes: [],
        },
      },
    });
  });

  test('R5 remediation-boundary signaling does not emit success', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: ['remediation_boundary_nonconverged_state'],
    }));

    const { stripe, req, res, orderRepository, createUnderReviewCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
    });

    await stripe(req, res, jest.fn());

    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('blocked success path still records under-review intent when authoritative under-review truth is eligible', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: ['finalization_boundary_uncertain'],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: ['remediation_boundary_uncertain'],
    }));

    const { stripe, req, res, createUnderReviewCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'processing_exception',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
      communicationIntentResult: {
        ok: true,
        outcome: 'created',
        sourceEventId: 'comm.under_review.order:ord_1',
      },
    });

    await stripe(req, res, jest.fn());

    expect(createUnderReviewCommunicationIntent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
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

  test('ambiguous repeated-handling classification fails closed at seam', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_classification_unclassifiable',
        'duplicate_vs_new_uncertain',
        'finalization_boundary_uncertain',
      ],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: ['remediation_boundary_truth_unresolved'],
    }));

    const { stripe, req, res, orderRepository, createUnderReviewCommunicationIntent } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
    });

    await stripe(req, res, jest.fn());
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(createUnderReviewCommunicationIntent).toHaveBeenCalledTimes(1);
  });

  test('strict same-intent keys are passed to boundary enforcer (no fuzzy shortcut)', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: ['finalization_boundary_uncertain'],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: ['remediation_boundary_uncertain'],
    }));

    const { stripe, req, res } = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
    });

    await stripe(req, res, jest.fn());

    expect(enforceBoundary).toHaveBeenCalledTimes(1);
    const boundaryInput = enforceBoundary.mock.calls[0][0];
    expect(boundaryInput.attemptInput.intendedFinalizationKey).toBe('idem_1');
    expect(boundaryInput.priorContext.intendedFinalizationKey).toBe('idem_1');
    expect(boundaryInput.attemptInput).not.toHaveProperty('externalReference');
    expect(boundaryInput.attemptInput).not.toHaveProperty('payloadFingerprint');
  });

  test('missing strict intent signals fails closed before repository mutation', async () => {
    const enforceBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    }));
    const signalBoundary = jest.fn(async () => ({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    }));

    const noIntentEvent = {
      ...baseEvent,
      id: 'evt_i1_missing_intent',
      data: {
        object: {
          ...baseEvent.data.object,
          metadata: {
            ...baseEvent.data.object.metadata,
            idempotencyKey: '',
          },
        },
      },
    };
    const loaded = await loadStripeHandler({
      order: {
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      },
      enforceBoundary,
      signalBoundary,
      stripeEvent: noIntentEvent,
    });

    const {
      stripe: stripeNoIntent,
      req: reqNoIntent,
      res: resNoIntent,
      orderRepository: repoNoIntent,
      createUnderReviewCommunicationIntent,
    } = loaded;

    await stripeNoIntent(
      reqNoIntent,
      resNoIntent,
      jest.fn(),
    );

    expect(repoNoIntent.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(createUnderReviewCommunicationIntent).toHaveBeenCalledTimes(1);
    expect(resNoIntent.json).toHaveBeenCalledWith({
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

  test('claim backend failure returns 503 fail-closed response', async () => {
    const claim = jest.fn().mockRejectedValue(new Error('claim failed'));
    const constructEvent = jest.fn(() => baseEvent);
    const sendApiError = jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message }));

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({ paymentsSchemas: { stripeWebhook: { parse: jest.fn((x) => x) }, paypalWebhook: { parse: jest.fn((x) => x) } } }),
      '../../src/utils/api-error.js': () => ({ sendApiError }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository: { findById: jest.fn(), markPaidFromWebhook: jest.fn(), processPaymentWebhookEvent: jest.fn() } }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/domain/order-state-machine.js': () => ({ OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {}, nextStatusForEvent: jest.fn(() => 'paid'), assertValidTransition: jest.fn() }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
      '../../src/domain/finalization-boundary-enforcer.js': () => ({ enforceFinalizationBoundary: jest.fn() }),
      '../../src/domain/reconciliation-remediation-boundary-signaler.js': () => ({ signalReconciliationRemediationBoundary: jest.fn() }),
      '../../src/services/transactional-communication.service.js': () => ({ createUnderReviewCommunicationIntent: jest.fn(), createConfirmedCommunicationIntent: jest.fn() }),
      '../../src/lib/webhook-idempotency-store.js': () => ({ createWebhookIdempotencyStore: () => ({ claim }) }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const req = { get: (h) => (h === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: {} } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    await stripe(req, res, jest.fn());

    expect(sendApiError).toHaveBeenCalledWith(req, res, 503, 'SERVICE_UNAVAILABLE', 'Webhook idempotency backend unavailable');
  });

  test('repeated handling keeps deterministic under_review communication intent input at seam', async () => {
    const claim = jest.fn()
      .mockResolvedValueOnce({ accepted: true })
      .mockResolvedValueOnce({ accepted: true });
    const constructEvent = jest.fn(() => baseEvent);
    const orderRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'ord_1',
        status: 'pending',
        totalAmount: '10.00',
        currency: 'EUR',
        idempotencyKey: 'idem_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
      }),
      markPaidFromWebhook: jest.fn(),
      processPaymentWebhookEvent: jest.fn(),
    };
    const createUnderReviewCommunicationIntent = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        outcome: 'created',
        sourceEventId: 'comm.under_review.order:ord_1',
      })
      .mockResolvedValueOnce({
        ok: false,
        outcome: 'suppressed',
        reason: 'duplicate_semantic_intent',
        sourceEventId: 'comm.under_review.order:ord_1',
      });
    const createConfirmedCommunicationIntent = jest.fn().mockResolvedValue({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.confirmed.order:ord_1',
    });

    const routes = await loadRoute('../../src/routes/webhooks.routes.js', {
      zod: () => ({ ZodError: class ZodError extends Error {} }),
      '../../src/lib/stripe.js': () => ({ default: { webhooks: { constructEvent } } }),
      '../../src/lib/paypal.js': () => ({ default: { webhooks: { verifyWebhookSignature: jest.fn() } } }),
      '../../src/validation/schemas/index.js': () => ({
        paymentsSchemas: {
          stripeWebhook: { parse: jest.fn((x) => x) },
          paypalWebhook: { parse: jest.fn((x) => x) },
        },
      }),
      '../../src/utils/api-error.js': () => ({ sendApiError: jest.fn((_req, res, status, code, message) => res.status(status).json({ code, message })) }),
      '../../src/repositories/order.repository.js': () => ({ orderRepository }),
      '../../src/utils/logger.js': () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }),
      '../../src/domain/order-state-machine.js': () => ({
        OrderInvalidTransitionError: class OrderInvalidTransitionError extends Error {},
        nextStatusForEvent: jest.fn(() => 'paid'),
        assertValidTransition: jest.fn(),
      }),
      '../../src/utils/minor-units.js': () => ({ toMinorUnits: jest.fn(() => 1000) }),
      '../../src/domain/finalization-boundary-enforcer.js': () => ({
        enforceFinalizationBoundary: jest.fn(async () => ({
          mayFinalizeAsSuccess: false,
          boundaryDecision: 'block_success',
          blockingReasonCodes: ['finalization_boundary_uncertain'],
        })),
      }),
      '../../src/domain/reconciliation-remediation-boundary-signaler.js': () => ({
        signalReconciliationRemediationBoundary: jest.fn(async () => ({
          isInRemediationBoundary: true,
          boundaryStatus: 'reconciliation_remediation_boundary',
          signalingReasonCodes: ['remediation_boundary_uncertain'],
        })),
      }),
      '../../src/services/transactional-communication.service.js': () => ({
        createConfirmedCommunicationIntent,
        createUnderReviewCommunicationIntent,
      }),
    });

    process.env.PAYMENT_WEBHOOK_SECRET = 'sec';
    const stripe = routes.find((r) => r.path === '/stripe').handlers.at(-1);
    const buildReq = () => ({ get: (header) => (header === 'stripe-signature' ? 'sig' : null), body: Buffer.from('{}'), app: { locals: { webhookIdempotencyStore: { claim } } } });
    const makeRes = () => {
      const res = { status: jest.fn(() => res), json: jest.fn() };
      return res;
    };

    await stripe(buildReq(), makeRes(), jest.fn());
    await stripe(buildReq(), makeRes(), jest.fn());

    expect(createUnderReviewCommunicationIntent).toHaveBeenCalledTimes(2);
    expect(createUnderReviewCommunicationIntent.mock.calls[0][0]).toEqual(
      createUnderReviewCommunicationIntent.mock.calls[1][0],
    );
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });
});
