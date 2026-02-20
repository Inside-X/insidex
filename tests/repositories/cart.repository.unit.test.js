import { jest } from '@jest/globals';

async function loadCartRepository() {
  jest.resetModules();

  const prismaMock = {
    cart: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    cartItem: {
      upsert: jest.fn(),
    },
  };

  const normalizeDbError = jest.fn((error) => {
    throw error;
  });

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { cartRepository } = await import('../../src/repositories/cart.repository.js');
  return { cartRepository, prismaMock, normalizeDbError };
}

describe('cartRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('findById includes items relation', async () => {
    const { cartRepository, prismaMock } = await loadCartRepository();
    prismaMock.cart.findUnique.mockResolvedValueOnce({ id: 'c1', items: [] });

    await expect(cartRepository.findById('c1')).resolves.toEqual({ id: 'c1', items: [] });
    expect(prismaMock.cart.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' }, include: { items: true } });
  });

  test.each([
    ['create', ['create', [{ userId: 'u1' }], { data: { userId: 'u1' } }]],
    ['update', ['update', ['c1', { updatedAt: 'now' }], { where: { id: 'c1' }, data: { updatedAt: 'now' } }]],
    ['delete', ['delete', ['c1'], { where: { id: 'c1' } }]],
  ])('%s success path', async (_, [op, args, expectedCall]) => {
    const { cartRepository, prismaMock, normalizeDbError } = await loadCartRepository();
    const expected = { id: `res-${op}` };
    prismaMock.cart[op].mockResolvedValueOnce(expected);

    await expect(cartRepository[op](...args)).resolves.toEqual(expected);
    expect(prismaMock.cart[op]).toHaveBeenCalledWith(expectedCall);
    expect(normalizeDbError).not.toHaveBeenCalled();
  });

  test.each([
    ['create', ['create', [{ userId: 'u1' }], 'create']],
    ['findById', ['findUnique', ['c1'], 'findById']],
    ['update', ['update', ['c1', { active: false }], 'update']],
    ['delete', ['delete', ['c1'], 'delete']],
  ])('%s failure path normalizes db error', async (_, [op, args, operation]) => {
    const { cartRepository, prismaMock, normalizeDbError } = await loadCartRepository();
    const dbError = Object.assign(new Error(`${operation} failed`), { code: '40P01' });
    prismaMock.cart[op].mockRejectedValueOnce(dbError);

    const repoMethod = operation === 'findById' ? 'findById' : op;
    await expect(cartRepository[repoMethod](...args)).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'cart', operation });
  });

  test('list defaults include related items', async () => {
    const { cartRepository, prismaMock } = await loadCartRepository();
    prismaMock.cart.findMany.mockResolvedValueOnce([{ id: 'c1' }]);

    await expect(cartRepository.list()).resolves.toEqual([{ id: 'c1' }]);
    expect(prismaMock.cart.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      where: {},
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  });

  test('list accepts explicit null/empty filters and pagination edges', async () => {
    const { cartRepository, prismaMock } = await loadCartRepository();
    const params = { skip: 0, take: 1, where: {}, orderBy: { createdAt: 'asc' } };
    prismaMock.cart.findMany.mockResolvedValueOnce([]);

    await expect(cartRepository.list(params)).resolves.toEqual([]);
    expect(prismaMock.cart.findMany).toHaveBeenCalledWith({ ...params, include: { items: true } });
  });


  test('list failure normalizes db error', async () => {
    const { cartRepository, prismaMock, normalizeDbError } = await loadCartRepository();
    const dbError = Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' });
    prismaMock.cart.findMany.mockRejectedValueOnce(dbError);

    await expect(cartRepository.list({ where: { userId: 'u1' } })).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'cart', operation: 'list' });
  });

  test('upsertItem success builds composite key and create/update payload', async () => {
    const { cartRepository, prismaMock } = await loadCartRepository();
    const result = { id: 'ci1', quantity: 10 };
    prismaMock.cartItem.upsert.mockResolvedValueOnce(result);

    await expect(cartRepository.upsertItem('c1', 'p1', 10)).resolves.toEqual(result);
    expect(prismaMock.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_productId: { cartId: 'c1', productId: 'p1' } },
      create: { cartId: 'c1', productId: 'p1', quantity: 10 },
      update: { quantity: 10 },
    });
  });

  test('upsertItem propagates unique violation via normalizeDbError', async () => {
    const { cartRepository, prismaMock, normalizeDbError } = await loadCartRepository();
    const dbError = Object.assign(new Error('unique fail'), { code: 'P2002' });
    prismaMock.cartItem.upsert.mockRejectedValueOnce(dbError);

    await expect(cartRepository.upsertItem('c1', 'p1', 2)).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'cart', operation: 'upsertItem' });
  });
});