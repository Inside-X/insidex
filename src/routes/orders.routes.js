import express from 'express';
import { ordersSchemas } from '../validation/schemas/index.js';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import authenticateJWT from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';
import ensureCheckoutSessionJWT from '../middlewares/checkoutIdentity.js';
import checkoutCustomerAccess, { enforceOrderOwnership } from '../middlewares/checkoutCustomerAccess.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';

const router = express.Router();

router.post(
  '/',
  strictValidate(ordersSchemas.create),
  ensureCheckoutSessionJWT,
  authenticateJWT,
  checkoutCustomerAccess,
  enforceOrderOwnership,
  async (req, res, next) => {
    try {
      const result = await orderRepository.createIdempotentWithItemsAndUpdateStock({
        userId: req.auth.sub,
        items: req.body.items,
        idempotencyKey: req.body.idempotencyKey,
        stripePaymentIntentId: req.body.stripePaymentIntentId || null,
      });

      const response = {
        data: result.order,
        meta: {
          replayed: result.replayed,
          isGuestCheckout: req.auth.isGuest === true,
        },
      };

      if (res.locals.implicitGuestToken) {
        response.meta.guestSessionToken = res.locals.implicitGuestToken;
      }

      return res.status(result.replayed ? 200 : 201).json(response);
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/webhooks/payments', strictValidate(ordersSchemas.paymentWebhook), async (req, res, next) => {
  try {
    const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!expectedSecret || req.get('x-webhook-secret') !== expectedSecret) {
      return sendApiError(req, res, 401, 'UNAUTHORIZED', 'Invalid webhook secret');
    }

    const result = await orderRepository.processPaymentWebhookEvent(req.body);
    return res.status(200).json({ data: result });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', strictValidate(ordersSchemas.byIdParams, 'params'), authenticateJWT, authorizeRole(['admin', 'customer']), (req, res) => res.status(200).json({ data: { id: req.params.id } }));

export default router;