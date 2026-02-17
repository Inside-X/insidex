import express from 'express';
import { ZodError } from 'zod';
import stripe from '../lib/stripe.js';
import paypal from '../lib/paypal.js';
import { paymentsSchemas } from '../validation/schemas/index.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const MAX_PAYPAL_BODY_SIZE_BYTES = 1024 * 256;

function normalizeCurrency(currency) {
  return String(currency || '').trim().toLowerCase();
}

function toMinorUnits(amount) {
  const value = Number.parseFloat(String(amount));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

router.post('/stripe', async (req, res, next) => {
  try {
    const signature = req.get('stripe-signature');
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    const rawBody = req.body;

    if (!secret || !signature || !Buffer.isBuffer(rawBody)) {
      logger.warn('stripe_webhook_invalid_input', {
        hasSecret: Boolean(secret),
        hasSignature: Boolean(signature),
        isBuffer: Buffer.isBuffer(rawBody),
      });
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    let payload;
    try {
      payload = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      logger.warn('stripe_webhook_signature_validation_failed', {
        reason: error.message,
      });
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    const validatedPayload = paymentsSchemas.stripeWebhook.parse(payload);

    if (validatedPayload.type !== 'payment_intent.succeeded') {
      return res.status(200).json({ data: { ignored: true } });
    }

    const paymentObject = validatedPayload.data.object;
    const paymentIntentId = paymentObject.id;
    const metadata = paymentObject.metadata;

    if (paymentObject.status !== 'succeeded') {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Unexpected PaymentIntent status');
    }

    const order = await orderRepository.findById(metadata.orderId);
    if (!order) {
      return sendApiError(req, res, 404, 'NOT_FOUND', 'Order not found');
    }

    const expectedMinor = toMinorUnits(order.totalAmount);
    if (paymentObject.amount_received !== expectedMinor) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Amount mismatch');
    }

    if (normalizeCurrency(paymentObject.currency) !== normalizeCurrency(order.currency || 'EUR')) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Currency mismatch');
    };

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
    if (error instanceof ZodError) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid request payload');
    }

    return next(error);
  }
});

router.post('/paypal', async (req, res, next) => {
  try {
    const contentLength = Number(req.get('content-length') || 0);
    if (contentLength > MAX_PAYPAL_BODY_SIZE_BYTES) {
      return sendApiError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    }

    const payload = paymentsSchemas.paypalWebhook.parse(req.body);
    const verification = await paypal.webhooks.verifyWebhookSignature({
      getHeader: (name) => req.get(name),
      webhookEvent: req.body,
    });

    if (!verification.verified) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid paypal signature');
    }

    if (payload.orderId !== payload.metadata.orderId) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'metadata.orderId mismatch');
    }

    const order = await orderRepository.findById(payload.orderId);
    if (!order) {
      return sendApiError(req, res, 404, 'NOT_FOUND', 'Order not found');
    }

    const capture = payload.payload?.capture || {};
    const paidMinor = toMinorUnits(capture.amount);
    const expectedMinor = toMinorUnits(order.totalAmount);
    if (paidMinor !== null && expectedMinor !== paidMinor) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Amount mismatch');
    }

    if (capture.currency && normalizeCurrency(capture.currency) !== normalizeCurrency(order.currency || 'EUR')) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Currency mismatch');
    }

    if (capture.status && capture.status !== 'COMPLETED') {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Unexpected payment status');
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
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    
    return next(error);
  }
});

export default router;