import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

export const leadRepository = {
  async create(data) {
    try { return await prisma.lead.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'lead', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.lead.findUnique({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'lead', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.lead.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'lead', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.lead.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'lead', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.lead.findMany({ skip, take, where, orderBy }); } catch (error) { normalizeDbError(error, { repository: 'lead', operation: 'list' }); }
  },
};

export default leadRepository;