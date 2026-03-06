import { CATALOGUE_V1_PRODUCTS, seedCatalogueV1 } from '../../prisma/seed.catalogue-v1.js';

function createPrismaMock() {
  const calls = { productUpsert: 0, imageUpsert: 0, variantUpsert: 0, specUpsert: 0 };

  return {
    calls,
    prisma: {
      product: {
        upsert: async ({ where }) => {
          calls.productUpsert += 1;
          return { id: `prod-${calls.productUpsert}`, slug: where.slug };
        },
      },
      productImage: {
        upsert: async () => {
          calls.imageUpsert += 1;
          return { id: `img-${calls.imageUpsert}` };
        },
      },
      productVariant: {
        upsert: async () => {
          calls.variantUpsert += 1;
          return { id: `var-${calls.variantUpsert}` };
        },
      },
      productSpec: {
        upsert: async () => {
          calls.specUpsert += 1;
          return { id: `spec-${calls.specUpsert}` };
        },
      },
    },
  };
}

describe('seedCatalogueV1', () => {
  test('requires prisma client with product model', async () => {
    await expect(seedCatalogueV1({ prisma: null })).rejects.toThrow('seedCatalogueV1 requires a prisma client');
  });

  test('upserts full deterministic catalogue set', async () => {
    const { prisma, calls } = createPrismaMock();

    const result = await seedCatalogueV1({ prisma, log: () => undefined });

    expect(result.seeded).toBe(true);
    expect(result.products).toBe(3);
    expect(result.images).toBe(5);
    expect(result.variants).toBe(2);
    expect(result.specs).toBe(5);
    expect(result.slugs).toEqual(CATALOGUE_V1_PRODUCTS.map((product) => product.slug));
    expect(calls.productUpsert).toBe(3);
    expect(calls.imageUpsert).toBe(5);
    expect(calls.variantUpsert).toBe(2);
    expect(calls.specUpsert).toBe(5);
  });

  test('repeat runs remain idempotent through upserts', async () => {
    const { prisma, calls } = createPrismaMock();

    await seedCatalogueV1({ prisma, log: () => undefined });
    await seedCatalogueV1({ prisma, log: () => undefined });

    expect(calls.productUpsert).toBe(6);
    expect(calls.imageUpsert).toBe(10);
    expect(calls.variantUpsert).toBe(4);
    expect(calls.specUpsert).toBe(10);
  });

  test('seed shape satisfies catalogue V1 required fields', () => {
    expect(CATALOGUE_V1_PRODUCTS).toHaveLength(3);

    for (const product of CATALOGUE_V1_PRODUCTS) {
      expect(product.slug).toEqual(expect.any(String));
      expect(product.images.length).toBeGreaterThanOrEqual(1);
      for (const image of product.images) {
        expect(image).toEqual(expect.objectContaining({
          url: expect.any(String),
          alt: expect.any(String),
          width: expect.any(Number),
          height: expect.any(Number),
          position: expect.any(Number),
        }));
      }
    }

    expect(CATALOGUE_V1_PRODUCTS.find((product) => product.variants.length === 0 && product.stockStatus === 'in_stock')).toBeTruthy();
    expect(CATALOGUE_V1_PRODUCTS.find((product) => product.variants.length >= 2)).toBeTruthy();
    expect(CATALOGUE_V1_PRODUCTS.find((product) => product.stockStatus === 'out_of_stock')).toBeTruthy();
    expect(CATALOGUE_V1_PRODUCTS.flatMap((product) => product.variants).some((variant) => variant.stockStatus === 'out_of_stock')).toBe(true);
  });
});