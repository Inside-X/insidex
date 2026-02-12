import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

export const productRepository = {
  async create(data) {
    try { return await prisma.product.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.product.findUnique({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.product.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.product.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.product.findMany({ skip, take, where, orderBy }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'list' }); }
  },
};

export default productRepository;