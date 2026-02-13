import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { ordersSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';

const router = express.Router();

router.post('/', validate(ordersSchemas.create), authenticate, authorizeRole('customer'), async (req, res, next) => {
  try {
    if (req.body.userId !== req.auth.sub) {
      return sendApiError(req, res, 403, 'FORBIDDEN', 'Cannot create order for another user');
    }

    const result = await orderRepository.createIdempotentWithItemsAndUpdateStock({
      userId: req.body.userId,
      items: req.body.items,
      idempotencyKey: req.body.idempotencyKey,
      stripePaymentIntentId: req.body.stripePaymentIntentId || null,
    });

    return res.status(result.replayed ? 200 : 201).json({ data: result.order, meta: { replayed: result.replayed } });
  } catch (error) {
    return next(error);
  }
});

router.post('/webhooks/payments', validate(ordersSchemas.paymentWebhook), async (req, res, next) => {
  try {
    const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (expectedSecret && req.get('x-webhook-secret') !== expectedSecret) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid webhook secret');
    }

    const result = await orderRepository.processPaymentWebhookEvent(req.body);
    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', validate(ordersSchemas.byIdParams, 'params'), authenticate, authorizeRole(['admin', 'customer']), (req, res) => res.status(200).json({ data: { id: req.params.id } }));

export default router;