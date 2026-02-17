import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function token(role = 'customer', sub = '00000000-0000-0000-0000-000000000123') {
  return jwt.sign({ sub, role }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: process.env.JWT_ACCESS_ISSUER,
    audience: process.env.JWT_ACCESS_AUDIENCE,
    expiresIn: '5m',
  });
}

const payload = {
  idempotencyKey: 'idem_failures_12345',
  email: 'test@insidex.local',
  address: { line1: '1', city: 'Paris', postalCode: '75001', country: 'FR' },
  currency: 'EUR',
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1, price: 10 }],
};

describe('payments route failures', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creation session success', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: payload.items[0].id, price: 12.34 }]);
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockResolvedValue({ replayed: false, order: { id: '00000000-0000-0000-0000-000000000111', stripePaymentIntentId: 'pi_1' } });

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token()}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(1234);
  });

  test('stripe api error surface as 500', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: payload.items[0].id, price: 12.34 }]);
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockRejectedValue(new Error('Stripe down'));

    const res = await request(app).post('/api/payments/create-intent').set('Authorization', `Bearer ${token()}`).send(payload);
    expect(res.status).toBe(500);
  });

  test('amount mismatch fails', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: payload.items[0].id, price: 12.34 }]);
    const err = new Error('Amount mismatch');
    err.statusCode = 400;
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockRejectedValue(err);

    const res = await request(app).post('/api/payments/create-intent').set('Authorization', `Bearer ${token()}`).send(payload);
    expect(res.status).toBe(400);
  });

  test('user non autorise', async () => {
    const res = await request(app).post('/api/payments/create-intent').set('Authorization', `Bearer ${token('admin')}`).send(payload);
    expect(res.status).toBe(403);
  });

  test('order inexistante/product missing', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([]);
    const res = await request(app).post('/api/payments/create-intent').set('Authorization', `Bearer ${token()}`).send(payload);
    expect(res.status).toBe(404);
  });

  test('devise invalide', async () => {
    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token()}`)
      .send({ ...payload, currency: 'JPY' });

    expect(res.status).toBe(400);
  });
});