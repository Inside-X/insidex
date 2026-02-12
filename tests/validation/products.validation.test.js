import request from 'supertest';
import { buildValidationTestApp } from '../helpers/validation-test-app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';

describe('Products validation', () => {
  const app = buildValidationTestApp();

  test('rejects negative price with VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/products')
      .send({
        name: 'Produit test',
        description: 'desc',
        price: -10,
        stock: 4,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Invalid request payload');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'price' })])
    );
  });

  test('executes validation before auth (invalid body returns 400 even without token)', async () => {
    const response = await request(app)
      .post('/products')
      .send({
        name: 'ab',
        description: 'desc',
        price: 10,
        stock: 4,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })])
    );
  });

  test('rejects SQL-like payload as invalid type/constraints', async () => {
    const token = buildTestToken({ role: 'admin' });
    const response = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: "x'; DROP TABLE products; --",
        description: 'ok',
        price: '0 OR 1=1',
        stock: 2,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'price' })])
    );
  });

  test('rejects massive payload over limits', async () => {
    const token = buildTestToken({ role: 'admin' });
    const response = await request(app)
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'P'.repeat(151),
        description: 'D'.repeat(2001),
        price: 10,
        stock: 1,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'description' }),
      ])
    );
  });
});