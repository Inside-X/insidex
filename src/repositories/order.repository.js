import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

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

        const totalAmount = normalizedItems.reduce((sum, item) => {
          const product = productMap.get(item.productId);
          return sum + Number(product.price) * item.quantity;
        }, 0);

        let order;
        try {
          order = await tx.order.create({
            data: {
              userId,
              status,
              idempotencyKey,
              stripePaymentIntentId,
              totalAmount,
            },
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            const existingOrder = await tx.order.findUnique({ where: { idempotencyKey } });
            return { order: existingOrder, replayed: true };
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
            error.statusCode = 409;
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

  async processPaymentWebhookEvent({ provider, eventId, orderId = null, stripePaymentIntentId = null, payload = {} }) {
    try {
      return await prisma.$transaction(async (tx) => {
        try {
          await tx.paymentWebhookEvent.create({
            data: {
              provider,
              eventId,
              orderId,
              payload,
            },
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            return { replayed: true, orderMarkedPaid: false };
          }
          throw error;
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