import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

export const userRepository = {
  async create(data) {
    try {
      return await prisma.user.create({ data });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'create' });
    }
  },

  async findById(id) {
    try {
      return await prisma.user.findUnique({ where: { id } });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'findById' });
    }
  },

  async findByEmail(email) {
    try {
      return await prisma.user.findUnique({ where: { email } });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'findByEmail' });
    }
  },

  async update(id, data) {
    try {
      return await prisma.user.update({ where: { id }, data });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'update' });
    }
  },

  async delete(id) {
    try {
      return await prisma.user.delete({ where: { id } });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'delete' });
    }
  },

  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;

    try {
      return await prisma.user.findMany({ skip, take, where, orderBy });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'list' });
    }
  },
};

export default userRepository;