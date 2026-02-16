import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import paypal from '../../src/lib/paypal.js';

function token(role = 'customer', sub = '00000000-0000-0000-0000-000000000123', isGuest = false) {
  return jwt.sign({ sub, role, isGuest }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: process.env.JWT_ACCESS_ISSUER,
    audience: process.env.JWT_ACCESS_AUDIENCE,
    expiresIn: '5m',
  });
}

const validCheckoutPayload = {
  email: 'guest@insidex.test',
  address: {
    line1: '12 rue du Port',
    city: 'Mamoudzou',
    postalCode: '97600',
    country: 'FR',
  },
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1, price: 99.9 }],
};

describe('runtime business routes', () => {
  beforeEach(() => {
    process.env.AUTH_RATE_MAX = '2';
    process.env.API_RATE_MAX = '200';
    process.env.STRIPE_WEBHOOK_SECRET = 'test_stripe_secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    process.env.PAYPAL_CLIENT_ID = 'paypal-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'paypal-client-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('leads create returns 400 for unknown fields', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Jane Doe', email: 'jane@example.com', message: 'Message long enough', unknown: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('cart add item returns 400 for unknown fields', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ productId: 'LEGACY_ID_12345', quantity: 2, unknown: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('cart route mounted and validates params/body', async () => {
    const res = await request(app)
      .patch('/api/cart/items/item-1')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ qty: 2, anonId: 'anon-12345', unknown: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('cart delete uses strict validation for payload and params', async () => {
    const res = await request(app)
      .delete('/api/cart/items/item-1')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ anonId: 'anon-12345', extra: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('orders create returns 403 for admin role', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({
        ...validCheckoutPayload,
        idempotencyKey: 'idem-runtime-test-123',
      });
    expect(res.status).toBe(403);
  });

  test('orders create returns 200 for guest when replayed', async () => {
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockResolvedValue({
      replayed: true,
      order: { id: 'order-guest-1', userId: '00000000-0000-0000-0000-000000000123', items: [] },
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('guest', '00000000-0000-0000-0000-000000000123', true)}`)
      .send({
        ...validCheckoutPayload,
        idempotencyKey: 'idem-runtime-test-guest-123',
      });

    expect(res.status).toBe(200);
    expect(res.body.meta.isGuestCheckout).toBe(true);
  });

  test('orders create returns 201 for customer role', async () => {
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockResolvedValue({
      replayed: false,
      order: { id: 'order-customer-1', userId: '00000000-0000-0000-0000-000000000123', items: [] },
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123', false)}`)
      .send({
        ...validCheckoutPayload,
        idempotencyKey: 'idem-runtime-test-customer-123',
      });

    expect(res.status).toBe(201);
    expect(res.body.meta.isGuestCheckout).toBe(false);
  });

  test('orders create returns 403 for tampered guest claims', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('guest', '00000000-0000-0000-0000-000000000123', false)}`)
      .send({
        ...validCheckoutPayload,
        idempotencyKey: 'idem-runtime-test-tamper-123',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
  
  test('payments create-intent computes amount from DB and returns metadata', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: validCheckoutPayload.items[0].id, price: 120.5 }]);
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockResolvedValue({
      replayed: false,
      order: { id: '00000000-0000-0000-0000-000000000777', stripePaymentIntentId: 'pi_existing_777' },
    });

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123', false)}`)
      .send({ ...validCheckoutPayload, idempotencyKey: 'idem-payment-intent-123' });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(12050);
    expect(res.body.data.customer_email).toBe(validCheckoutPayload.email);
    expect(res.body.data.metadata.orderId).toBe('00000000-0000-0000-0000-000000000777');
    expect(res.body.data.metadata.userId).toBe('00000000-0000-0000-0000-000000000123');
    expect(res.body.data.metadata.idempotencyKey).toBe('idem-payment-intent-123');
  });



  test('payments create-intent is idempotent for concurrent multi-client retries', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: validCheckoutPayload.items[0].id, price: 49 }]);

    let first = true;
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockImplementation(async () => {
      if (first) {
        first = false;
        return { replayed: false, order: { id: '00000000-0000-0000-0000-000000000901', stripePaymentIntentId: 'pi_first' } };
      }
      return { replayed: true, order: { id: '00000000-0000-0000-0000-000000000901', stripePaymentIntentId: 'pi_first' } };
    });

    const body = { ...validCheckoutPayload, idempotencyKey: 'idem-multi-client-901' };
    const auth = { Authorization: `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123', false)}` };

    const [r1, r2] = await Promise.all([
      request(app).post('/api/payments/create-intent').set(auth).send(body),
      request(app).post('/api/payments/create-intent').set(auth).send(body),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.data.metadata.orderId).toBe('00000000-0000-0000-0000-000000000901');
    expect(r2.body.data.metadata.orderId).toBe('00000000-0000-0000-0000-000000000901');
  });

  test('stripe webhook verifies signature and calls atomic payment finalization', async () => {
    const body = {
      id: 'evt_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          metadata: {
            orderId: '00000000-0000-0000-0000-000000000777',
            userId: '00000000-0000-0000-0000-000000000123',
            idempotencyKey: 'idem-payment-intent-123',
          },
        },
      },
    };

    const signature = createStripeSignatureHeader(body, process.env.STRIPE_WEBHOOK_SECRET);
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.data.orderMarkedPaid).toBe(true);
  });


  test('stripe webhook rejects invalid signature', async () => {
    const body = {
      id: 'evt_invalid_sig',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_invalid_sig',
          metadata: {
            orderId: '00000000-0000-0000-0000-000000000777',
            userId: '00000000-0000-0000-0000-000000000123',
            idempotencyKey: 'idem-payment-intent-123',
          },
        },
      },
    };

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 't=1700000000,v1=invalid')
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('stripe webhook replay keeps idempotent behavior', async () => {
    const body = {
      id: 'evt_replay_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_replay_123',
          metadata: {
            orderId: '00000000-0000-0000-0000-000000000777',
            userId: '00000000-0000-0000-0000-000000000123',
            idempotencyKey: 'idem-payment-intent-123',
          },
        },
      },
    };

    const signature = createStripeSignatureHeader(body, process.env.STRIPE_WEBHOOK_SECRET);
    jest.spyOn(orderRepository, 'markPaidFromWebhook')
      .mockResolvedValueOnce({ replayed: false, orderMarkedPaid: true })
      .mockResolvedValueOnce({ replayed: true, orderMarkedPaid: false });

    const first = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', signature)
      .send(body);

    const replay = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', signature)
      .send(body);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
  });

  test('paypal webhook with verified signature is processed', async () => {
    const body = {
      eventId: 'paypal_evt_valid_1',
      orderId: '00000000-0000-0000-0000-000000000777',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000777',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-payment-intent-123',
      },
    };

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.data.orderMarkedPaid).toBe(true);
  });

  test('paypal webhook rejects invalid signature', async () => {
    const body = {
      eventId: 'paypal_evt_invalid_1',
      orderId: '00000000-0000-0000-0000-000000000777',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000777',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-payment-intent-123',
      },
    };

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: false, reason: 'FAILURE' });
    const processSpy = jest.spyOn(orderRepository, 'processPaymentWebhookEvent');

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .send(body);

    expect(res.status).toBe(400);
    expect(processSpy).not.toHaveBeenCalled();
  });

  test('paypal webhook replay keeps idempotent behavior', async () => {
    const body = {
      eventId: 'paypal_evt_replay_1',
      orderId: '00000000-0000-0000-0000-000000000777',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000777',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-payment-intent-123',
      },
    };

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent')
      .mockResolvedValueOnce({ replayed: false, orderMarkedPaid: true })
      .mockResolvedValueOnce({ replayed: true, orderMarkedPaid: false });

    const first = await request(app)
      .post('/api/webhooks/paypal')
      .send(body);

    const replay = await request(app)
      .post('/api/webhooks/paypal')
      .send(body);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
  });

  test('orders create rejects any userId field from client payload', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123')}`)
      .send({
        ...validCheckoutPayload,
        userId: '00000000-0000-0000-0000-000000000124',
        idempotencyKey: 'idem-runtime-test-123',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('orders create returns 400 for unknown fields (strict zod)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        ...validCheckoutPayload,
        idempotencyKey: 'idem-runtime-test-123',
        unknown: true,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
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