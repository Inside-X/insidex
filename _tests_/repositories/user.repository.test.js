import { jest } from '@jest/globals';

async function loadUserRepository({ normalizeImpl } = {}) {
  jest.resetModules();

  const prismaMock = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const normalizeDbError = jest.fn(normalizeImpl || ((error) => {
    throw error;
  }));

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { userRepository } = await import('../../src/repositories/user.repository.js');
  return { userRepository, prismaMock, normalizeDbError };
}

describe('userRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CRUD and list', () => {
    test.each([
      ['create', 'create', [{ email: 'a@b.c', role: 'customer' }], { data: { email: 'a@b.c', role: 'customer' } }, 'create'],
      ['findById', 'findUnique', ['u1'], { where: { id: 'u1' } }, 'findById'],
      ['findByEmail', 'findUnique', ['x@y.z'], { where: { email: 'x@y.z' } }, 'findByEmail'],
      ['update', 'update', ['u1', { role: 'admin' }], { where: { id: 'u1' }, data: { role: 'admin' } }, 'update'],
      ['delete', 'delete', ['u1'], { where: { id: 'u1' } }, 'delete'],
    ])('%s success and failure', async (method, op, args, expectedCall, operation) => {
      const { userRepository, prismaMock, normalizeDbError } = await loadUserRepository();
      const ok = { id: 'ok' };
      const dbErr = new Error('connection reset');

      prismaMock.user[op].mockResolvedValueOnce(ok);
      await expect(userRepository[method](...args)).resolves.toEqual(ok);
      expect(prismaMock.user[op]).toHaveBeenCalledWith(expectedCall);

      prismaMock.user[op].mockRejectedValueOnce(dbErr);
      await expect(userRepository[method](...args)).rejects.toThrow(dbErr);
      expect(normalizeDbError).toHaveBeenLastCalledWith(dbErr, { repository: 'user', operation });
    });

    test('list defaults and explicit params', async () => {
      const { userRepository, prismaMock, normalizeDbError } = await loadUserRepository();
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u2' }]).mockResolvedValueOnce([]);

      await expect(userRepository.list()).resolves.toEqual([{ id: 'u2' }]);
      expect(prismaMock.user.findMany).toHaveBeenNthCalledWith(1, {
        skip: 0,
        take: 50,
        where: {},
        orderBy: { createdAt: 'desc' },
      });

      const params = { skip: 10, take: 0, where: { isGuest: true }, orderBy: { createdAt: 'asc' } };
      await expect(userRepository.list(params)).resolves.toEqual([]);
      expect(prismaMock.user.findMany).toHaveBeenNthCalledWith(2, params);
      expect(normalizeDbError).not.toHaveBeenCalled();
    });

    test('list failure normalizes db errors', async () => {
      const { userRepository, prismaMock, normalizeDbError } = await loadUserRepository();
      const dbErr = Object.assign(new Error('serialization failure'), { code: '40001' });
      prismaMock.user.findMany.mockRejectedValueOnce(dbErr);

      await expect(userRepository.list({ where: { role: 'admin' } })).rejects.toThrow(dbErr);
      expect(normalizeDbError).toHaveBeenCalledWith(dbErr, { repository: 'user', operation: 'list' });
    });
  });

  describe('createGuest', () => {
    test('creates guest profile and ignores payload email', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      jest.spyOn(Math, 'random').mockReturnValue(0.1);

      const { userRepository, prismaMock } = await loadUserRepository();
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({ id: 'g1', isGuest: true });

      await userRepository.createGuest({ email: 'attacker@evil.dev', address: '123 test lane' });

      const generated = prismaMock.user.create.mock.calls[0][0].data.email;
      expect(generated).toMatch(/^guest-1700000000000-/);
      expect(generated).toContain('@guest.insidex.local');
      expect(generated).not.toBe('attacker@evil.dev');
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: generated } });
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: generated,
          role: 'customer',
          isGuest: true,
          guestAddress: '123 test lane',
        },
      });
    });

    test('retries collision for existing guest identity then succeeds', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.3);

      const { userRepository, prismaMock } = await loadUserRepository();
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: 'guest-existing', isGuest: true })
        .mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({ id: 'g2' });

      await expect(userRepository.createGuest({ email: null, address: null })).resolves.toEqual({ id: 'g2' });
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2);
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    });

    test('throws guard violation when generated email maps to non-guest account', async () => {
      const { userRepository, prismaMock, normalizeDbError } = await loadUserRepository({
        normalizeImpl: (error) => {
          throw error;
        },
      });
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u-real', isGuest: false });

      await expect(userRepository.createGuest({ email: 'unused@example.com', address: 'x' })).rejects.toMatchObject({
        statusCode: 500,
        code: 'GUEST_ISOLATION_VIOLATION',
      });

      expect(normalizeDbError).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    test('fails after 5 generated collisions', async () => {
      const { userRepository, prismaMock, normalizeDbError } = await loadUserRepository({
        normalizeImpl: (error) => {
          throw error;
        },
      });
      prismaMock.user.findUnique.mockResolvedValue({ id: 'g-existing', isGuest: true });

      await expect(userRepository.createGuest({ email: 'a@b.c', address: 'x' })).rejects.toMatchObject({
        statusCode: 500,
        code: 'GUEST_ISOLATION_VIOLATION',
      });
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(5);
      expect(normalizeDbError).toHaveBeenCalledWith(expect.any(Error), { repository: 'user', operation: 'createGuest' });
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    test('normalizes prisma create error after unique email reservation', async () => {
      const { userRepository, prismaMock, normalizeDbError } = await loadUserRepository();
      const dbError = Object.assign(new Error('db down'), { code: 'P1001' });
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockRejectedValueOnce(dbError);

      await expect(userRepository.createGuest({ email: 'x@y.z', address: 'addr' })).rejects.toThrow(dbError);
      expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'createGuest' });
    });
  });
});