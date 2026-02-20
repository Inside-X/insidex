import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';
import { fromMinorUnits, multiplyMinorUnits, sumMinorUnits, toMinorUnits } from '../utils/minor-units.js';

function uniqueProductItems(items) {
  const byProduct = new Map();
  for (const item of items) {
    const previous = byProduct.get(item.productId) || 0;
    byProduct.set(item.productId, previous + item.quantity);
  }

  return [...byProduct.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function assertExpectedAmountMatches({ expectedTotalAmount, expectedTotalAmountMinor, totalAmountMinor, currency = 'EUR' }) {
  if (expectedTotalAmountMinor !== undefined && expectedTotalAmountMinor !== null) {
    if (!Number.isInteger(expectedTotalAmountMinor) || expectedTotalAmountMinor < 0) {
      const error = new Error('Invalid expected total amount');
      error.statusCode = 400;
      throw error;
    }

    if (expectedTotalAmountMinor !== totalAmountMinor) {
      const error = new Error(`Amount mismatch: expected ${expectedTotalAmountMinor}, computed ${totalAmountMinor}`);
      error.statusCode = 400;
      throw error;
    }
    return;
  }

  if (expectedTotalAmount === undefined || expectedTotalAmount === null) {
    return;
  }

  let expectedMinor;
  try {
    expectedMinor = toMinorUnits(String(expectedTotalAmount), currency);
  } catch {
    const error = new Error('Invalid expected total amount');
    error.statusCode = 400;
    throw error;
  }

  if (expectedMinor !== totalAmountMinor) {
    const error = new Error(`Amount mismatch: expected ${expectedMinor}, computed ${totalAmountMinor}`);
    error.statusCode = 400;
    throw error;
  }
}

function isUniqueConstraintOnTarget(error, targetField) {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (Array.isArray(target)) return target.includes(targetField);
  if (typeof target === 'string') return target.includes(targetField);
  return false;
}

function extractWebhookResourceId({ provider, paymentIntentId = null, payload = {} }) {
  if (provider === 'stripe') {
    return paymentIntentId || payload?.data?.object?.id || null;
  }

  if (provider === 'paypal') {
    return payload?.payload?.capture?.id || payload?.payload?.resource?.id || null;
  }

  return null;
}

export const orderRepository = {
  async create(data) {
    try { return await prisma.order.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.order.findUnique({ where: { id }, include: { items: true } }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.order.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.order.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.order.findMany({ skip, take, where, orderBy, include: { items: true } }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'list' }); }
  },

  async createIdempotentWithItemsAndUpdateStock({ userId, items, idempotencyKey, stripePaymentIntentId = null, status = 'pending' }) {
    const normalizedItems = uniqueProductItems(items);

    try {
      return await prisma.$transaction(async (tx) => {
        const productIds = normalizedItems.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, price: true },
        });

        if (products.length !== productIds.length) {
          const existing = new Set(products.map((product) => product.id));
          const missingProductId = productIds.find((productId) => !existing.has(productId));
          const error = new Error(`Product not found: ${missingProductId}`);
          error.statusCode = 404;
          throw error;
        }

        const productMap = new Map(products.map((product) => [product.id, product]));

        const totalAmountMinor = sumMinorUnits(normalizedItems.map((item) => {
          const product = productMap.get(item.productId);
          const unitMinor = toMinorUnits(String(product.price));
          return multiplyMinorUnits(unitMinor, item.quantity);
        }));

        let order;
        try {
          order = await tx.order.create({
            data: {
              userId,
              status,
              idempotencyKey,
              stripePaymentIntentId,
              totalAmount: fromMinorUnits(totalAmountMinor),
            },
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            const existingOrder = await tx.order.findFirst({ where: { userId, idempotencyKey } });
            if (existingOrder) {
              return { order: existingOrder, replayed: true };
            }
          }
          throw error;
        }

        for (const item of normalizedItems) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });

          if (updated.count !== 1) {
            const error = new Error(`Insufficient stock for product: ${item.productId}`);
            error.statusCode = 400;
            throw error;
          }
        }

        await tx.orderItem.createMany({
          data: normalizedItems.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: productMap.get(item.productId).price,
          })),
        });

        const completeOrder = await tx.order.findUnique({ where: { id: order.id }, include: { items: true } });

        return { order: completeOrder, replayed: false };
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'createIdempotentWithItemsAndUpdateStock' });
    }
  },

  /**
   * Pending payment order with atomic stock reservation.
   * - idempotencyKey unique => replay-safe
   * - all stock updates occur in one transaction with rollback on first failure
   */
  async createPendingPaymentOrder({ userId, items, idempotencyKey, stripePaymentIntentId, expectedTotalAmount = undefined, expectedTotalAmountMinor = undefined }) {
    const normalizedItems = uniqueProductItems(items);

    try {
      return await prisma.$transaction(async (tx) => {
        const productIds = normalizedItems.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, active: true },
          select: { id: true, price: true },
        });

        if (products.length !== productIds.length) {
          const existing = new Set(products.map((product) => product.id));
          const missingProductId = productIds.find((productId) => !existing.has(productId));
          const error = new Error(`Product not found: ${missingProductId}`);
          error.statusCode = 404;
          throw error;
        }

        const productMap = new Map(products.map((product) => [product.id, product]));
        const totalAmountMinor = sumMinorUnits(normalizedItems.map((item) => {
          const unitMinor = toMinorUnits(String(productMap.get(item.productId).price));
          return multiplyMinorUnits(unitMinor, item.quantity);
        }));

        assertExpectedAmountMatches({ expectedTotalAmount, expectedTotalAmountMinor, totalAmountMinor });

        let order;
        try {
          order = await tx.order.create({
            data: {
              userId,
              status: 'pending',
              idempotencyKey,
              stripePaymentIntentId,
              totalAmount: fromMinorUnits(totalAmountMinor),
            },
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            const existingOrder = await tx.order.findFirst({ where: { userId, idempotencyKey }, include: { items: true } });
            if (existingOrder) {
              return { order: existingOrder, replayed: true };
            }
          }
          throw error;
        }

        // Reserve stock atomically for all order items.
        for (const item of normalizedItems) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });

          if (updated.count !== 1) {
            const error = new Error(`Insufficient stock for product: ${item.productId}`);
            error.statusCode = 400;
            throw error;
          }
        }

        await tx.orderItem.createMany({
          data: normalizedItems.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: productMap.get(item.productId).price,
          })),
        });

        const completeOrder = await tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
        return { order: completeOrder, replayed: false };
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'createPendingPaymentOrder' });
    }
  },

  async markPaidFromWebhook({ eventId, paymentIntentId, orderId, userId, expectedIdempotencyKey, provider = 'stripe', payload = {} }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const resourceId = extractWebhookResourceId({ provider, paymentIntentId, payload });

        try {
          await tx.paymentWebhookEvent.create({
            data: {
              provider,
              eventId,
              resourceId,
              orderId,
              payload,
            },
          });
        } catch (error) {
          if (isUniqueConstraintOnTarget(error, 'event_id') || isUniqueConstraintOnTarget(error, 'resource_id') || error?.code === 'P2002') {
            return { replayed: true, orderMarkedPaid: false };
          }
          throw error;
        }

        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) {
          const error = new Error(`Order not found: ${orderId}`);
          error.statusCode = 404;
          throw error;
        }

        if (order.userId !== userId || order.idempotencyKey !== expectedIdempotencyKey) {
          const error = new Error('Webhook metadata mismatch for order identity/idempotency');
          error.statusCode = 400;
          throw error;
        }

        if (order.status === 'paid') {
          return { replayed: true, orderMarkedPaid: false };
        }

        const updateResult = await tx.order.updateMany({
          where: { id: orderId, status: { not: 'paid' } },
          data: {
            status: 'paid',
            stripePaymentIntentId: paymentIntentId || order.stripePaymentIntentId,
          },
        });

        return { replayed: false, orderMarkedPaid: updateResult.count === 1 };
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'markPaidFromWebhook' });
    }
  },

  async processPaymentWebhookEvent({ provider, eventId, orderId = null, stripePaymentIntentId = null, payload = {} }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const resourceId = extractWebhookResourceId({ provider, paymentIntentId: stripePaymentIntentId, payload });

        try {
          await tx.paymentWebhookEvent.create({
            data: {
              provider,
              eventId,
              resourceId,
              orderId,
              payload,
            },
          });
        } catch (error) {
          if (isUniqueConstraintOnTarget(error, 'event_id') || isUniqueConstraintOnTarget(error, 'resource_id') || error?.code === 'P2002') {
            return { replayed: true, orderMarkedPaid: false };
          }
          throw error;
        }

        if (payload?.metadata?.idempotencyKey) {
          const existingOrder = await tx.order.findUnique({ where: { id: orderId } });
          if (!existingOrder || existingOrder.idempotencyKey !== payload.metadata.idempotencyKey) {
            const error = new Error('Webhook idempotency key mismatch');
            error.statusCode = 400;
            throw error;
          }

          if (existingOrder.status === 'paid') {
            return { replayed: true, orderMarkedPaid: false };
          }
        }
        
        const where = orderId
          ? { id: orderId, status: { not: 'paid' } }
          : { stripePaymentIntentId, status: { not: 'paid' } };

        const data = {
          status: 'paid',
          ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
        };

        const updateResult = await tx.order.updateMany({ where, data });

        return {
          replayed: false,
          orderMarkedPaid: updateResult.count === 1,
        };
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'processPaymentWebhookEvent' });
    }
  },
};

export default orderRepository;