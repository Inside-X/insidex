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
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
};

describe('runtime business routes', () => {
  beforeEach(() => {
    process.env.AUTH_RATE_MAX = '2';
    process.env.API_RATE_MAX = '200';
    process.env.PAYMENT_WEBHOOK_SECRET = 'test_stripe_secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    process.env.PAYPAL_CLIENT_ID = 'paypal-client-id';
    process.env.PAYPAL_SECRET = 'paypal-client-secret';
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


  test('cart add item rejects client-provided userId', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ productId: 'LEGACY_ID_12345', quantity: 2, userId: '00000000-0000-0000-0000-000000000123' });

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
        fulfillment: { mode: 'pickup_local' },
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
        fulfillment: { mode: 'pickup_local' },
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
        fulfillment: { mode: 'pickup_local' },
        idempotencyKey: 'idem-runtime-test-customer-123',
      });

    expect(res.status).toBe(201);
    expect(res.body.meta.isGuestCheckout).toBe(false);
  });

  test('orders create returns 401 for tampered guest claims', async () => {
    const tamperedGuestToken = `${token('guest', '00000000-0000-0000-0000-000000000123', false)}x`;
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tamperedGuestToken}`)
      .send({
        ...validCheckoutPayload,
        fulfillment: { mode: 'pickup_local' },
        idempotencyKey: 'idem-runtime-test-tamper-123',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('orders readiness accepts admin and keeps readiness semantics bounded', async () => {
    jest.spyOn(orderRepository, 'markFulfillmentReady').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000555',
      status: 'paid',
      fulfillmentMode: 'pickup_local',
      fulfillmentSnapshot: {
        mode: 'pickup_local',
        readiness: { state: 'ready_for_pickup' },
      },
      items: [],
    });

    const res = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000555/readiness')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ target: 'ready_for_pickup', note: 'ready now' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
    expect(res.body.data.fulfillmentSnapshot.readiness.state).toBe('ready_for_pickup');
    expect(orderRepository.markFulfillmentReady).toHaveBeenCalledWith({
      orderId: '00000000-0000-0000-0000-000000000555',
      target: 'ready_for_pickup',
      actorType: 'admin',
      note: 'ready now',
    });
  });

  test('orders readiness rejects non-admin and invalid readiness payload', async () => {
    const nonAdmin = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000555/readiness')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ target: 'ready_for_pickup' });
    expect(nonAdmin.status).toBe(403);

    const invalid = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000555/readiness')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ target: 'shipped' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('orders completion accepts admin and keeps completion semantics bounded', async () => {
    jest.spyOn(orderRepository, 'markFulfillmentCompleted').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000556',
      status: 'paid',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: {
        mode: 'delivery_local',
        readiness: { state: 'ready_for_local_delivery' },
        completion: { state: 'delivered_local' },
      },
      items: [],
    });

    const res = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000556/completion')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ target: 'delivered_local', note: 'Drop-off completed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
    expect(res.body.data.fulfillmentSnapshot.completion.state).toBe('delivered_local');
    expect(orderRepository.markFulfillmentCompleted).toHaveBeenCalledWith({
      orderId: '00000000-0000-0000-0000-000000000556',
      target: 'delivered_local',
      actorType: 'admin',
      note: 'Drop-off completed',
    });
  });

  test('orders completion rejects non-admin and invalid completion payload', async () => {
    const nonAdmin = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000556/completion')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ target: 'collected' });
    expect(nonAdmin.status).toBe(403);

    const invalid = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000556/completion')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ target: 'ready_for_pickup' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('orders mine requires authentication and customer role', async () => {
    const unauthenticated = await request(app).get('/api/orders/mine');
    expect(unauthenticated.status).toBe(401);

    const admin = await request(app)
      .get('/api/orders/mine')
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(admin.status).toBe(403);
  });

  test('order detail mine/:id requires authentication and customer role', async () => {
    const orderId = '00000000-0000-0000-0000-000000000981';
    const unauthenticated = await request(app).get(`/api/orders/mine/${orderId}`);
    expect(unauthenticated.status).toBe(401);

    const admin = await request(app)
      .get(`/api/orders/mine/${orderId}`)
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(admin.status).toBe(403);
  });

  test('order detail mine/:id returns customer-safe detail for owner only', async () => {
    const userId = '00000000-0000-0000-0000-000000000abc';
    const orderId = '00000000-0000-0000-0000-000000000991';
    jest.spyOn(orderRepository, 'findCustomerOrderDetailVisibility').mockResolvedValue({
      id: orderId,
      userId,
      createdAt: '2026-04-18T10:00:00.000Z',
      status: 'paid',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: {
        mode: 'delivery_local',
        readiness: { state: 'ready_for_local_delivery' },
        delivery: { destination: { line1: '10 Rue du Port', postalCode: '97600', city: 'Mamoudzou' } },
      },
      totalAmount: '179.90',
      items: [{ quantity: 2, unitPrice: '89.95', product: { name: 'Inside X Kit' } }],
      operatorNotes: 'manual_remediation',
    });

    const res = await request(app)
      .get(`/api/orders/mine/${orderId}`)
      .set('Authorization', `Bearer ${token('customer', userId)}`);

    expect(res.status).toBe(200);
    expect(orderRepository.findCustomerOrderDetailVisibility).toHaveBeenCalledWith({ userId, orderId });
    expect(res.body.data).toEqual(expect.objectContaining({
      orderId,
      status: expect.objectContaining({ code: 'ready', label: 'Ready for local delivery' }),
      fulfillmentMode: expect.objectContaining({ code: 'delivery_local', label: 'Local delivery' }),
      payment: expect.objectContaining({ code: 'payment_confirmed' }),
      totals: expect.objectContaining({ totalAmount: '179.90', currency: 'EUR' }),
    }));
    expect(JSON.stringify(res.body.data)).not.toContain('ready_for_local_delivery');
    expect(JSON.stringify(res.body.data)).not.toContain('manual_remediation');
  });

  test('order detail mine/:id returns not found for non-owned or missing order', async () => {
    const userId = '00000000-0000-0000-0000-000000000abc';
    const orderId = '00000000-0000-0000-0000-000000000992';
    jest.spyOn(orderRepository, 'findCustomerOrderDetailVisibility').mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/orders/mine/${orderId}`)
      .set('Authorization', `Bearer ${token('customer', userId)}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('orders mine returns customer-safe list for authenticated customer', async () => {
    const userId = '00000000-0000-0000-0000-000000000abc';
    jest.spyOn(orderRepository, 'listCustomerOrderVisibility').mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000901',
        userId,
        createdAt: '2026-04-17T10:00:00.000Z',
        status: 'paid',
        fulfillmentMode: 'pickup_local',
        totalAmount: '149.90',
        fulfillmentSnapshot: {
          mode: 'pickup_local',
          readiness: { state: 'ready_for_pickup' },
        },
        items: [{ quantity: 2, product: { name: 'Inside X Kit' } }],
      },
      {
        id: '00000000-0000-0000-0000-000000000902',
        userId,
        createdAt: '2026-04-17T11:00:00.000Z',
        status: 'pending',
        fulfillmentMode: 'delivery_local',
        totalAmount: '79.90',
        fulfillmentSnapshot: {
          mode: 'delivery_local',
          completion: { state: 'delivered_local' },
        },
        items: [{ quantity: 1, product: { name: 'Flow Sensor' } }],
      },
    ]);

    const res = await request(app)
      .get('/api/orders/mine?limit=10')
      .set('Authorization', `Bearer ${token('customer', userId)}`);

    expect(res.status).toBe(200);
    expect(orderRepository.listCustomerOrderVisibility).toHaveBeenCalledWith({ userId, take: 10 });
    expect(res.body.meta.count).toBe(2);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        orderId: '00000000-0000-0000-0000-000000000901',
        status: expect.objectContaining({ code: 'ready', label: 'Ready for pickup' }),
        fulfillmentMode: expect.objectContaining({ code: 'pickup_local', label: 'Local pickup' }),
        itemSummary: expect.objectContaining({ count: 2 }),
      }),
      expect.objectContaining({
        orderId: '00000000-0000-0000-0000-000000000902',
        status: expect.objectContaining({ code: 'completed', label: 'Completed' }),
        fulfillmentMode: expect.objectContaining({ code: 'delivery_local', label: 'Local delivery' }),
      }),
    ]);
    expect(JSON.stringify(res.body.data)).not.toContain('ready_for_pickup');
    expect(JSON.stringify(res.body.data)).not.toContain('delivered_local');
    expect(JSON.stringify(res.body.data)).not.toContain('shipped');
  });

  test('orders mine returns empty list for authenticated customer without orders', async () => {
    jest.spyOn(orderRepository, 'listCustomerOrderVisibility').mockResolvedValue([]);
    const res = await request(app)
      .get('/api/orders/mine')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000abc')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  test('orders mine fail-closes by excluding records not owned by authenticated customer', async () => {
    const userId = '00000000-0000-0000-0000-000000000abc';
    jest.spyOn(orderRepository, 'listCustomerOrderVisibility').mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000903',
        userId: '00000000-0000-0000-0000-000000000999',
        createdAt: '2026-04-17T12:00:00.000Z',
        status: 'paid',
        fulfillmentMode: 'pickup_local',
        totalAmount: '49.90',
        fulfillmentSnapshot: { mode: 'pickup_local' },
        items: [{ quantity: 1, product: { name: 'Water Sensor' } }],
      },
    ]);

    const res = await request(app)
      .get('/api/orders/mine')
      .set('Authorization', `Bearer ${token('customer', userId)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
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
    expect(orderRepository.createPendingPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({
      userId: '00000000-0000-0000-0000-000000000123',
      idempotencyKey: 'idem-payment-intent-123',
      expectedTotalAmountMinor: 12050,
      items: [{ productId: validCheckoutPayload.items[0].id, quantity: 1 }],
    }));
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
    expect(orderRepository.createPendingPaymentOrder).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedTotalAmountMinor: 4900,
      items: [{ productId: validCheckoutPayload.items[0].id, quantity: 1 }],
    }));
    expect(orderRepository.createPendingPaymentOrder).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedTotalAmountMinor: 4900,
      items: [{ productId: validCheckoutPayload.items[0].id, quantity: 1 }],
    }));
  });

  test('stripe webhook verifies signature and calls atomic payment finalization', async () => {
    const body = {
      id: 'evt_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          status: 'succeeded',
          amount_received: 9990,
          currency: 'eur',
          metadata: {
            orderId: '00000000-0000-0000-0000-000000000777',
            userId: '00000000-0000-0000-0000-000000000123',
            idempotencyKey: 'idem-payment-intent-123',
          },
        },
      },
    };

    const signature = createStripeSignatureHeader(body, process.env.PAYMENT_WEBHOOK_SECRET);
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000777', status: 'pending', totalAmount: '99.90', currency: 'EUR' });
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
          status: 'succeeded',
          amount_received: 9990,
          currency: 'eur',
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
          status: 'succeeded',
          amount_received: 9990,
          currency: 'eur',
          metadata: {
            orderId: '00000000-0000-0000-0000-000000000777',
            userId: '00000000-0000-0000-0000-000000000123',
            idempotencyKey: 'idem-payment-intent-123',
          },
        },
      },
    };

    const signature = createStripeSignatureHeader(body, process.env.PAYMENT_WEBHOOK_SECRET);
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000777', status: 'pending', totalAmount: '99.90', currency: 'EUR' });
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
    expect(replay.body.data).toEqual({ ignored: true, reason: 'replay_detected' });
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

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000777', status: 'pending', totalAmount: '99.90', currency: 'EUR' });
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

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: false, verificationStatus: 'FAILURE', reason: 'FAILURE' });
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

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000777', status: 'pending', totalAmount: '99.90', currency: 'EUR' });
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
    expect(replay.body.data).toEqual({ ignored: true, reason: 'replay_detected' });
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

  test('orders rejects client price injection and does not call repository', async () => {
    const createOrderSpy = jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock');

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123')}`)
      .send({
        ...validCheckoutPayload,
        items: [{ ...validCheckoutPayload.items[0], price: 99.9 }],
        idempotencyKey: 'idem-runtime-test-price-injection-order',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  test('payments rejects client price injection and does not call repository', async () => {
    const createPendingOrderSpy = jest.spyOn(orderRepository, 'createPendingPaymentOrder');

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123')}`)
      .send({
        ...validCheckoutPayload,
        items: [{ ...validCheckoutPayload.items[0], price: 99.9 }],
        idempotencyKey: 'idem-runtime-test-price-injection-payment',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(createPendingOrderSpy).not.toHaveBeenCalled();
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


  test('analytics events reject client-provided userId', async () => {
    const res = await request(app)
      .post('/api/analytics/events')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ eventType: 'view', userId: '00000000-0000-0000-0000-000000000123', payload: {} });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  
  test('analytics listing mounted and protected', async () => {
    const res = await request(app)
      .get('/api/analytics/events?eventType=view')
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
  });
});
