import request from 'supertest';
import { buildValidationTestApp } from '../helpers/validation-test-app.js';

describe('Leads validation', () => {
  const app = buildValidationTestApp();

  test('rejects invalid email format', async () => {
    const response = await request(app)
      .post('/leads')
      .send({ name: 'Alice', email: 'bad-email', message: 'Message long valide' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })])
    );
  });

  test('rejects xss/script payload by min length constraints', async () => {
    const response = await request(app)
      .post('/leads')
      .send({ name: '<script>', email: 'ok@example.com', message: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'message' })])
    );
  });

  test('rejects massive payload > limits', async () => {
    const response = await request(app)
      .post('/leads')
      .send({
        name: 'N'.repeat(121),
        email: 'lead@example.com',
        message: 'M'.repeat(2001),
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'message' }),
      ])
    );
  });

  test('keeps homogeneous JSON error envelope', async () => {
    const response = await request(app)
      .post('/leads')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: expect.any(Array),
        }),
      })
    );
  });
});