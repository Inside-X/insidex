import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';

function token(role = 'customer', sub = '00000000-0000-0000-0000-000000000123') {
  return jwt.sign({ sub, role }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: process.env.JWT_ACCESS_ISSUER,
    audience: process.env.JWT_ACCESS_AUDIENCE,
    expiresIn: '5m',
  });
}

describe('runtime business routes', () => {
  beforeEach(() => {
    process.env.AUTH_RATE_MAX = '2';
    process.env.API_RATE_MAX = '200';
  });

  test('mounts auth register', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'u@x.com', password: 'Password123', role: 'customer' });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('returns 429 on strict auth rate limiting', async () => {
    await request(app).post('/api/auth/login').send({ email: 'u@x.com', password: 'Password123' });
    await request(app).post('/api/auth/login').send({ email: 'u@x.com', password: 'Password123' });
    const res = await request(app).post('/api/auth/login').send({ email: 'u@x.com', password: 'Password123' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('products create returns 401 without token', async () => {
    const res = await request(app).post('/api/products').send({ name: 'abc', description: 'desc', price: 10, stock: 1 });
    expect(res.status).toBe(401);
  });

  test('products create returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ name: 'abc', description: 'desc', price: 10, stock: 1 });
    expect(res.status).toBe(403);
  });

  test('products create returns 201 for admin', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ name: 'abc', description: 'desc', price: 10, stock: 1 });
    expect(res.status).toBe(201);
  });

  test('cart route mounted and validates params/body', async () => {
    const res = await request(app)
      .patch('/api/cart/items/item-1')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ qty: 2, anonId: 'anon-12345', unknown: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  
  test('orders create returns 403 for non-customer role', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({
        userId: '00000000-0000-0000-0000-000000000123',
        items: [{ productId: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      });
    expect(res.status).toBe(403);
  });

  test('orders create returns 403 when customer tries to create order for another user', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123')}`)
      .send({
        userId: '00000000-0000-0000-0000-000000000124',
        items: [{ productId: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      });
    expect(res.status).toBe(403);
  });
  test('orders route validates uuid params', async () => {
    const res = await request(app)
      .get('/api/orders/not-uuid')
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(400);
  });

  test('leads admin listing is role-protected', async () => {
    const res = await request(app)
      .get('/api/leads?page=1&limit=10')
      .set('Authorization', `Bearer ${token('customer')}`);
    expect(res.status).toBe(403);
  });

  test('analytics listing mounted and protected', async () => {
    const res = await request(app)
      .get('/api/analytics/events?eventType=view')
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
  });
});