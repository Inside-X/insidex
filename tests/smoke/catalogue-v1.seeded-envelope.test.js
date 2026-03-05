import request from 'supertest';
import app from '../../src/app.js';
import { catalogueRepository } from '../../src/repositories/catalogue.repository.js';
import { CATALOGUE_V1_PRODUCT } from '../../prisma/seed.catalogue-v1.js';
import { resetRateLimiters, setRateLimitRedisClient } from '../../src/middlewares/rateLimit.js';

function fakeRedis() {
  return {
    ping: async () => 'PONG',
    eval: async () => [1, 60_000],
    flushAll: () => undefined,
  };
}

describe('catalogue V1 seeded envelope smoke', () => {
  const originalList = catalogueRepository.listProducts;

  beforeEach(() => {
    setRateLimitRedisClient(fakeRedis());
    resetRateLimiters();
  });

  afterEach(() => {
    catalogueRepository.listProducts = originalList;
    resetRateLimiters();
  });

  test('GET /api/products returns valid envelope with seeded product fixture', async () => {
    catalogueRepository.listProducts = async () => ({
      items: [{
        id: 'seed-prod-id',
        slug: CATALOGUE_V1_PRODUCT.slug,
        name: CATALOGUE_V1_PRODUCT.name,
        price: CATALOGUE_V1_PRODUCT.price,
        currency: CATALOGUE_V1_PRODUCT.currency,
        stockStatus: CATALOGUE_V1_PRODUCT.stockStatus,
        stockQuantity: CATALOGUE_V1_PRODUCT.stockQuantity,
        backorderable: CATALOGUE_V1_PRODUCT.backorderable,
        images: [CATALOGUE_V1_PRODUCT.image],
      }],
      pagination: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
    });

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.data?.items)).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toEqual(expect.objectContaining({
      slug: CATALOGUE_V1_PRODUCT.slug,
      name: CATALOGUE_V1_PRODUCT.name,
      primaryImage: expect.objectContaining({
        url: CATALOGUE_V1_PRODUCT.image.url,
        width: CATALOGUE_V1_PRODUCT.image.width,
        height: CATALOGUE_V1_PRODUCT.image.height,
        position: CATALOGUE_V1_PRODUCT.image.position,
      }),
    }));
  });
});