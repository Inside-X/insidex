import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

export const cartRepository = {
  async create(data) {
    try { return await prisma.cart.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'cart', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.cart.findUnique({ where: { id }, include: { items: true } }); } catch (error) { normalizeDbError(error, { repository: 'cart', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.cart.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'cart', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.cart.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'cart', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.cart.findMany({ skip, take, where, orderBy, include: { items: true } }); } catch (error) { normalizeDbError(error, { repository: 'cart', operation: 'list' }); }
  },

  async upsertItem(cartId, productId, quantity) {
    try {
      return await prisma.cartItem.upsert({
        where: { cartId_productId: { cartId, productId } },
        create: { cartId, productId, quantity },
        update: { quantity },
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'cart', operation: 'upsertItem' });
    }
  },
};

export default cartRepository;