import { jest } from '@jest/globals';

async function loadProductRepository({ normalizeImpl } = {}) {
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

  const normalizeDbError = jest.fn(normalizeImpl || ((error) => {
    throw error;
  }));

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

  test('createAdminProduct delegates correctly with faithful product and media persistence', async () => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository();
    const payload = {
      name: 'Amani Chair',
      slug: 'amani-chair',
      shortDescription: 'Oak chair with woven seat.',
      description: 'Full product description.',
      price: '129.90',
      currency: 'EUR',
      stock: 8,
      status: 'draft',
      media: [
        {
          id: 'media_001',
          url: 'https://cdn.example.com/products/amani-chair/main.jpg',
          alt: 'Amani Chair front view',
          sortOrder: 0,
          isPrimary: true,
          kind: 'image',
        },
      ],
    };
    const expected = { id: 'prod_1' };
    prismaMock.product.create.mockResolvedValueOnce(expected);

    await expect(productRepository.createAdminProduct(payload)).resolves.toEqual(expected);
    expect(prismaMock.product.create).toHaveBeenCalledWith({
      data: {
        name: 'Amani Chair',
        slug: 'amani-chair',
        shortDescription: 'Oak chair with woven seat.',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
        status: 'draft',
        images: {
          create: [
            {
              id: 'media_001',
              url: 'https://cdn.example.com/products/amani-chair/main.jpg',
              alt: 'Amani Chair front view',
              isPrimary: true,
              kind: 'image',
              position: 0,
            },
          ],
        },
      },
    });
    expect(normalizeDbError).not.toHaveBeenCalled();
  });

  test('updateAdminProductById delegates correctly with shortDescription and published status', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1' });

    await productRepository.updateAdminProductById('prod_1', {
      name: 'Amani Lounge Chair',
      slug: 'amani-lounge-chair',
      shortDescription: 'Updated short summary.',
      description: 'Updated description.',
      price: '149.90',
      currency: 'EUR',
      stock: 5,
      status: 'published',
    });

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: {
        name: 'Amani Lounge Chair',
        slug: 'amani-lounge-chair',
        shortDescription: 'Updated short summary.',
        description: 'Updated description.',
        price: '149.90',
        currency: 'EUR',
        stock: 5,
        status: 'published',
      },
    });
  });

  test('publishProductById delegates correctly', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1', status: 'published' });

    await productRepository.publishProductById('prod_1');

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { status: 'published' },
    });
  });

  test('unpublishProductById delegates correctly', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1', status: 'draft' });

    await productRepository.unpublishProductById('prod_1');

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { status: 'draft' },
    });
  });

  test('replaceProductMediaById delegates correctly with explicit deterministic ordering and faithful media fields', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1' });

    await productRepository.replaceProductMediaById('prod_1', [
      {
        id: 'media_002',
        url: 'https://cdn.example.com/products/amani-chair/side.jpg',
        alt: 'Amani Chair side view',
        sortOrder: 1,
        isPrimary: false,
        kind: 'image',
      },
      {
        id: 'media_001',
        url: 'https://cdn.example.com/products/amani-chair/main.jpg',
        alt: 'Amani Chair front view',
        sortOrder: 0,
        isPrimary: true,
        kind: 'image',
      },
    ]);

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: {
        images: {
          deleteMany: {},
          create: [
            {
              id: 'media_001',
              url: 'https://cdn.example.com/products/amani-chair/main.jpg',
              alt: 'Amani Chair front view',
              isPrimary: true,
              kind: 'image',
              position: 0,
            },
            {
              id: 'media_002',
              url: 'https://cdn.example.com/products/amani-chair/side.jpg',
              alt: 'Amani Chair side view',
              isPrimary: false,
              kind: 'image',
              position: 1,
            },
          ],
        },
      },
    });
  });

  test.each([
    ['createAdminProduct', 'create', [{ name: 'Amani Chair', slug: 'amani-chair' }], 'createAdminProduct', Object.assign(new Error('unique fail'), { code: 'P2002' }), new Error('mapped unique')],
    ['updateAdminProductById', 'update', ['prod_1', { name: 'Updated' }], 'updateAdminProductById', Object.assign(new Error('not found'), { code: 'P2025' }), new Error('mapped not found')],
    ['publishProductById', 'update', ['prod_1'], 'publishProductById', new Error('publish fail'), new Error('mapped publish')],
    ['unpublishProductById', 'update', ['prod_1'], 'unpublishProductById', new Error('unpublish fail'), new Error('mapped unpublish')],
    ['replaceProductMediaById', 'update', ['prod_1', []], 'replaceProductMediaById', new Error('db exploded'), new Error('mapped generic')],
  ])('%s propagates normalized failures', async (method, op, args, operation, dbError, mappedError) => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository({
      normalizeImpl: () => {
        throw mappedError;
      },
    });
    prismaMock.product[op].mockRejectedValueOnce(dbError);

    await expect(productRepository[method](...args)).rejects.toThrow(mappedError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'product', operation });
  });
});