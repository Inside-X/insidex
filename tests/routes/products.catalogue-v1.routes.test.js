import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { catalogueRepository } from '../../src/repositories/catalogue.repository.js';

describe('catalogue products v1 routes', () => {
  beforeEach(() => {
    process.env.API_RATE_MAX = '1000';
    jest.restoreAllMocks();
  });

  test('GET /api/products returns default pagination envelope with v1 item shape', async () => {
    jest.spyOn(catalogueRepository, 'listProducts').mockResolvedValueOnce({
      items: [
        {
          id: '00000000-0000-0000-0000-000000000111',
          slug: 'alpha-product',
          name: 'Alpha',
          price: '12.50',
          currency: 'EUR',
          stockStatus: 'in_stock',
          stockQuantity: 5,
          backorderable: false,
          images: [{ url: 'https://cdn/a.jpg', alt: 'A', width: 640, height: 480, position: 1 }],
        },
      ],
      pagination: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
    });

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        items: [
          {
            id: '00000000-0000-0000-0000-000000000111',
            slug: 'alpha-product',
            name: 'Alpha',
            primaryImage: { url: 'https://cdn/a.jpg', alt: 'A', width: 640, height: 480, position: 1 },
            pricePreview: { amount: 12.5, currency: 'EUR', isFromPrice: false },
            stock: { status: 'in_stock', quantity: 5, backorderable: false },
          },
        ],
        pagination: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
      },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
    expect(res.body.data.items[0].description).toBeUndefined();
    expect(res.body.data.items[0].specs).toBeUndefined();
    expect(res.body.data.items[0].variants).toBeUndefined();
    expect(catalogueRepository.listProducts).toHaveBeenCalledWith({ page: 1, pageSize: 24 });
  });

  test('GET /api/products respects page/pageSize', async () => {
    jest.spyOn(catalogueRepository, 'listProducts').mockResolvedValueOnce({
      items: [],
      pagination: { page: 2, pageSize: 10, totalItems: 0, totalPages: 1 },
    });

    const res = await request(app).get('/api/products?page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(catalogueRepository.listProducts).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    expect(res.body.data.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 0, totalPages: 1 });
  });

  test.each([
    ['/api/products?page=0', 'Query param "page" must be an integer greater than or equal to 1.'],
    ['/api/products?page=abc', 'Query param "page" must be an integer greater than or equal to 1.'],
    ['/api/products?pageSize=0', 'Query param "pageSize" must be an integer between 1 and 50.'],
    ['/api/products?pageSize=999', 'Query param "pageSize" must be an integer between 1 and 50.'],
  ])('GET %s rejects invalid query with canonical invalid_request envelope', async (path, message) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'invalid_request', message },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
    expect(Object.keys(res.body)).toEqual(['error', 'meta']);
  });

  test('GET /api/products returns 400 for non-numeric pageSize', async () => {
    const res = await request(app).get('/api/products?pageSize=abc');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'invalid_request', message: 'Query param "pageSize" must be an integer between 1 and 50.' },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
  });

  test('GET /api/products returns deterministic internal_error envelope on repository failure', async () => {
    jest.spyOn(catalogueRepository, 'listProducts').mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error.' },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
  });

  test('GET /api/products/:slug returns detail v1 shape with required image keys', async () => {
    jest.spyOn(catalogueRepository, 'getProductBySlug').mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000222',
      slug: 'beta-product',
      name: 'Beta',
      description: null,
      price: '30.00',
      currency: 'EUR',
      stockStatus: 'low_stock',
      stockQuantity: 2,
      backorderable: false,
      images: [{ url: 'https://cdn/b.jpg', alt: 'B', width: 800, height: 600, position: 1 }],
      variants: [{
        id: '00000000-0000-0000-0000-000000000333',
        sku: 'SKU-B',
        label: 'Size M',
        attributes: { size: 'M' },
        priceDelta: '1.50',
        absolutePrice: null,
        stockStatus: 'in_stock',
        stockQuantity: 3,
        backorderable: false,
      }],
      specs: [{ key: 'material', value: 'cotton', position: 1 }],
    });

    const res = await request(app).get('/api/products/beta-product');

    expect(res.status).toBe(200);
    expect(res.body.data.images[0]).toEqual({
      url: 'https://cdn/b.jpg',
      alt: 'B',
      width: 800,
      height: 600,
      position: 1,
    });
    expect(res.body.data.basePrice).toEqual({ amount: 30, currency: 'EUR' });
    expect(res.body.data.pricePreview).toEqual({ amount: 30, currency: 'EUR', isFromPrice: true });
    expect(res.body.data.stock).toEqual({ status: 'low_stock', quantity: 2, backorderable: false });
    expect(res.body.data.variants[0].stock).toEqual({ status: 'in_stock', quantity: 3, backorderable: false });
    expect(res.body.data.specs).toEqual([{ key: 'material', value: 'cotton' }]);
  });

  test('GET /api/products/:slug returns 404 not_found when missing', async () => {
    jest.spyOn(catalogueRepository, 'getProductBySlug').mockResolvedValueOnce(null);

    const res = await request(app).get('/api/products/missing-product');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'not_found', message: 'Product not found.' },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
  });

  test('GET /api/products/:slug returns deterministic internal_error envelope on repository failure', async () => {
    jest.spyOn(catalogueRepository, 'getProductBySlug').mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).get('/api/products/valid-slug');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error.' },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
  });

  test('GET /api/products/:slug rejects invalid slug with stable error envelope keys', async () => {
    const res = await request(app).get('/api/products/INVALID_SLUG');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'invalid_request', message: 'Path param "slug" is invalid.' },
      meta: expect.objectContaining({ requestId: expect.any(String), correlationId: expect.any(String) }),
    });
    expect(Object.keys(res.body)).toEqual(['error', 'meta']);
  });
});