import crypto from 'crypto';
import express from 'express';
import prisma from '../lib/prisma.js';
import { paymentsSchemas } from '../validation/schemas/index.js';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import ensureCheckoutSessionJWT from '../middlewares/checkoutIdentity.js';
import authenticateJWT from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';
import checkoutCustomerAccess from '../middlewares/checkoutCustomerAccess.js';
import { orderRepository } from '../repositories/order.repository.js';
import { sendApiError } from '../utils/api-error.js';

const router = express.Router();

function normalizeCurrency(currency) {
  return String(currency || 'EUR').trim().toUpperCase();
}

router.post('/create-intent', strictValidate(paymentsSchemas.createIntent), ensureCheckoutSessionJWT, authenticateJWT, authorizeRole('customer'), checkoutCustomerAccess, async (req, res, next) => {
  try {
    const requestedItems = req.body.items;
    const productIds = requestedItems.map((item) => item.id);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
      select: { id: true, price: true },
    });

    if (products.length !== productIds.length) {
      return sendApiError(req, res, 404, 'NOT_FOUND', 'One or more products were not found');
    }

    const productMap = new Map(products.map((product) => [product.id, Number(product.price)]));
    const lineItems = requestedItems.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
      dbUnitPrice: productMap.get(item.id),
    }));

    const totalAmount = lineItems.reduce((sum, item) => sum + (item.dbUnitPrice * item.quantity), 0);
    const candidateIntentId = `pi_${crypto.randomUUID().replace(/-/g, '')}`;

    const orderResult = await orderRepository.createPendingPaymentOrder({
      userId: req.auth.sub,
      items: lineItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      idempotencyKey: req.body.idempotencyKey,
      stripePaymentIntentId: candidateIntentId,
    });

    const orderId = orderResult.order.id;
    const paymentIntentId = orderResult.order.stripePaymentIntentId || candidateIntentId;
    const amount = Math.round(totalAmount * 100);

    return res.status(orderResult.replayed ? 200 : 201).json({
      data: {
        paymentIntentId,
        clientSecret: `cs_${paymentIntentId}`,
        amount,
        currency: normalizeCurrency(req.body.currency),
        customer_email: req.body.email,
        metadata: {
          orderId,
          userId: req.auth.sub,
          idempotencyKey: req.body.idempotencyKey,
        },
      },
      meta: {
        replayed: orderResult.replayed,
        isGuestCheckout: req.auth.isGuest === true,
        ...(res.locals.implicitGuestToken ? { guestSessionToken: res.locals.implicitGuestToken } : {}),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;