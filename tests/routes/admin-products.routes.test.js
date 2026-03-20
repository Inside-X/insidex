import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';

const adminToken = buildTestToken({ role: 'admin', id: 'admin-products-1' });
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

describe('admin products routes scaffolding', () => {
  test('create success', async () => {
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

    const response = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toEqual({
      data: {
        id: 'prod_placeholder_create',
        ...payload,
        status: 'draft',
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

  test('update success', async () => {
    const payload = {
      name: 'Amani Lounge Chair',
      slug: 'amani-lounge-chair',
      shortDescription: 'Updated short summary.',
      description: 'Updated full description.',
      price: '149.90',
      currency: 'EUR',
      stock: 5,
      status: 'draft',
    };

    const response = await request(app)
      .patch(`/api/admin/products/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        id: validId,
        ...payload,
        media: [],
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

  test('publish success', async () => {
    const response = await request(app)
      .patch(`/api/admin/products/${validId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

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

  test('unpublish success', async () => {
    const response = await request(app)
      .patch(`/api/admin/products/${validId}/unpublish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(response.body).toEqual({
      data: {
        id: validId,
        status: 'draft',
      },
    });
  });

  test('replaceMedia success', async () => {
    const payload = {
      media: [
        ...validMedia,
        {
          id: 'media_002',
          url: 'https://cdn.example.com/products/amani-chair/side.jpg',
          alt: 'Amani Chair side view',
          sortOrder: 1,
          isPrimary: false,
          kind: 'image',
        },
      ],
    };

    const response = await request(app)
      .put(`/api/admin/products/${validId}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        id: validId,
        media: payload.media,
      },
    });
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
});
