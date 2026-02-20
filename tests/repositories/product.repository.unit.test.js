import { jest } from '@jest/globals';

async function loadProductRepository() {
  jest.resetModules();

  const prismaMock = {
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const normalizeDbError = jest.fn((error) => {
    throw error;
  });

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { productRepository } = await import('../../src/repositories/product.repository.js');
  return { productRepository, prismaMock, normalizeDbError };
}

describe('productRepository', () => {
  test.each([
    ['create', 'create', [{ name: 'Widget', price: '2.50' }], { data: { name: 'Widget', price: '2.50' } }],
    ['findById', 'findUnique', ['p1'], { where: { id: 'p1' } }],
    ['update', 'update', ['p1', { active: false }], { where: { id: 'p1' }, data: { active: false } }],
    ['delete', 'delete', ['p1'], { where: { id: 'p1' } }],
  ])('%s success path', async (method, op, args, expectedCall) => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository();
    const expected = { id: 'ok' };
    prismaMock.product[op].mockResolvedValueOnce(expected);

    await expect(productRepository[method](...args)).resolves.toEqual(expected);
    expect(prismaMock.product[op]).toHaveBeenCalledWith(expectedCall);
    expect(normalizeDbError).not.toHaveBeenCalled();
  });

  test.each([
    ['create', 'create', [{ name: 'x' }], 'create'],
    ['findById', 'findUnique', ['p1'], 'findById'],
    ['update', 'update', ['p1', { active: true }], 'update'],
    ['delete', 'delete', ['p1'], 'delete'],
    ['list', 'findMany', [{ where: { active: true } }], 'list'],
  ])('%s failure path routes through normalizeDbError', async (method, op, args, operation) => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository();
    const dbError = new Error('deadlock detected');
    prismaMock.product[op].mockRejectedValueOnce(dbError);

    await expect(productRepository[method](...args)).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'product', operation });
  });

  test('list defaults', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.findMany.mockResolvedValueOnce([]);

    await expect(productRepository.list()).resolves.toEqual([]);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });

  test('list with explicit large pagination', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    const params = { skip: 10000, take: 1000, where: { active: false }, orderBy: { createdAt: 'asc' } };
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p2' }]);

    await expect(productRepository.list(params)).resolves.toEqual([{ id: 'p2' }]);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(params);
  });
});