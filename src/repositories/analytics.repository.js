import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

export const analyticsRepository = {
  async create(data) {
    try { return await prisma.analyticsEvent.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'analytics', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.analyticsEvent.findUnique({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'analytics', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.analyticsEvent.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'analytics', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.analyticsEvent.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'analytics', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 100, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.analyticsEvent.findMany({ skip, take, where, orderBy }); } catch (error) { normalizeDbError(error, { repository: 'analytics', operation: 'list' }); }
  },
};

export default analyticsRepository;