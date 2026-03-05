import { jest } from '@jest/globals';
import { loadRoute, runHandlers } from './_router-helper.js';

const pass = (_req, _res, next) => next?.();

async function loadProductsRoute(overrides = {}) {
  const authorizeRole = jest.fn(() => pass);
  const catalogueRepository = {
    listProducts: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 24, totalItems: 0, totalPages: 1 } }),
    getProductBySlug: jest.fn().mockResolvedValue(null),
    ...overrides,
  };

  const routes = await loadRoute('../../src/routes/products.routes.js', {
    '../../src/validation/schemas/index.js': () => ({
      authSchemas: { register: {}, login: {}, forgot: {}, reset: {}, refresh: {}, logout: {} },
      ordersSchemas: { create: {}, paymentWebhook: {}, byIdParams: {} },
      paymentsSchemas: { createIntent: {} },
      cartSchemas: { getCartQuery: {}, add: {}, updateItemParams: {}, updateItemBody: {}, removeItemParams: {}, removeItemBody: {} },
      productsSchemas: { create: {} },
      leadsSchemas: { create: {}, listQuery: {} },
      analyticsSchemas: { track: {}, listQuery: {} },
    }),
    '../../src/validation/strict-validate.middleware.js': () => ({ strictValidate: jest.fn(() => pass) }),
    '../../src/middlewares/authenticate.js': () => ({ default: pass }),
    '../../src/middlewares/authorizeRole.js': () => ({ default: authorizeRole }),
    '../../src/repositories/catalogue.repository.js': () => ({ catalogueRepository }),
  });

  return { routes, authorizeRole, catalogueRepository };
}

describe('products.routes', () => {
  test('defines catalogue list/detail handlers and admin create handler', async () => {
    const { routes, authorizeRole } = await loadProductsRoute();

    const list = routes.find((route) => route.method === 'get' && route.path === '/');
    const detail = routes.find((route) => route.method === 'get' && route.path === '/:slug');
    const post = routes.find((route) => route.method === 'post' && route.path === '/');

    expect(list).toBeDefined();
    expect(detail).toBeDefined();
    expect(post).toBeDefined();

    let res = { status: jest.fn(() => res), json: jest.fn() };
    await runHandlers(list.handlers, { query: {}, requestId: 'r1', correlationId: 'r1' }, res);
    expect(res.status).toHaveBeenCalledWith(200);

    res = { status: jest.fn(() => res), json: jest.fn() };
    await runHandlers(detail.handlers, { params: { slug: 'missing-product' }, requestId: 'r1', correlationId: 'r1' }, res);
    expect(res.status).toHaveBeenCalledWith(404);

    res = { status: jest.fn(() => res), json: jest.fn() };
    await runHandlers(post.handlers, { body: { name: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(authorizeRole).toHaveBeenCalledWith('admin');
  });

  test('list omits meta and primaryImage when no request ids and no images', async () => {
    const { routes, catalogueRepository } = await loadProductsRoute({
      listProducts: jest.fn().mockResolvedValue({
        items: [{ id: 'p1', slug: 's1', name: 'n1', price: 'x', currency: 'EUR', stock: 0, images: [] }],
        pagination: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
      }),
    });

    const list = routes.find((route) => route.method === 'get' && route.path === '/');
    const res = { status: jest.fn(() => res), json: jest.fn() };
    await runHandlers(list.handlers, { query: {} }, res);

    expect(catalogueRepository.listProducts).toHaveBeenCalledWith({ page: 1, pageSize: 24 });
    expect(res.json).toHaveBeenCalledWith({
      data: {
        items: [{
          id: 'p1',
          slug: 's1',
          name: 'n1',
          primaryImage: null,
          pricePreview: { amount: 0, currency: 'EUR', isFromPrice: false },
          stock: { status: 'unknown', quantity: 0, backorderable: false },
        }],
        pagination: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
      },
    });
  });

  test('list returns internal_error envelope without meta when repository throws', async () => {
    const { routes } = await loadProductsRoute({ listProducts: jest.fn().mockRejectedValue(new Error('boom')) });
    const list = routes.find((route) => route.method === 'get' && route.path === '/');

    const res = { status: jest.fn(() => res), json: jest.fn() };
    await runHandlers(list.handlers, { query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'internal_error', message: 'Internal server error.' } });
  });

  test('detail supports no variant pricing, empty specs, attributes fallback, and null variant prices', async () => {
    const { routes } = await loadProductsRoute({
      getProductBySlug: jest.fn().mockResolvedValue({
        id: 'p1',
        slug: 'slug-1',
        name: 'n1',
        description: 'desc',
        price: '10.00',
        currency: 'EUR',
        stockStatus: 'in_stock',
        stockQuantity: null,
        backorderable: true,
        images: [],
        variants: [{ id: 'v1', sku: 's', label: 'l', attributes: null, priceDelta: null, absolutePrice: '9.99', stockStatus: null, stockQuantity: null, backorderable: false }],
        specs: [],
      }),
    });

    const detail = routes.find((route) => route.method === 'get' && route.path === '/:slug');
    const res = { status: jest.fn(() => res), json: jest.fn() };
    await runHandlers(detail.handlers, { params: { slug: 'slug-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.pricePreview.isFromPrice).toBe(true);
    expect(res.json.mock.calls[0][0].data.specs).toBeNull();
    expect(res.json.mock.calls[0][0].data.variants[0].attributes).toEqual({});
    expect(res.json.mock.calls[0][0].data.variants[0].priceDelta).toBeNull();
    expect(res.json.mock.calls[0][0].data.variants[0].absolutePrice).toBe(9.99);
  });

  test('detail invalid slug branches and internal_error path without meta', async () => {
    const { routes } = await loadProductsRoute({ getProductBySlug: jest.fn().mockRejectedValue(new Error('boom')) });
    const detail = routes.find((route) => route.method === 'get' && route.path === '/:slug');

    const invalidType = { status: jest.fn(() => invalidType), json: jest.fn() };
    await runHandlers(detail.handlers, { params: { slug: 12 } }, invalidType);
    expect(invalidType.status).toHaveBeenCalledWith(400);

    const tooLong = { status: jest.fn(() => tooLong), json: jest.fn() };
    await runHandlers(detail.handlers, { params: { slug: 'a'.repeat(121) } }, tooLong);
    expect(tooLong.status).toHaveBeenCalledWith(400);

    const err = { status: jest.fn(() => err), json: jest.fn() };
    await runHandlers(detail.handlers, { params: { slug: 'valid-slug' } }, err);
    expect(err.status).toHaveBeenCalledWith(500);
    expect(err.json).toHaveBeenCalledWith({ error: { code: 'internal_error', message: 'Internal server error.' } });
  });
});