import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';
import { productRepository } from '../../src/repositories/product.repository.js';
import { mediaUploadRepository } from '../../src/repositories/media-upload.repository.js';

const adminToken = buildTestToken({ role: 'admin', id: 'admin-products-1' });
const customerToken = buildTestToken({ role: 'customer', id: 'admin-products-user-1' });
const opsToken = buildTestToken({ role: 'ops', id: 'admin-products-ops-1' });
const validId = '00000000-0000-0000-0000-000000000123';
const validMedia = [
  {
    id: 'media_001',
    url: 'https://cdn.example.com/products/amani-chair/main.jpg',
    alt: 'Amani Chair front view',
    sortOrder: 0,
    isPrimary: true,
    kind: 'image',
  },
];

describe('admin products routes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('list success via repository', async () => {
    jest.spyOn(productRepository, 'listAdminProducts').mockResolvedValueOnce([
      {
        id: 'prod_001',
        name: 'Amani Chair',
        slug: 'amani-chair',
        shortDescription: 'Oak chair with woven seat.',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
        status: 'published',
        images: [
          {
            id: 'media_002',
            url: 'https://cdn.example.com/products/amani-chair/side.jpg',
            alt: 'Amani Chair side view',
            position: 1,
            isPrimary: false,
            kind: 'image',
          },
          {
            id: 'media_001',
            url: 'https://cdn.example.com/products/amani-chair/main.jpg',
            alt: 'Amani Chair front view',
            position: 0,
            isPrimary: true,
            kind: 'image',
          },
        ],
      },
    ]);

    const response = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(productRepository.listAdminProducts).toHaveBeenCalledWith();
    expect(response.body).toEqual({
      data: [
        {
          id: 'prod_001',
          name: 'Amani Chair',
          slug: 'amani-chair',
          shortDescription: 'Oak chair with woven seat.',
          description: 'Full product description.',
          price: '129.90',
          currency: 'EUR',
          stock: 8,
          status: 'published',
          media: [
            validMedia[0],
            {
              id: 'media_002',
              url: 'https://cdn.example.com/products/amani-chair/side.jpg',
              alt: 'Amani Chair side view',
              sortOrder: 1,
              isPrimary: false,
              kind: 'image',
            },
          ],
        },
      ],
    });
  });

  test('detail success via repository', async () => {
    jest.spyOn(productRepository, 'findAdminProductById').mockResolvedValueOnce({
      id: validId,
      name: 'Amani Chair',
      slug: 'amani-chair',
      shortDescription: 'Oak chair with woven seat.',
      description: 'Full product description.',
      price: '129.90',
      currency: 'EUR',
      stock: 8,
      status: 'draft',
      images: [
        {
          id: 'media_001',
          url: 'https://cdn.example.com/products/amani-chair/main.jpg',
          alt: 'Amani Chair front view',
          position: 0,
          isPrimary: true,
          kind: 'image',
        },
      ],
    });

    const response = await request(app)
      .get(`/api/admin/products/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(productRepository.findAdminProductById).toHaveBeenCalledWith(validId);
    expect(response.body).toEqual({
      data: {
        id: validId,
        name: 'Amani Chair',
        slug: 'amani-chair',
        shortDescription: 'Oak chair with woven seat.',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
        status: 'draft',
        media: validMedia,
      },
    });
  });

  test('detail invalid UUID param rejection', async () => {
    const response = await request(app)
      .get('/api/admin/products/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'id', message: 'id must be a valid UUID' }),
      ]),
    );
  });

  test('detail repository not-found failure propagates through error stack', async () => {
    const notFound = new Error('Database record not found');
    notFound.statusCode = 404;
    notFound.code = 'DB_RECORD_NOT_FOUND';
    jest.spyOn(productRepository, 'findAdminProductById').mockRejectedValueOnce(notFound);

    const response = await request(app)
      .get(`/api/admin/products/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(response.body.error.code).toBe('DB_RECORD_NOT_FOUND');
  });

  test('create success via repository', async () => {
    const payload = {
      name: 'Amani Chair',
      slug: 'amani-chair',
      shortDescription: 'Oak chair with woven seat.',
      description: 'Full product description.',
      price: '129.90',
      currency: 'EUR',
      stock: 8,
      media: validMedia,
    };

    jest.spyOn(productRepository, 'createAdminProduct').mockResolvedValueOnce({
      id: 'prod_123',
      name: 'Amani Chair',
      slug: 'amani-chair',
      shortDescription: 'Oak chair with woven seat.',
      description: 'Full product description.',
      price: '129.90',
      currency: 'EUR',
      stock: 8,
      status: 'draft',
      images: [
        {
          id: 'media_001',
          url: 'https://cdn.example.com/products/amani-chair/main.jpg',
          alt: 'Amani Chair front view',
          position: 0,
          isPrimary: true,
          kind: 'image',
        },
      ],
    });

    const response = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(productRepository.createAdminProduct).toHaveBeenCalledWith(payload);
    expect(response.body).toEqual({
      data: {
        id: 'prod_123',
        name: 'Amani Chair',
        slug: 'amani-chair',
        shortDescription: 'Oak chair with woven seat.',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
        status: 'draft',
        media: validMedia,
      },
    });
  });

  test('create validation failure', async () => {
    const response = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Amani Chair',
        slug: 'Amani Chair',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'slug', message: 'slug must be a normalized lowercase slug' }),
      ]),
    );
  });

  test('update success via repository', async () => {
    const payload = {
      name: 'Amani Lounge Chair',
      slug: 'amani-lounge-chair',
      shortDescription: 'Updated short summary.',
      description: 'Updated full description.',
      price: '149.90',
      currency: 'EUR',
      stock: 5,
      status: 'published',
    };

    jest.spyOn(productRepository, 'updateAdminProductById').mockResolvedValueOnce({
      id: validId,
      name: 'Amani Lounge Chair',
      slug: 'amani-lounge-chair',
      shortDescription: 'Updated short summary.',
      description: 'Updated full description.',
      price: '149.90',
      currency: 'EUR',
      stock: 5,
      status: 'published',
      images: [
        {
          id: 'media_010',
          url: 'https://cdn.example.com/products/amani-chair/detail.jpg',
          alt: 'Amani Chair detail view',
          position: 3,
          isPrimary: false,
          kind: 'image',
        },
      ],
    });

    const response = await request(app)
      .patch(`/api/admin/products/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(productRepository.updateAdminProductById).toHaveBeenCalledWith(validId, payload);
    expect(response.body).toEqual({
      data: {
        id: validId,
        name: 'Amani Lounge Chair',
        slug: 'amani-lounge-chair',
        shortDescription: 'Updated short summary.',
        description: 'Updated full description.',
        price: '149.90',
        currency: 'EUR',
        stock: 5,
        status: 'published',
        media: [
          {
            id: 'media_010',
            url: 'https://cdn.example.com/products/amani-chair/detail.jpg',
            alt: 'Amani Chair detail view',
            sortOrder: 3,
            isPrimary: false,
            kind: 'image',
          },
        ],
      },
    });
  });

  test('update invalid UUID param rejection', async () => {
    const response = await request(app)
      .patch('/api/admin/products/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'id', message: 'id must be a valid UUID' }),
      ]),
    );
  });

  test('publish success via repository', async () => {
    jest.spyOn(productRepository, 'publishProductById').mockResolvedValueOnce({ id: validId, status: 'published' });

    const response = await request(app)
      .patch(`/api/admin/products/${validId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(productRepository.publishProductById).toHaveBeenCalledWith(validId);
    expect(response.body).toEqual({
      data: {
        id: validId,
        status: 'published',
      },
    });
  });

  test('publish rejects unknown body fields', async () => {
    const response = await request(app)
      .patch(`/api/admin/products/${validId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ noop: true })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('unpublish success via repository', async () => {
    jest.spyOn(productRepository, 'unpublishProductById').mockResolvedValueOnce({ id: validId, status: 'draft' });

    const response = await request(app)
      .patch(`/api/admin/products/${validId}/unpublish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(productRepository.unpublishProductById).toHaveBeenCalledWith(validId);
    expect(response.body).toEqual({
      data: {
        id: validId,
        status: 'draft',
      },
    });
  });

  test('replaceMedia success via repository', async () => {
    const payload = {
      media: [
        {
          id: 'media_002',
          url: 'https://cdn.example.com/products/amani-chair/side.jpg',
          alt: 'Amani Chair side view',
          sortOrder: 1,
          isPrimary: false,
          kind: 'image',
        },
        ...validMedia,
      ],
    };

    jest.spyOn(mediaUploadRepository, 'findFinalizedAssetsByUrls').mockResolvedValueOnce([
      { url: 'https://cdn.example.com/products/amani-chair/main.jpg' },
      { url: 'https://cdn.example.com/products/amani-chair/side.jpg' },
    ]);
    jest.spyOn(productRepository, 'replaceProductMediaById').mockResolvedValueOnce({
      id: validId,
      images: [
        {
          id: 'media_001',
          url: 'https://cdn.example.com/products/amani-chair/main.jpg',
          alt: 'Amani Chair front view',
          position: 0,
          isPrimary: true,
          kind: 'image',
        },
        {
          id: 'media_002',
          url: 'https://cdn.example.com/products/amani-chair/side.jpg',
          alt: 'Amani Chair side view',
          position: 1,
          isPrimary: false,
          kind: 'image',
        },
      ],
    });

    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(mediaUploadRepository.findFinalizedAssetsByUrls).toHaveBeenCalledWith([
      'https://cdn.example.com/products/amani-chair/side.jpg',
      'https://cdn.example.com/products/amani-chair/main.jpg',
    ]);
    expect(productRepository.replaceProductMediaById).toHaveBeenCalledWith(validId, payload.media);
    expect(response.body).toEqual({
      data: {
        id: validId,
        media: [
          validMedia[0],
          {
            id: 'media_002',
            url: 'https://cdn.example.com/products/amani-chair/side.jpg',
            alt: 'Amani Chair side view',
            sortOrder: 1,
            isPrimary: false,
            kind: 'image',
          },
        ],
      },
    });
  });

  test('replaceMedia rejects unknown or non-finalized media URLs', async () => {
    jest.spyOn(mediaUploadRepository, 'findFinalizedAssetsByUrls').mockResolvedValueOnce([
      { url: 'https://cdn.example.com/products/amani-chair/main.jpg' },
    ]);
    const replaceSpy = jest.spyOn(productRepository, 'replaceProductMediaById');

    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        media: [
          validMedia[0],
          {
            id: 'media_002',
            url: 'https://cdn.example.com/products/amani-chair/unknown.jpg',
            alt: 'Unknown image',
            sortOrder: 1,
            isPrimary: false,
            kind: 'image',
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'media.1.url',
          message: 'media url must reference a finalized uploaded asset',
        }),
      ]),
    );
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  test('replaceMedia rejects duplicate finalized media URLs within one payload', async () => {
    jest.spyOn(mediaUploadRepository, 'findFinalizedAssetsByUrls').mockResolvedValueOnce([
      { url: 'https://cdn.example.com/products/amani-chair/main.jpg' },
    ]);
    const replaceSpy = jest.spyOn(productRepository, 'replaceProductMediaById');

    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        media: [
          validMedia[0],
          {
            id: 'media_002',
            url: 'https://cdn.example.com/products/amani-chair/main.jpg',
            alt: 'Amani Chair alternate front view',
            sortOrder: 1,
            isPrimary: false,
            kind: 'image',
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'media.1.url',
          message: 'duplicate media url is not allowed within a single media payload',
        }),
      ]),
    );
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  test('repository not-found failure propagates through error stack', async () => {
    const notFound = new Error('Database record not found');
    notFound.statusCode = 404;
    notFound.code = 'DB_RECORD_NOT_FOUND';
    jest.spyOn(productRepository, 'updateAdminProductById').mockRejectedValueOnce(notFound);

    const response = await request(app)
      .patch(`/api/admin/products/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' })
      .expect(404);

    expect(response.body.error.code).toBe('DB_RECORD_NOT_FOUND');
  });

  test('repository conflict failure propagates through error stack', async () => {
    const conflict = new Error('Database unique constraint violation');
    conflict.statusCode = 409;
    conflict.code = 'DB_UNIQUE_CONSTRAINT';
    jest.spyOn(productRepository, 'createAdminProduct').mockRejectedValueOnce(conflict);

    const response = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Amani Chair',
        slug: 'amani-chair',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
      })
      .expect(409);

    expect(response.body.error.code).toBe('DB_UNIQUE_CONSTRAINT');
  });

  test('replaceMedia rejects duplicate sortOrder', async () => {
    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        media: [
          { ...validMedia[0], sortOrder: 0 },
          { ...validMedia[0], id: 'media_002', sortOrder: 0, isPrimary: false },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('replaceMedia rejects duplicate id', async () => {
    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        media: [
          { ...validMedia[0], id: 'media_001', sortOrder: 0 },
          { ...validMedia[0], id: 'media_001', sortOrder: 1, isPrimary: false },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('replaceMedia rejects multiple primary items', async () => {
    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        media: [
          { ...validMedia[0], id: 'media_001', sortOrder: 0, isPrimary: true },
          { ...validMedia[0], id: 'media_002', sortOrder: 1, isPrimary: true },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('stock adjustment enforces admin-only boundary', async () => {
    const adjustSpy = jest.spyOn(productRepository, 'applyAdminStockAdjustment');

    await request(app)
      .post('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        requestKey: '11111111-1111-4111-8111-111111111111',
        target: { productId: validId },
        intentClass: 'RECOUNT_CORRECTION',
        quantityDelta: -1,
        expectedStock: 8,
      })
      .expect(403);

    expect(adjustSpy).not.toHaveBeenCalled();
  });

  test('stock adjustment observability seam enforces admin-only boundary', async () => {
    const listSpy = jest.spyOn(productRepository, 'listAdminStockAdjustmentAttempts');

    await request(app)
      .get('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    await request(app)
      .get('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(403);

    expect(listSpy).not.toHaveBeenCalled();
  });

  test('stock adjustment observability seam rejects invalid filters deterministically', async () => {
    const listSpy = jest.spyOn(productRepository, 'listAdminStockAdjustmentAttempts');

    const response = await request(app)
      .get('/api/admin/products/stock-adjustments?unsupported=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(listSpy).not.toHaveBeenCalled();
  });

  test('stock adjustment observability seam returns authoritative attempts without mutation side effects', async () => {
    const applySpy = jest.spyOn(productRepository, 'applyAdminStockAdjustment');
    jest.spyOn(productRepository, 'listAdminStockAdjustmentAttempts').mockResolvedValueOnce([
      {
        id: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
        actorUserId: 'admin-products-1',
        requestKey: '44444444-4444-4444-8444-444444444444',
        targetProductId: validId,
        targetResolverSku: 'SKU-123',
        intentClass: 'RECOUNT_CORRECTION',
        requestedQuantityDelta: -2,
        requestedExpectedStock: 8,
        beforeQuantity: 8,
        afterQuantity: 6,
        attemptClass: 'NEW_INTENDED_ADJUSTMENT',
        outcomeClass: 'APPLIED',
        rejectionClass: null,
        replayOfAuditId: null,
        evidenceRef: 'cycle-count-2026-04-16',
        note: 'Verified signed worksheet.',
        createdAt: '2026-04-17T10:00:00.000Z',
      },
      {
        id: '6d95c9de-8e84-41be-a7b6-b8ad23793ad5',
        actorUserId: 'admin-products-1',
        requestKey: '44444444-4444-4444-8444-444444444444',
        targetProductId: validId,
        targetResolverSku: 'SKU-123',
        intentClass: 'RECOUNT_CORRECTION',
        requestedQuantityDelta: -2,
        requestedExpectedStock: 8,
        beforeQuantity: 8,
        afterQuantity: 6,
        attemptClass: 'REPLAYED_PRIOR_OUTCOME',
        outcomeClass: 'APPLIED',
        rejectionClass: null,
        replayOfAuditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
        evidenceRef: 'cycle-count-2026-04-16',
        note: null,
        createdAt: '2026-04-17T10:00:03.000Z',
      },
      {
        id: '9d89d981-b0d7-4bc3-a997-6b3d7088e6c3',
        actorUserId: 'admin-products-1',
        requestKey: '44444444-4444-4444-8444-444444444444',
        targetProductId: validId,
        targetResolverSku: 'SKU-123',
        intentClass: 'RECOUNT_CORRECTION',
        requestedQuantityDelta: -3,
        requestedExpectedStock: 8,
        beforeQuantity: null,
        afterQuantity: null,
        attemptClass: 'DUPLICATE_REQUEST',
        outcomeClass: 'REJECTED',
        rejectionClass: 'INVALID_PRECONDITION',
        replayOfAuditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
        evidenceRef: null,
        note: null,
        createdAt: '2026-04-17T10:00:05.000Z',
      },
    ]);

    const response = await request(app)
      .get(`/api/admin/products/stock-adjustments?limit=25&targetProductId=${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(productRepository.listAdminStockAdjustmentAttempts).toHaveBeenCalledWith({
      limit: 25,
      actorUserId: undefined,
      targetProductId: validId,
      requestKey: undefined,
      attemptClass: undefined,
    });
    expect(applySpy).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      data: [
        {
          auditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
          actorUserId: 'admin-products-1',
          requestKey: '44444444-4444-4444-8444-444444444444',
          targetProductId: validId,
          targetResolverSku: 'SKU-123',
          intentClass: 'RECOUNT_CORRECTION',
          requestedQuantityDelta: -2,
          requestedExpectedStock: 8,
          beforeQuantity: 8,
          afterQuantity: 6,
          attemptClass: 'NEW_INTENDED_ADJUSTMENT',
          outcomeClass: 'APPLIED',
          rejectionClass: null,
          replayOfAuditId: null,
          evidenceRef: 'cycle-count-2026-04-16',
          note: 'Verified signed worksheet.',
          createdAt: '2026-04-17T10:00:00.000Z',
        },
        {
          auditId: '6d95c9de-8e84-41be-a7b6-b8ad23793ad5',
          actorUserId: 'admin-products-1',
          requestKey: '44444444-4444-4444-8444-444444444444',
          targetProductId: validId,
          targetResolverSku: 'SKU-123',
          intentClass: 'RECOUNT_CORRECTION',
          requestedQuantityDelta: -2,
          requestedExpectedStock: 8,
          beforeQuantity: 8,
          afterQuantity: 6,
          attemptClass: 'REPLAYED_PRIOR_OUTCOME',
          outcomeClass: 'APPLIED',
          rejectionClass: null,
          replayOfAuditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
          evidenceRef: 'cycle-count-2026-04-16',
          note: null,
          createdAt: '2026-04-17T10:00:03.000Z',
        },
        {
          auditId: '9d89d981-b0d7-4bc3-a997-6b3d7088e6c3',
          actorUserId: 'admin-products-1',
          requestKey: '44444444-4444-4444-8444-444444444444',
          targetProductId: validId,
          targetResolverSku: 'SKU-123',
          intentClass: 'RECOUNT_CORRECTION',
          requestedQuantityDelta: -3,
          requestedExpectedStock: 8,
          beforeQuantity: null,
          afterQuantity: null,
          attemptClass: 'DUPLICATE_REQUEST',
          outcomeClass: 'REJECTED',
          rejectionClass: 'INVALID_PRECONDITION',
          replayOfAuditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
          evidenceRef: null,
          note: null,
          createdAt: '2026-04-17T10:00:05.000Z',
        },
      ],
    });
  });

  test('stock adjustment observability seam forwards deterministic filter set', async () => {
    jest.spyOn(productRepository, 'listAdminStockAdjustmentAttempts').mockResolvedValueOnce([]);

    const response = await request(app)
      .get(`/api/admin/products/stock-adjustments?limit=1&actorUserId=00000000-0000-0000-0000-000000000111&requestKey=11111111-1111-4111-8111-111111111111&attemptClass=DUPLICATE_REQUEST`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(productRepository.listAdminStockAdjustmentAttempts).toHaveBeenCalledWith({
      limit: 1,
      actorUserId: '00000000-0000-0000-0000-000000000111',
      targetProductId: undefined,
      requestKey: '11111111-1111-4111-8111-111111111111',
      attemptClass: 'DUPLICATE_REQUEST',
    });
    expect(response.body).toEqual({ data: [] });
  });

  test('stock adjustment rejects ambiguous target identity', async () => {
    const adjustSpy = jest.spyOn(productRepository, 'applyAdminStockAdjustment');
    const response = await request(app)
      .post('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        requestKey: '22222222-2222-4222-8222-222222222222',
        target: { productId: validId, sku: 'SKU-123' },
        intentClass: 'RECOUNT_CORRECTION',
        quantityDelta: -1,
        expectedStock: 8,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(adjustSpy).not.toHaveBeenCalled();
  });

  test('stock adjustment rejects unsupported intent class', async () => {
    const adjustSpy = jest.spyOn(productRepository, 'applyAdminStockAdjustment');
    const response = await request(app)
      .post('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        requestKey: '33333333-3333-4333-8333-333333333333',
        target: { productId: validId },
        intentClass: 'FIX_STOCK',
        quantityDelta: -1,
        expectedStock: 8,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(adjustSpy).not.toHaveBeenCalled();
  });

  test('stock adjustment applies deterministically and returns audit truth', async () => {
    jest.spyOn(productRepository, 'applyAdminStockAdjustment').mockResolvedValueOnce({
      applied: true,
      attemptClass: 'NEW_INTENDED_ADJUSTMENT',
      outcomeClass: 'APPLIED',
      rejectionClass: null,
      targetProductId: validId,
      beforeQuantity: 8,
      afterQuantity: 6,
      auditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
    });

    const response = await request(app)
      .post('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        requestKey: '44444444-4444-4444-8444-444444444444',
        target: { sku: 'SKU-123' },
        intentClass: 'RECOUNT_CORRECTION',
        quantityDelta: -2,
        expectedStock: 8,
        evidenceRef: 'cycle-count-2026-04-16',
      })
      .expect(200);

    expect(productRepository.applyAdminStockAdjustment).toHaveBeenCalledWith({
      actorUserId: 'admin-products-1',
      requestKey: '44444444-4444-4444-8444-444444444444',
      intentClass: 'RECOUNT_CORRECTION',
      target: { sku: 'SKU-123' },
      quantityDelta: -2,
      expectedStock: 8,
      evidenceRef: 'cycle-count-2026-04-16',
      note: undefined,
    });
    expect(response.body).toEqual({
      data: {
        auditId: 'a0d5fcba-65c0-48db-a52c-bc9786477d61',
        attemptClass: 'NEW_INTENDED_ADJUSTMENT',
        outcomeClass: 'APPLIED',
        rejectionClass: null,
        replayOfAuditId: null,
        targetProductId: validId,
        beforeQuantity: 8,
        afterQuantity: 6,
      },
    });
  });

  test('stock adjustment fails closed for invalid precondition and does not mutate order routes', async () => {
    jest.spyOn(productRepository, 'applyAdminStockAdjustment').mockResolvedValueOnce({
      applied: false,
      attemptClass: 'REPLAYED_PRIOR_OUTCOME',
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_PRECONDITION',
      replayOfAuditId: 'f8a4fd33-6d74-4baf-b24d-cd7f905b8bf4',
      targetProductId: validId,
      beforeQuantity: 8,
      auditId: '6d95c9de-8e84-41be-a7b6-b8ad23793ad5',
    });

    const response = await request(app)
      .post('/api/admin/products/stock-adjustments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        requestKey: '55555555-5555-4555-8555-555555555555',
        target: { productId: validId },
        intentClass: 'DAMAGE_LOSS_CORRECTION',
        quantityDelta: -1,
        expectedStock: 5,
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        auditId: '6d95c9de-8e84-41be-a7b6-b8ad23793ad5',
        attemptClass: 'REPLAYED_PRIOR_OUTCOME',
        outcomeClass: 'REJECTED',
        rejectionClass: 'INVALID_PRECONDITION',
        replayOfAuditId: 'f8a4fd33-6d74-4baf-b24d-cd7f905b8bf4',
        targetProductId: validId,
        beforeQuantity: 8,
        afterQuantity: null,
      },
    });
  });
});
