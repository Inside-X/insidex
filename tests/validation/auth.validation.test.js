import request from 'supertest';
import { buildValidationTestApp } from '../helpers/validation-test-app.js';

describe('Auth validation', () => {
  const app = buildValidationTestApp();

  test('rejects invalid email', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'invalid-email', password: 'longpassword' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Invalid request payload');
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })])
    );
  });

  test('rejects short password', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })])
    );
  });


  test('accepts register payload even when role is injected (server-side role is enforced later)', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: '12345678', role: 'admin' });

    expect(response.status).toBe(201);
  });
  
  test('rejects unknown injected field', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: '12345678', hacked: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'payload' })])
    );
  });

  test('rejects empty body', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  test('rejects incorrect content-type body', async () => {
    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'text/plain')
      .send('email=user@example.com&password=12345678');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'payload' })])
    );
  });
});