import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../../src/validation/validate.middleware.js';
import errorHandler from '../../src/middlewares/error-handler.js';
import { cartSchemas, productsSchemas, authSchemas, leadsSchemas, ordersSchemas, analyticsSchemas } from '../../src/validation/schemas/index.js';
import '../../src/validation/schemas/common.schema.js';

describe('validation coverage hardening', () => {
  test('validate throws on invalid property selector', () => {
    expect(() => validate(z.object({}), 'headers')).toThrow('validate middleware received invalid property');
  });

  test('validate rejects non-json content-type with payload', async () => {
    const app = express();
    app.use(express.text());
    app.post('/x', validate(z.object({ a: z.string() })), (_req, res) => res.status(200).end());
    app.use(errorHandler);

    const res = await request(app).post('/x').set('Content-Type', 'text/plain').send('a=b');
    expect(res.status).toBe(400);
  });

  test('validate rejects non-object JSON body', async () => {
    const app = express();
    app.use(express.json());
    app.post('/x', validate(z.object({ a: z.string() })), (_req, res) => res.status(200).end());
    app.use(errorHandler);

    const res = await request(app).post('/x').send(['bad']);
    expect(res.status).toBe(400);
  });

  test('cart legacy addItem + sync strict schemas are enforced', () => {
    expect(() => cartSchemas.addItem.parse({ id: '1', name: 'n', price: 1, userId: 'u', extra: true })).toThrow();
    expect(cartSchemas.sync.parse({ anonId: 'a' })).toEqual({ anonId: 'a' });
    expect(cartSchemas.sync.safeParse({ anonId: 'a', userId: 'u' }).success).toBe(false);
  });


  test('orders create schema rejects client-provided userId', () => {
    expect(ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-order-schema-12345',
      email: 'guest@insidex.test',
      address: {
        line1: '12 rue du Port',
        city: 'Mamoudzou',
        postalCode: '97600',
        country: 'FR',
      },
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      userId: '00000000-0000-0000-0000-000000000123',
    }).success).toBe(false);
  });


  test('analytics track rejects client-provided userId', () => {
    expect(analyticsSchemas.track.safeParse({
      eventType: 'add_to_cart',
      userId: '00000000-0000-0000-0000-000000000123',
      payload: { test: true },
    }).success).toBe(false);
  });

  test('query/params schemas accept valid payload', () => {
    expect(productsSchemas.listQuery.parse({ published: 'true', minPrice: '1' }).published).toBe(true);
    expect(productsSchemas.byIdParams.parse({ id: 'p-123' }).id).toBe('p-123');
    expect(leadsSchemas.listQuery.parse({ page: '1', limit: '10' }).page).toBe(1);
    expect(authSchemas.forgot.parse({ email: 'a@b.com' }).email).toBe('a@b.com');
    expect(ordersSchemas.byIdParams.safeParse({ id: 'bad' }).success).toBe(false);
    expect(analyticsSchemas.listQuery.parse({ eventType: 'view', limit: '20' }).limit).toBe(20);
  });


  test('validate forwards unexpected parser errors', async () => {
    const app = express();
    app.use(express.json());
    const explodingSchema = { parse: () => { throw new Error('boom'); } };
    app.post('/x', validate(explodingSchema), (_req, res) => res.status(200).end());
    app.use(errorHandler);

    const res = await request(app).post('/x').send({ a: 'ok' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  test('cart add schema supports uuid and legacy id branches', () => {
    expect(cartSchemas.add.parse({ productId: '123e4567-e89b-12d3-a456-426614174000', quantity: 1 }).quantity).toBe(1);
    expect(cartSchemas.add.parse({ productId: 'LEGACY_ID_12345', quantity: 2 }).quantity).toBe(2);
    expect(cartSchemas.add.safeParse({ productId: 'bad', quantity: 2 }).success).toBe(false);
    expect(cartSchemas.getCartQuery.safeParse({}).success).toBe(true);
  });
});