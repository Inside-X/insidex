import { jest } from '@jest/globals';

async function loadCatalogueRepository() {
  jest.resetModules();

  const prismaMock = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const normalizeDbError = jest.fn((error) => {
    throw error;
  });

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { catalogueRepository } = await import('../../src/repositories/catalogue.repository.js');
  return { catalogueRepository, prismaMock, normalizeDbError };
}

describe('catalogueRepository', () => {
  test('listProducts returns items + pagination envelope', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();

    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1', slug: 's1' }]);
    prismaMock.product.count.mockResolvedValueOnce(25);

    await expect(catalogueRepository.listProducts({ page: 2, pageSize: 10 })).resolves.toEqual({
      items: [{ id: 'p1', slug: 's1' }],
      pagination: { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 },
    });

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: { status: 'active' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
    expect(prismaMock.product.count).toHaveBeenCalledWith({ where: { status: 'active' } });
  });

  test('listProducts falls back to default pagination for invalid values', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();

    prismaMock.product.findMany.mockResolvedValueOnce([]);
    prismaMock.product.count.mockResolvedValueOnce(0);

    await expect(catalogueRepository.listProducts({ page: -1, pageSize: 0 })).resolves.toEqual({
      items: [],
      pagination: { page: 1, pageSize: 24, totalItems: 0, totalPages: 1 },
    });

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 24,
    }));
  });

  test('listProducts supports omitted params object', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();

    prismaMock.product.findMany.mockResolvedValueOnce([]);
    prismaMock.product.count.mockResolvedValueOnce(1);

    await catalogueRepository.listProducts();

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 24,
    }));
  });

  test('listProducts selects required image dimensions and position', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();

    prismaMock.product.findMany.mockResolvedValueOnce([]);
    prismaMock.product.count.mockResolvedValueOnce(0);

    await catalogueRepository.listProducts({ page: 1, pageSize: 24 });

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        images: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            url: true,
            alt: true,
            width: true,
            height: true,
            position: true,
          },
        },
      }),
    }));
  });

  test('listProducts failure path normalizes db error', async () => {
    const { catalogueRepository, prismaMock, normalizeDbError } = await loadCatalogueRepository();
    const dbError = new Error('list failed');
    prismaMock.product.findMany.mockRejectedValueOnce(dbError);

    await expect(catalogueRepository.listProducts({ page: 1, pageSize: 24 })).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'catalogue', operation: 'listProducts' });
  });

  test('getProductBySlug returns null when missing', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();
    prismaMock.product.findUnique.mockResolvedValueOnce(null);

    await expect(catalogueRepository.getProductBySlug('missing')).resolves.toBeNull();
    expect(prismaMock.product.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'missing' },
    }));
  });

  test('getProductBySlug selects required image fields', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();
    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'p1' });

    await catalogueRepository.getProductBySlug('p-1');

    expect(prismaMock.product.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        images: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            url: true,
            alt: true,
            width: true,
            height: true,
            position: true,
          },
        },
      }),
    }));
  });


  test('getProductBySlug uses deterministic ordering for images/variants/specs', async () => {
    const { catalogueRepository, prismaMock } = await loadCatalogueRepository();
    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'p1' });

    await catalogueRepository.getProductBySlug('slug-order');

    expect(prismaMock.product.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        images: expect.objectContaining({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
        variants: expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
        specs: expect.objectContaining({ orderBy: [{ position: 'asc' }, { key: 'asc' }] }),
      }),
    }));
  });

  test('getProductBySlug failure path normalizes db error', async () => {
    const { catalogueRepository, prismaMock, normalizeDbError } = await loadCatalogueRepository();
    const dbError = new Error('detail failed');
    prismaMock.product.findUnique.mockRejectedValueOnce(dbError);

    await expect(catalogueRepository.getProductBySlug('slug')).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'catalogue', operation: 'getProductBySlug' });
  });
});