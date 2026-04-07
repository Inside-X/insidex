import express from 'express';
import { ZodError } from 'zod';
import stripe from '../lib/stripe.js';
import paypal from '../lib/paypal.js';
import { paymentsSchemas } from '../validation/schemas/index.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';
import { logger } from '../utils/logger.js';
import { createWebhookIdempotencyStore } from '../lib/webhook-idempotency-store.js';
import { toMinorUnits } from '../utils/minor-units.js';
import { parseJsonWithStrictMonetaryValidation } from '../utils/strict-monetary-json.js';
import { getRateLimitRedisClient } from '../middlewares/rateLimit.js';
import { isDependencyUnavailableError } from '../lib/critical-dependencies.js';
import { sendDependencyUnavailable } from '../middlewares/webhookStrictDependencyGuard.js';
import { assertValidTransition, nextStatusForEvent, OrderInvalidTransitionError } from '../domain/order-state-machine.js';
import { enforceFinalizationBoundary } from '../domain/finalization-boundary-enforcer.js';
import { signalReconciliationRemediationBoundary } from '../domain/reconciliation-remediation-boundary-signaler.js';

const router = express.Router();
const MAX_WEBHOOK_BODY_SIZE_BYTES = 1024 * 1024;
function normalizeCurrency(currency) {
  return String(currency || '').trim().toLowerCase();
}



function getCorrelationId(req) {
  return req.requestId || req.get('x-request-id') || 'unknown';
}

function resolveWebhookStockTarget({ order, metadata }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const uniqueProductIds = [...new Set(items.map((item) => String(item?.productId || '').trim()).filter(Boolean))];

  if (uniqueProductIds.length === 1) {
    return {
      kind: 'product',
      productId: uniqueProductIds[0],
      variantId: null,
      sku: null,
    };
  }

  const fallbackOrderIdentity = String(metadata?.orderId || order?.id || '').trim();
  if (!fallbackOrderIdentity) return null;

  return {
    kind: 'product',
    productId: fallbackOrderIdentity,
    variantId: null,
    sku: null,
  };
}

async function enforceWebhookSuccessEmissionBoundary({ order, metadata, eventId, correlationId }) {
  const intendedFinalizationKey = String(metadata?.idempotencyKey || '').trim();
  const strictOrderId = String(metadata?.orderId || order?.id || '').trim();
  const requestKey = String(eventId || '').trim();
  const resolvedTarget = resolveWebhookStockTarget({ order, metadata });

  if (!intendedFinalizationKey || !strictOrderId || !requestKey || !resolvedTarget) {
    return {
      allowed: false,
      blockingReasonCodes: ['finalization_boundary_uncertain'],
      remediationReasonCodes: ['remediation_boundary_uncertain'],
    };
  }

  const boundaryInput = {
    orderSuccessRequested: true,
    paymentSuccessRequested: true,
    businessSuccessRequested: true,
    attemptInput: {
      productId: resolvedTarget.productId,
      resolvedTarget,
      intendedFinalizationKey,
      requestKey,
      stockTruth: { isVerifiable: true, isAvailable: true },
    },
    priorContext: {
      intendedFinalizationKey,
      authoritativeOutcome: {
        outcomeKind: 'decrement_confirmed',
        target: resolvedTarget,
      },
    },
  };

  const finalizationBoundary = await enforceFinalizationBoundary(boundaryInput);
  const remediationBoundary = await signalReconciliationRemediationBoundary({
    orderSuccessRequested: true,
    paymentSuccessRequested: true,
    businessSuccessRequested: true,
    finalizationBoundary,
  });

  const allowed = finalizationBoundary?.mayFinalizeAsSuccess === true
    && finalizationBoundary?.boundaryDecision === 'allow_success'
    && remediationBoundary?.isInRemediationBoundary !== true;

  if (!allowed) {
    logger.warn('stripe_webhook_success_emission_blocked', {
      orderId: strictOrderId,
      eventId: requestKey,
      correlationId,
      finalizationBoundaryDecision: finalizationBoundary?.boundaryDecision || 'block_success',
      finalizationBlockingReasonCodes: finalizationBoundary?.blockingReasonCodes || ['finalization_boundary_uncertain'],
      remediationBoundaryStatus: remediationBoundary?.boundaryStatus || 'reconciliation_remediation_boundary',
      remediationSignalingReasonCodes: remediationBoundary?.signalingReasonCodes || ['remediation_boundary_uncertain'],
    });
  }

  return {
    allowed,
    blockingReasonCodes: finalizationBoundary?.blockingReasonCodes || ['finalization_boundary_uncertain'],
    remediationReasonCodes: remediationBoundary?.signalingReasonCodes || [],
  };
}

function parseRawJsonBody(rawBody) {
  if (!Buffer.isBuffer(rawBody)) {
    const error = new Error('Webhook payload must be raw buffer');
    error.statusCode = 400;
    throw error;
  }

  if (rawBody.length > MAX_WEBHOOK_BODY_SIZE_BYTES) {
    const error = new Error('Payload too large');
    error.statusCode = 413;
    throw error;
  }

  return parseJsonWithStrictMonetaryValidation(rawBody.toString('utf8'), 'webhook payload');
}



function getIdempotencyStore(req) {
  if (req.app.locals.webhookIdempotencyStore) {
    return req.app.locals.webhookIdempotencyStore;
  }

  const env = process.env;
  const strictMode = env.NODE_ENV === 'production' || String(env.WEBHOOK_IDEMPOTENCY_STRICT || '').toLowerCase() === 'true';
  const allowTestFallback = env.NODE_ENV === 'test' && String(env.WEBHOOK_IDEMPOTENCY_ALLOW_TEST_FALLBACK || '').toLowerCase() === 'true';

  const redisClient = req.app.locals.webhookIdempotencyRedisClient || getRateLimitRedisClient();
  const hasRedisBackend = Boolean(redisClient && typeof redisClient.set === 'function');

  if (!hasRedisBackend && (strictMode || !allowTestFallback)) {
    return null;
  }

  req.app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore({
    redisClient: hasRedisBackend ? redisClient : null,
  });
  return req.app.locals.webhookIdempotencyStore;
}

function rejectInvalidTransition({ req, res, orderId, fromStatus, toStatus, provider, eventType, correlationId }) {
  logger.warn('order_transition_rejected', {
    orderId,
    from: fromStatus,
    to: toStatus,
    provider,
    eventType,
    correlationId,
  });

  return sendApiError(req, res, 409, 'ORDER_INVALID_TRANSITION', 'Invalid order status transition');
}

async function claimEventOrIgnore({ req, res, provider, eventId, orderId }) {
  const correlationId = getCorrelationId(req);
  const idempotencyStore = getIdempotencyStore(req);
  if (!idempotencyStore) {
    logger.error('webhook_idempotency_backend_unavailable', {
      provider,
      eventId,
      orderId,
      correlationId,
    });
    return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Webhook idempotency backend unavailable');
  }

  let claim;
  try {
    claim = await idempotencyStore.claim({ provider, eventId });
  } catch (error) {
    logger.error('webhook_idempotency_claim_failed', {
      provider,
      eventId,
      orderId,
      correlationId,
      reason: error?.message,
    });
    return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Webhook idempotency backend unavailable');
  }

  if (!claim.accepted) {
    logger.warn('webhook_replay_detected', {
      provider,
      eventId,
      orderId,
      reason: claim.reason,
      correlationId,
    });

    if (claim.reason === 'invalid_event_id') {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid event id');
    }

    return res.status(200).json({ data: { ignored: true, reason: 'replay_detected' } });
  }

  return null;
}


router.post('/stripe', async (req, res, next) => {
  const correlationId = getCorrelationId(req);
  try {
    const endpoint = 'POST /api/webhooks/stripe';
    const signature = req.get('stripe-signature');
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    const rawBody = req.body;

    logger.info('webhook_received', {
      provider: 'stripe',
      correlationId,
      hasSignature: Boolean(signature),
    });

    if (!secret || !signature || !Buffer.isBuffer(rawBody)) {
      logger.warn('stripe_webhook_invalid_input', {
        hasSecret: Boolean(secret),
        hasSignature: Boolean(signature),
        isBuffer: Buffer.isBuffer(rawBody),
        correlationId,
      });
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    let payload;
    try {
      payload = stripe.webhooks.constructEvent(rawBody, signature, secret, { toleranceSeconds: 300 });
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        return sendDependencyUnavailable(req, res, 'provider_timeout', error, endpoint);
      }
      logger.warn('stripe_webhook_signature_validation_failed', {
        reason: error.message,
        correlationId,
      });
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    const validatedPayload = paymentsSchemas.stripeWebhook.parse(payload);
    logger.info('webhook_payload_validated', {
      provider: 'stripe',
      eventId: validatedPayload.id,
      eventType: validatedPayload.type,
      correlationId,
    });

    if (validatedPayload.type !== 'payment_intent.succeeded') {
      return res.status(200).json({ data: { ignored: true, reason: 'unsupported_event_type' } });
    }

    const paymentObject = validatedPayload.data.object;
    const paymentIntentId = paymentObject.id;
    const metadata = paymentObject.metadata;

    const replayResponse = await claimEventOrIgnore({
      req,
      res,
      provider: 'stripe',
      eventId: validatedPayload.id,
      orderId: metadata.orderId,
    });
    if (replayResponse) return replayResponse;

    if (paymentObject.status !== 'succeeded') {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Unexpected PaymentIntent status');
    }

    const order = await orderRepository.findById(metadata.orderId);
    if (!order) {
      logger.error('webhook_order_not_found', {
        provider: 'stripe',
        eventId: validatedPayload.id,
        orderId: metadata.orderId,
        reason: 'order_not_found',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'order_not_found' } });
    }

    const targetStatus = nextStatusForEvent({
      provider: 'stripe',
      eventType: validatedPayload.type,
      currentStatus: order.status,
    });

    if (!targetStatus) {
      return res.status(200).json({ data: { ignored: true, reason: 'unsupported_event_type' } });
    }

    try {
      assertValidTransition(order.status, targetStatus, {
        provider: 'stripe',
        eventType: validatedPayload.type,
      });
    } catch (error) {
      if (error instanceof OrderInvalidTransitionError) {
        return rejectInvalidTransition({
          req,
          res,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: targetStatus,
          provider: 'stripe',
          eventType: validatedPayload.type,
          correlationId,
        });
      }
      throw error;
    }

    const expectedMinor = toMinorUnits(order.totalAmount, order.currency || 'EUR');
    if (paymentObject.amount_received !== expectedMinor) {
      logger.error('webhook_amount_mismatch', {
        provider: 'stripe',
        eventId: validatedPayload.id,
        orderId: order.id,
        expectedMinor,
        receivedMinor: paymentObject.amount_received,
        reason: 'amount_mismatch',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'amount_mismatch' } });
    }

    if (normalizeCurrency(paymentObject.currency) !== normalizeCurrency(order.currency || 'EUR')) {
      logger.error('webhook_currency_mismatch', {
        provider: 'stripe',
        eventId: validatedPayload.id,
        orderId: order.id,
        expectedCurrency: order.currency || 'EUR',
        receivedCurrency: paymentObject.currency,
        reason: 'currency_mismatch',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'currency_mismatch' } });
    }

    const boundary = await enforceWebhookSuccessEmissionBoundary({
      order,
      metadata,
      eventId: validatedPayload.id,
      correlationId,
    });

    if (!boundary.allowed) {
      const communicationUnit = await orderRepository.recordUnderReviewCommunicationUnitFromWebhook({
        orderId: order.id,
        currentStatus: order.status,
        intendedFinalizationKey: metadata?.idempotencyKey,
        stripePaymentIntentId: paymentIntentId,
        correlationId,
      });

      if (communicationUnit?.recorded === true) {
        logger.info('stripe_webhook_under_review_communication_unit_recorded', {
          orderId: order.id,
          eventId: validatedPayload.id,
          communicationUnitId: communicationUnit.communicationUnitId,
          semanticClass: 'under_review',
          seam: 'stripe_success_emission_blocked',
          correlationId,
        });
      } else if (communicationUnit?.deduped === true) {
        logger.info('stripe_webhook_under_review_communication_unit_deduped', {
          orderId: order.id,
          eventId: validatedPayload.id,
          communicationUnitId: communicationUnit.communicationUnitId,
          semanticClass: 'under_review',
          seam: 'stripe_success_emission_blocked',
          correlationId,
        });
      } else {
        logger.warn('stripe_webhook_under_review_communication_unit_not_recorded', {
          orderId: order.id,
          eventId: validatedPayload.id,
          reason: communicationUnit?.reason || 'insufficient_context',
          semanticClass: 'under_review',
          seam: 'stripe_success_emission_blocked',
          correlationId,
        });
      }

      return res.status(200).json({
        data: {
          ignored: true,
          reason: 'success_emission_blocked',
          boundary: {
            finalizationBlockingReasonCodes: boundary.blockingReasonCodes,
            remediationSignalingReasonCodes: boundary.remediationReasonCodes,
          },
        },
      });
    }

    const result = await orderRepository.markPaidFromWebhook({
      eventId: validatedPayload.id,
      paymentIntentId,
      orderId: metadata.orderId,
      userId: metadata.userId,
      expectedIdempotencyKey: metadata.idempotencyKey,
      provider: 'stripe',
      payload: validatedPayload,
      correlationId,
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      logger.warn('webhook_payload_invalid', {
        provider: 'stripe',
        message: error.message,
        correlationId,
      });
      return sendApiError(req, res, error.statusCode || 400, 'VALIDATION_ERROR', 'Invalid request payload');
    }

    if (isDependencyUnavailableError(error)) {
      return sendDependencyUnavailable(req, res, 'db', error, 'POST /api/webhooks/stripe');
    }

    return next(error);
  }
});

router.post('/paypal', async (req, res, next) => {
  const correlationId = getCorrelationId(req);
  try {
    const endpoint = 'POST /api/webhooks/paypal';
    const rawBody = req.body;
    const contentLength = Number(req.get('content-length') || 0);

    if (contentLength > MAX_WEBHOOK_BODY_SIZE_BYTES) {
      return sendApiError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    }

    const parsedPayload = parseRawJsonBody(rawBody);

    logger.info('webhook_received', {
      provider: 'paypal',
      correlationId,
      payloadSize: Buffer.isBuffer(rawBody) ? rawBody.length : 0,
    });

    const payload = paymentsSchemas.paypalWebhook.parse(parsedPayload);
    const replayResponse = await claimEventOrIgnore({
      req,
      res,
      provider: 'paypal',
      eventId: payload.eventId,
      orderId: payload.orderId,
    });
    if (replayResponse) return replayResponse;

    let verification;
    try {
      verification = await paypal.webhooks.verifyWebhookSignature({
        getHeader: (name) => req.get(name),
        webhookEvent: parsedPayload,
      });
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        return sendDependencyUnavailable(req, res, 'provider_timeout', error, endpoint);
      }
      throw error;
    }

    if (!verification.verified || verification.verificationStatus !== 'SUCCESS') {
      logger.warn('paypal_webhook_signature_validation_failed', {
        reason: verification.reason,
        verificationStatus: verification.verificationStatus,
        correlationId,
      });
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid paypal signature');
    }

    if (payload.orderId !== payload.metadata.orderId) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'metadata.orderId mismatch');
    }

    const order = await orderRepository.findById(payload.orderId);
    if (!order) {
      logger.error('webhook_order_not_found', {
        provider: 'paypal',
        eventId: payload.eventId,
        orderId: payload.orderId,
        reason: 'order_not_found',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'order_not_found' } });
    }

    const targetStatus = nextStatusForEvent({
      provider: 'paypal',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      currentStatus: order.status,
    });

    try {
      assertValidTransition(order.status, targetStatus, {
        provider: 'paypal',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
      });
    } catch (error) {
      if (error instanceof OrderInvalidTransitionError) {
        return rejectInvalidTransition({
          req,
          res,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: targetStatus,
          provider: 'paypal',
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          correlationId,
        });
      }
      throw error;
    }

    const capture = payload.payload?.capture || {};
    const expectedMinor = toMinorUnits(order.totalAmount, order.currency || 'EUR');
    let paidMinor = null;
    if (capture.amount !== undefined && capture.amount !== null) {
      try {
        paidMinor = toMinorUnits(capture.amount, capture.currency || order.currency || 'EUR');
      } catch {
        return res.status(200).json({ data: { ignored: true, reason: 'amount_mismatch' } });
      }
    }
    
    if (paidMinor !== null && expectedMinor !== paidMinor) {
      logger.error('webhook_amount_mismatch', {
        provider: 'paypal',
        eventId: payload.eventId,
        orderId: order.id,
        expectedMinor,
        receivedMinor: paidMinor,
        reason: 'amount_mismatch',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'amount_mismatch' } });
    }

    if (capture.currency && normalizeCurrency(capture.currency) !== normalizeCurrency(order.currency || 'EUR')) {
      logger.error('webhook_currency_mismatch', {
        provider: 'paypal',
        eventId: payload.eventId,
        orderId: order.id,
        expectedCurrency: order.currency || 'EUR',
        receivedCurrency: capture.currency,
        reason: 'currency_mismatch',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'currency_mismatch' } });
    }

    if (capture.status && capture.status !== 'COMPLETED') {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Unexpected payment status');
    }

    const paypalResourceId = capture.id || payload.payload?.resource?.id || null;
    if (capture.status === 'COMPLETED' && !paypalResourceId) {
      logger.warn('paypal_webhook_missing_resource_id', {
        provider: 'paypal',
        eventId: payload.eventId,
        orderId: order.id,
        reason: 'missing_resource_id',
        correlationId,
      });
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Missing capture/resource id');
    }
    
    const result = await orderRepository.processPaymentWebhookEvent({
      provider: 'paypal',
      eventId: payload.eventId,
      orderId: payload.orderId,
      payload: {
        metadata: payload.metadata,
        payload: payload.payload || {},
      },
      correlationId,
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return sendApiError(req, res, error.statusCode || 400, 'VALIDATION_ERROR', 'Invalid request payload');
    }


    if (isDependencyUnavailableError(error)) {
      return sendDependencyUnavailable(req, res, 'db', error, 'POST /api/webhooks/paypal');
    }

    return next(error);
  }
});

export default router;
