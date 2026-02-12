import request from 'supertest';
import { buildValidationTestApp } from '../helpers/validation-test-app.js';

describe('Cart validation', () => {
  const app = buildValidationTestApp();

  test('rejects quantity equal to 0', async () => {
    const response = await request(app)
      .post('/cart/add')
      .send({ productId: '1234567890', quantity: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Invalid request payload');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'quantity' })])
    );
  });

  test('rejects script tag payload with invalid productId format', async () => {
    const response = await request(app)
      .post('/cart/add')
      .send({ productId: '<script>alert(1)</script>', quantity: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'productId' })])
    );
  });

  test('rejects unknown field injection', async () => {
    const response = await request(app)
      .post('/cart/add')
      .send({ productId: '1234567890', quantity: 1, privilege: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'payload' })])
    );
  });
});