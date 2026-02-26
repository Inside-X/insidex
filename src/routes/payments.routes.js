import crypto from 'crypto';
import express from 'express';
import prisma from '../lib/prisma.js';
import { paymentsSchemas } from '../validation/schemas/index.js';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import ensureCheckoutSessionJWT from '../middlewares/checkoutIdentity.js';
import authenticateJWT from '../middlewares/authenticate.js';
import checkoutCustomerAccess from '../middlewares/checkoutCustomerAccess.js';
import { orderRepository } from '../repositories/order.repository.js';
import { sendApiError } from '../utils/api-error.js';
import { multiplyMinorUnits, sumMinorUnits, toMinorUnits } from '../utils/minor-units.js';
import { logger } from '../utils/logger.js';
import { assertDatabaseReady, isDependencyUnavailableError } from '../lib/critical-dependencies.js';

const router = express.Router();
const SUPPORTED_CURRENCIES = new Set(['EUR', 'USD']);


function normalizeCurrency(currency) {
  return String(currency || 'EUR').trim().toUpperCase();
}



router.post('/create-intent', strictValidate(paymentsSchemas.createIntent), ensureCheckoutSessionJWT, authenticateJWT, checkoutCustomerAccess, async (req, res, next) => {
  try {
    await assertDatabaseReady();

    const currency = normalizeCurrency(req.body.currency);
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      return sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Unsupported currency');
    }

    const requestedItems = req.body.items;
    const productIds = requestedItems.map((item) => item.id);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
      select: { id: true, price: true },
    });

    if (products.length !== productIds.length) {
      return sendApiError(req, res, 404, 'NOT_FOUND', 'One or more products were not found');
    }

    const productMap = new Map(products.map((product) => [product.id, toMinorUnits(product.price)]));
    const lineItems = requestedItems.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
      dbUnitPriceMinor: productMap.get(item.id),
    }));

    const totalAmountMinor = sumMinorUnits(lineItems.map((item) => multiplyMinorUnits(item.dbUnitPriceMinor, item.quantity)));
    const candidateIntentId = `pi_${crypto.randomUUID().replace(/-/g, '')}`;

    const orderResult = await orderRepository.createPendingPaymentOrder({
      userId: req.auth.sub,
      items: lineItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      idempotencyKey: req.body.idempotencyKey,
      stripePaymentIntentId: candidateIntentId,
      expectedTotalAmountMinor: totalAmountMinor,
    });

    const orderId = orderResult.order.id;
    const paymentIntentId = orderResult.order.stripePaymentIntentId || candidateIntentId;

    return res.status(orderResult.replayed ? 200 : 201).json({
      data: {
        paymentIntentId,
        clientSecret: `cs_${paymentIntentId}`,
        amount: totalAmountMinor,
        currency,
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
    if (isDependencyUnavailableError(error)) {
      logger.error('critical_dependency_unavailable', {
        endpoint: 'POST /api/payments/create-intent',
        reasonCode: 'db_unavailable',
        reason: error?.code || error?.message,
        correlationId: req.requestId || req.get('x-request-id') || 'unknown',
      });
      return sendApiError(req, res, 503, 'SERVICE_UNAVAILABLE', 'Critical dependency unavailable');
    }
    return next(error);
  }
});

export default router;