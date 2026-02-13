import crypto from 'crypto';
import express from 'express';
import { paymentsSchemas } from '../validation/schemas/index.js';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';

const router = express.Router();

function verifyStripeSignature(rawBody, signature, secret) {
  if (!secret) {
    return true;
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return signature === digest;
}

router.post('/stripe', strictValidate(paymentsSchemas.stripeWebhook), async (req, res, next) => {
  try {
    const signature = req.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const rawBody = JSON.stringify(req.body);

    if (!verifyStripeSignature(rawBody, signature, secret)) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Invalid stripe signature');
    }

    if (req.body.type !== 'payment_intent.succeeded') {
      return res.status(200).json({ data: { ignored: true } });
    }

    const paymentIntentId = req.body.data.object.id;
    const metadata = req.body.data.object.metadata;

    const result = await orderRepository.markPaidFromWebhook({
      eventId: req.body.id,
      paymentIntentId,
      orderId: metadata.orderId,
      userId: metadata.userId,
      expectedIdempotencyKey: metadata.idempotencyKey,
      provider: 'stripe',
      payload: req.body,
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.post('/paypal', strictValidate(paymentsSchemas.paypalWebhook), async (req, res, next) => {
  try {
    if (req.body.orderId !== req.body.metadata.orderId) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'metadata.orderId mismatch');
    }

    const result = await orderRepository.processPaymentWebhookEvent({
      provider: 'paypal',
      eventId: req.body.eventId,
      orderId: req.body.orderId,
      payload: {
        metadata: req.body.metadata,
        payload: req.body.payload || {},
      },
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

export default router;