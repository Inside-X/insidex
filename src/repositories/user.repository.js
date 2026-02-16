import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

function buildGuestSystemEmail() {
  const randomToken = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `guest-${randomToken}@guest.insidex.local`;
}

async function reserveUniqueGuestEmail() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateEmail = buildGuestSystemEmail();
    const existing = await prisma.user.findUnique({ where: { email: candidateEmail } });

    if (existing && existing.isGuest === false) {
      const guardError = new Error('Guest isolation violation: resolved non-guest user during guest provisioning');
      guardError.statusCode = 500;
      guardError.code = 'GUEST_ISOLATION_VIOLATION';
      throw guardError;
    }

    if (!existing) {
      return candidateEmail;
    }
  }

  const exhausted = new Error('Unable to provision isolated guest identity');
  exhausted.statusCode = 500;
  exhausted.code = 'GUEST_ISOLATION_VIOLATION';
  throw exhausted;
}

export const userRepository = {
  async create(data) {
    try {
      return await prisma.user.create({ data });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'create' });
    }
  },

  /**
   * Creates an isolated guest profile.
   * Guest identity MUST NEVER be bound to payload email.
   */
  async createGuest({ email, address }) {
    try {
      const _payloadEmail = email;
      void _payloadEmail;
      const systemEmail = await reserveUniqueGuestEmail();

      return await prisma.user.create({
        data: {
          email: systemEmail,
          role: 'customer',
          isGuest: true,
          guestAddress: address,
        },
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'user', operation: 'createGuest' });
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