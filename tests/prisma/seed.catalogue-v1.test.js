import { CATALOGUE_V1_PRODUCT, seedCatalogueV1 } from '../../prisma/seed.catalogue-v1.js';

function createPrismaMock({ initialCount = 0 } = {}) {
  const calls = { productUpsert: 0, imageUpsert: 0, variantUpsert: 0, specUpsert: 0 };
  const state = { count: initialCount };

  return {
    calls,
    prisma: {
      product: {
        count: async () => state.count,
        upsert: async ({ where }) => {
          calls.productUpsert += 1;
          state.count = Math.max(1, state.count);
          return { id: 'prod-1', slug: where.slug };
        },
      },
      productImage: {
        upsert: async () => {
          calls.imageUpsert += 1;
          return { id: 'img-1' };
        },
      },
      productVariant: {
        upsert: async () => {
          calls.variantUpsert += 1;
          return { id: 'var-1' };
        },
      },
      productSpec: {
        upsert: async () => {
          calls.specUpsert += 1;
          return { id: 'spec-1' };
        },
      },
    },
  };
}

describe('catalogue V1 seed', () => {
  test('is idempotent without force when catalogue is non-empty', async () => {
    const { prisma, calls } = createPrismaMock({ initialCount: 0 });

    const first = await seedCatalogueV1({ prisma, force: false, log: () => undefined });
    const second = await seedCatalogueV1({ prisma, force: false, log: () => undefined });

    expect(first.seeded).toBe(true);
    expect(second.seeded).toBe(false);
    expect(second.reason).toBe('catalogue_not_empty');
    expect(calls.productUpsert).toBe(1);
    expect(calls.imageUpsert).toBe(1);
    expect(calls.variantUpsert).toBe(1);
    expect(calls.specUpsert).toBe(1);
  });

  test('forced runs remain duplicate-safe through upserts', async () => {
    const { prisma, calls } = createPrismaMock({ initialCount: 3 });

    const first = await seedCatalogueV1({ prisma, force: true, log: () => undefined });
    const second = await seedCatalogueV1({ prisma, force: true, log: () => undefined });

    expect(first.seeded).toBe(true);
    expect(second.seeded).toBe(true);
    expect(calls.productUpsert).toBe(2);
    expect(calls.imageUpsert).toBe(2);
    expect(calls.variantUpsert).toBe(2);
    expect(calls.specUpsert).toBe(2);
  });

  test('seed shape satisfies catalogue V1 required fields', () => {
    expect(CATALOGUE_V1_PRODUCT.slug).toBeTruthy();
    expect(CATALOGUE_V1_PRODUCT.status).toBe('active');
    expect(CATALOGUE_V1_PRODUCT.image).toEqual(expect.objectContaining({
      url: expect.any(String),
      alt: expect.any(String),
      width: expect.any(Number),
      height: expect.any(Number),
      position: 0,
    }));
    expect(CATALOGUE_V1_PRODUCT.variant).toEqual(expect.objectContaining({
      sku: expect.any(String),
      label: expect.any(String),
      attributes: expect.any(Object),
    }));
    expect(CATALOGUE_V1_PRODUCT.spec).toEqual(expect.objectContaining({
      key: expect.any(String),
      value: expect.any(String),
    }));
  });
});