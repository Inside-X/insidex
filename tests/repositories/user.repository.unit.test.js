import { jest } from '@jest/globals';

async function loadRepository({ prismaOverrides = {}, normalizeImpl } = {}) {
  jest.resetModules();

  const prismaMock = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      ...prismaOverrides,
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

describe('userRepository (unit, mocked prisma)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('create() success calls prisma.user.create with exact payload', async () => {
    const payload = { email: 'john@example.com', role: 'customer' };
    const created = { id: 'u-1', ...payload };
    const { userRepository, prismaMock } = await loadRepository();
    prismaMock.user.create.mockResolvedValueOnce(created);

    await expect(userRepository.create(payload)).resolves.toEqual(created);
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: payload });
  });

  test('create() failure normalizes prisma error with exact context', async () => {
    const dbError = new Error('create failed');
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_OPERATION_FAILED', statusCode: 500 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({
      normalizeImpl: () => {
        throw mapped;
      },
    });
    prismaMock.user.create.mockRejectedValueOnce(dbError);

    await expect(userRepository.create({ email: 'bad@example.com' })).rejects.toBe(mapped);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'create' });
  });

  test('createGuest() ignores payload email and persists isolated generated guest email', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const { userRepository, prismaMock } = await loadRepository();
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'guest-1', isGuest: true });

    await userRepository.createGuest({ email: 'attacker@example.com', address: '123 Rue Test' });

    const expectedEmail = 'guest-1700000000000-4fzzzxjylr@guest.insidex.local';
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: expectedEmail } });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: expectedEmail,
        role: 'customer',
        isGuest: true,
        guestAddress: '123 Rue Test',
      },
    });
    expect(prismaMock.user.create.mock.calls[0][0].data.email).not.toBe('attacker@example.com');
  });

  test('createGuest() retries when generated email already exists for guest user', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy
      .mockReturnValueOnce(0.111111111)
      .mockReturnValueOnce(0.222222222);

    const { userRepository, prismaMock } = await loadRepository();
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'existing-guest', isGuest: true })
      .mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'guest-2', isGuest: true });

    await userRepository.createGuest({ email: 'ignored@example.com', address: 'retry addr' });

    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
  });

  test('createGuest() throws guard error if generated email resolves to non-guest user', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.111111111);

    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({
      normalizeImpl: (error) => {
        throw error;
      },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'regular-user', isGuest: false });

    await expect(userRepository.createGuest({ email: 'ignored@example.com', address: 'x' })).rejects.toMatchObject({
      statusCode: 500,
      code: 'GUEST_ISOLATION_VIOLATION',
      message: 'Guest isolation violation: resolved non-guest user during guest provisioning',
    });

    const forwardedError = normalizeDbError.mock.calls[0][0];
    expect(forwardedError).toMatchObject({ statusCode: 500, code: 'GUEST_ISOLATION_VIOLATION' });
    expect(normalizeDbError).toHaveBeenCalledWith(forwardedError, { repository: 'user', operation: 'createGuest' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  test('createGuest() fails after 5 collisions and normalizes exhaustion error', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.333333333);

    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({
      normalizeImpl: (error) => {
        throw error;
      },
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'guest-existing', isGuest: true });

    await expect(userRepository.createGuest({ email: 'x@y.z', address: 'x' })).rejects.toMatchObject({
      statusCode: 500,
      code: 'GUEST_ISOLATION_VIOLATION',
      message: 'Unable to provision isolated guest identity',
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(5);
    expect(normalizeDbError).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  test('createGuest() normalizes findUnique prisma rejection', async () => {
    const dbError = new Error('findUnique failed');
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_OPERATION_FAILED', statusCode: 500 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });
    prismaMock.user.findUnique.mockRejectedValueOnce(dbError);

    await expect(userRepository.createGuest({ email: 'ignored@example.com', address: 'x' })).rejects.toBe(mapped);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'createGuest' });
  });

  test('createGuest() normalizes create prisma rejection after unique email reservation', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.444444444);

    const dbError = new Error('create guest failed');
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_UNIQUE_CONSTRAINT', statusCode: 409 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockRejectedValueOnce(dbError);

    await expect(userRepository.createGuest({ email: 'ignored@example.com', address: 'x' })).rejects.toBe(mapped);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'createGuest' });
  });

  test('findById() returns null when user does not exist', async () => {
    const { userRepository, prismaMock } = await loadRepository();
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(userRepository.findById('missing-id')).resolves.toBeNull();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: 'missing-id' } });
  });

  test('findById() invalid argument path normalizes thrown prisma error', async () => {
    const dbError = Object.assign(new Error('invalid id'), { code: 'P2023' });
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_OPERATION_FAILED', statusCode: 500 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });
    prismaMock.user.findUnique.mockRejectedValueOnce(dbError);

    await expect(userRepository.findById(undefined)).rejects.toBe(mapped);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: undefined } });
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'findById' });
  });

  test('findByEmail() returns null for empty result', async () => {
    const { userRepository, prismaMock } = await loadRepository();
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(userRepository.findByEmail('nobody@example.com')).resolves.toBeNull();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: 'nobody@example.com' } });
  });

  test('findByEmail() invalid argument path normalizes error', async () => {
    const dbError = new Error('invalid email');
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_OPERATION_FAILED', statusCode: 500 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });
    prismaMock.user.findUnique.mockRejectedValueOnce(dbError);

    await expect(userRepository.findByEmail(null)).rejects.toBe(mapped);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: null } });
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'findByEmail' });
  });

  test('update() success uses exact where/data parameters', async () => {
    const { userRepository, prismaMock } = await loadRepository();
    const updated = { id: 'u-2', role: 'admin' };
    prismaMock.user.update.mockResolvedValueOnce(updated);

    await expect(userRepository.update('u-2', { role: 'admin' })).resolves.toEqual(updated);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'u-2' }, data: { role: 'admin' } });
  });

  test('update() failure normalizes prisma error', async () => {
    const dbError = Object.assign(new Error('record missing'), { code: 'P2025' });
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_RECORD_NOT_FOUND', statusCode: 404 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });
    prismaMock.user.update.mockRejectedValueOnce(dbError);

    await expect(userRepository.update('missing-id', { role: 'admin' })).rejects.toBe(mapped);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'update' });
  });

  test('delete() success uses exact where parameter', async () => {
    const { userRepository, prismaMock } = await loadRepository();
    const deleted = { id: 'u-del' };
    prismaMock.user.delete.mockResolvedValueOnce(deleted);

    await expect(userRepository.delete('u-del')).resolves.toEqual(deleted);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'u-del' } });
  });

  test('delete() failure normalizes prisma error', async () => {
    const dbError = new Error('delete failed');
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_OPERATION_FAILED', statusCode: 500 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });
    prismaMock.user.delete.mockRejectedValueOnce(dbError);

    await expect(userRepository.delete('u-del')).rejects.toBe(mapped);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'delete' });
  });

  test('list() uses defaults and returns empty array', async () => {
    const { userRepository, prismaMock } = await loadRepository();
    prismaMock.user.findMany.mockResolvedValueOnce([]);

    await expect(userRepository.list()).resolves.toEqual([]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });

  test('list() uses caller supplied pagination and filters with exact parameters', async () => {
    const { userRepository, prismaMock } = await loadRepository();
    const rows = [{ id: 'u-1' }];
    prismaMock.user.findMany.mockResolvedValueOnce(rows);

    const params = {
      skip: 20,
      take: 10,
      where: { isGuest: true },
      orderBy: { email: 'asc' },
    };

    await expect(userRepository.list(params)).resolves.toEqual(rows);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(params);
  });

  test('list() edge-case params (null/undefined values) are passed through and prisma error is normalized', async () => {
    const dbError = new Error('invalid pagination');
    const mapped = Object.assign(new Error('mapped'), { code: 'DB_OPERATION_FAILED', statusCode: 500 });
    const { userRepository, prismaMock, normalizeDbError } = await loadRepository({ normalizeImpl: () => { throw mapped; } });
    prismaMock.user.findMany.mockRejectedValueOnce(dbError);

    await expect(userRepository.list({ skip: undefined, take: null, where: null, orderBy: null })).rejects.toBe(mapped);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: null,
      where: null,
      orderBy: null,
    });
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'user', operation: 'list' });
  });
});