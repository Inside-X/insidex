import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

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

  // Transaction example: create order + order items + stock update atomically.
  async createWithItemsAndUpdateStock({ userId, items, status = 'pending' }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const productIds = items.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, price: true, stock: true },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));

        for (const item of items) {
          const product = productMap.get(item.productId);
          if (!product) {
            const error = new Error(`Product not found: ${item.productId}`);
            error.statusCode = 404;
            throw error;
          }
          if (product.stock < item.quantity) {
            const error = new Error(`Insufficient stock for product: ${item.productId}`);
            error.statusCode = 409;
            throw error;
          }
        }

        const totalAmount = items.reduce((sum, item) => {
          const product = productMap.get(item.productId);
          return sum + Number(product.price) * item.quantity;
        }, 0);

        const order = await tx.order.create({
          data: {
            userId,
            status,
            totalAmount,
            items: {
              create: items.map((item) => {
                const product = productMap.get(item.productId);
                return {
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: product.price,
                };
              }),
            },
          },
          include: { items: true },
        });

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        return order;
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'createWithItemsAndUpdateStock' });
    }
  },
};

export default orderRepository;