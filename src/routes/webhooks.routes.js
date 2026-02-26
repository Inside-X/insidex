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

const router = express.Router();
const MAX_WEBHOOK_BODY_SIZE_BYTES = 1024 * 1024;
const ALLOWED_ORDER_STATUSES = new Set(['pending']);


function normalizeCurrency(currency) {
  return String(currency || '').trim().toLowerCase();
}



function getCorrelationId(req) {
  return req.requestId || req.get('x-request-id') || 'unknown';
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

function isOrderStateProcessable(order) {
  return ALLOWED_ORDER_STATUSES.has(order.status);
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

    if (!isOrderStateProcessable(order)) {
      logger.error('webhook_order_state_incompatible', {
        provider: 'stripe',
        eventId: validatedPayload.id,
        orderId: order.id,
        status: order.status,
        reason: 'order_state_incompatible',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'order_state_incompatible' } });
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

    const result = await orderRepository.markPaidFromWebhook({
      eventId: validatedPayload.id,
      paymentIntentId,
      orderId: metadata.orderId,
      userId: metadata.userId,
      expectedIdempotencyKey: metadata.idempotencyKey,
      provider: 'stripe',
      payload: validatedPayload,
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

    if (!isOrderStateProcessable(order)) {
      logger.error('webhook_order_state_incompatible', {
        provider: 'paypal',
        eventId: payload.eventId,
        orderId: order.id,
        status: order.status,
        reason: 'order_state_incompatible',
        correlationId,
      });
      return res.status(200).json({ data: { ignored: true, reason: 'order_state_incompatible' } });
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