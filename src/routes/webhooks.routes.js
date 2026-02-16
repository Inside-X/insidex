import express from 'express';
import { ZodError } from 'zod';
import stripe from '../lib/stripe.js';
import paypal from '../lib/paypal.js';
import { paymentsSchemas } from '../validation/schemas/index.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';

const router = express.Router();

router.post('/stripe', async (req, res, next) => {
  try {
    const signature = req.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const rawBody = req.body;

    if (!secret || !signature || !Buffer.isBuffer(rawBody)) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    let payload;
    try {
      payload = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (_error) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    const validatedPayload = paymentsSchemas.stripeWebhook.parse(payload);

    if (validatedPayload.type !== 'payment_intent.succeeded') {
      return res.status(200).json({ data: { ignored: true } });
    }

    const paymentIntentId = validatedPayload.data.object.id;
    const metadata = validatedPayload.data.object.metadata;

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
    if (error instanceof ZodError) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid request payload');
    }
    
    return next(error);
  }
});

export default router;