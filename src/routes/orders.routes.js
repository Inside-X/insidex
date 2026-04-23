import express from 'express';
import { ordersSchemas } from '../validation/schemas/index.js';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import authenticateJWT from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';
import ensureCheckoutSessionJWT from '../middlewares/checkoutIdentity.js';
import checkoutCustomerAccess, { enforceOrderOwnership } from '../middlewares/checkoutCustomerAccess.js';
import { sendApiError } from '../utils/api-error.js';
import { orderRepository } from '../repositories/order.repository.js';
import { logger } from '../utils/logger.js';
import { assertDatabaseReady, isDependencyUnavailableError } from '../lib/critical-dependencies.js';
import { toCustomerOrderDetailEntry, toCustomerOrderListEntry } from './orders.customer-view.js';
import { createPendingConfirmationCommunicationIntent } from '../services/transactional-communication.service.js';

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
      await assertDatabaseReady();

      const result = await orderRepository.createIdempotentWithItemsAndUpdateStock({
        userId: req.auth.sub,
        items: req.body.items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        idempotencyKey: req.body.idempotencyKey,
        stripePaymentIntentId: req.body.stripePaymentIntentId || null,
        fulfillment: req.body.fulfillment,
        email: req.body.email,
        address: req.body.address,
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

      const communicationIntent = await createPendingConfirmationCommunicationIntent({
        orderId: result?.order?.id,
        correlationId: req.requestId || null,
      });

      if (!communicationIntent.ok) {
        logger.info('transactional_comm_intent_suppressed', {
          classKey: 'order_received_pending_confirmation',
          orderId: result?.order?.id || null,
          reasonCode: communicationIntent.reason,
          correlationId: req.requestId || 'unknown',
        });
      }

      return res.status(result.replayed ? 200 : 201).json(response);
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        logger.error('critical_dependency_unavailable', {
          endpoint: 'POST /api/orders',
          reasonCode: 'db_unavailable',
          reason: error?.code || error?.message,
          correlationId: req.requestId || req.get?.('x-request-id') || 'unknown',
        });
        return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
      }
      return next(error);
    }
  }
);

router.get(
  '/mine',
  strictValidate(ordersSchemas.mineListQuery, 'query'),
  authenticateJWT,
  authorizeRole(['customer']),
  async (req, res, next) => {
    try {
      await assertDatabaseReady();
      const take = req.query?.limit == null ? 20 : Number(req.query.limit);
      const orders = await orderRepository.listCustomerOrderVisibility({
        userId: req.auth.sub,
        take,
      });

      const ownOrders = orders.filter((order) => order?.userId === req.auth.sub);
      const data = ownOrders.map(toCustomerOrderListEntry);
      const degraded = data.some((order) => order.degraded === true);
      return res.status(200).json({
        data,
        meta: {
          count: data.length,
          ...(degraded ? { degraded: true, message: 'Some order details are currently limited.' } : {}),
        },
      });
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        logger.error('critical_dependency_unavailable', {
          endpoint: 'GET /api/orders/mine',
          reasonCode: 'db_unavailable',
          reason: error?.code || error?.message,
          correlationId: req.requestId || req.get?.('x-request-id') || 'unknown',
        });
        return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Order history is temporarily unavailable');
      }
      return next(error);
    }
  }
);

router.get(
  '/mine/:id',
  strictValidate(ordersSchemas.byIdParams, 'params'),
  authenticateJWT,
  authorizeRole(['customer']),
  async (req, res, next) => {
    try {
      await assertDatabaseReady();
      const order = await orderRepository.findCustomerOrderDetailVisibility({
        userId: req.auth.sub,
        orderId: req.params.id,
      });

      if (!order) {
        return sendApiError(req, res, 404, 'NOT_FOUND', 'Order not found');
      }

      const data = toCustomerOrderDetailEntry(order);
      return res.status(200).json({
        data,
        meta: {
          ...(data.degraded ? { degraded: true, message: 'Some order details are currently limited.' } : {}),
        },
      });
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        logger.error('critical_dependency_unavailable', {
          endpoint: 'GET /api/orders/mine/:id',
          reasonCode: 'db_unavailable',
          reason: error?.code || error?.message,
          correlationId: req.requestId || req.get?.('x-request-id') || 'unknown',
        });
        return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Order details are temporarily unavailable');
      }
      return next(error);
    }
  }
);

router.post('/webhooks/payments', strictValidate(ordersSchemas.paymentWebhook), async (req, res, next) => {
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

router.get('/:id', strictValidate(ordersSchemas.byIdParams, 'params'), authenticateJWT, authorizeRole(['admin', 'customer']), (req, res) => res.status(200).json({ data: { id: req.params.id } }));

router.post(
  '/:id/readiness',
  strictValidate(ordersSchemas.byIdParams, 'params'),
  strictValidate(ordersSchemas.markReadiness),
  authenticateJWT,
  authorizeRole(['admin']),
  async (req, res, next) => {
    try {
      const order = await orderRepository.markFulfillmentReady({
        orderId: req.params.id,
        target: req.body.target,
        actorType: 'admin',
        note: req.body.note,
      });

      return res.status(200).json({ data: order });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/:id/completion',
  strictValidate(ordersSchemas.byIdParams, 'params'),
  strictValidate(ordersSchemas.markCompletion),
  authenticateJWT,
  authorizeRole(['admin']),
  async (req, res, next) => {
    try {
      const order = await orderRepository.markFulfillmentCompleted({
        orderId: req.params.id,
        target: req.body.target,
        actorType: 'admin',
        note: req.body.note,
      });

      return res.status(200).json({ data: order });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
