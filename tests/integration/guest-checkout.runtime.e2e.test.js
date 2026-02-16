import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import { userRepository } from '../../src/repositories/user.repository.js';
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

const checkoutPayload = {
  email: 'guest@insidex.test',
  address: {
    line1: '12 rue du Port',
    city: 'Mamoudzou',
    postalCode: '97600',
    country: 'FR',
  },
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1, price: 59.9 }],
};

describe('guest checkout runtime e2e', () => {
  beforeEach(() => {
    process.env.API_RATE_MAX = '200';
    process.env.STRIPE_WEBHOOK_SECRET = 'test_stripe_secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
    process.env.PAYPAL_CLIENT_ID = 'paypal-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'paypal-client-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('auth: creates guest user, assigns implicit JWT, customer RBAC only', async () => {
    jest.spyOn(userRepository, 'createGuest').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000124', isGuest: true });
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: checkoutPayload.items[0].id, price: 59.9 }]);
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockResolvedValue({
      replayed: false,
      order: { id: '00000000-0000-0000-0000-000000000200', stripePaymentIntentId: 'pi_200' },
    });

    const guestRes = await request(app)
      .post('/api/payments/create-intent')
      .send({ ...checkoutPayload, idempotencyKey: 'idem-guest-auth-12345' });

    expect(guestRes.status).toBe(201);
    expect(guestRes.body.meta.isGuestCheckout).toBe(true);
    expect(guestRes.body.meta.guestSessionToken).toBeDefined();

    const adminRes = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ ...checkoutPayload, idempotencyKey: 'idem-admin-forbidden-12345' });

    expect(adminRes.status).toBe(403);
  });

  test('orders: success + response contract unchanged', async () => {

  test('auth: guest checkout with existing permanent email creates isolated guest identity and guest JWT claims', async () => {
    const permanentUser = {
      id: '00000000-0000-0000-0000-00000000aa11',
      email: checkoutPayload.email,
      isGuest: false,
      role: 'customer',
    };
    const createdGuest = {
      id: '00000000-0000-0000-0000-00000000bb22',
      email: 'guest-system@guest.insidex.local',
      isGuest: true,
      role: 'customer',
      guestAddress: checkoutPayload.address,
    };

    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);
    const userCreateSpy = jest.spyOn(prisma.user, 'create').mockResolvedValueOnce(createdGuest);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: checkoutPayload.items[0].id, price: 59.9 }]);
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockResolvedValue({
      replayed: false,
      order: { id: '00000000-0000-0000-0000-000000000888', stripePaymentIntentId: 'pi_888' },
    });

    const guestRes = await request(app)
      .post('/api/payments/create-intent')
      .send({ ...checkoutPayload, idempotencyKey: 'idem-guest-isolation-12345' });

    expect(guestRes.status).toBe(201);
    expect(userCreateSpy).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isGuest: true,
        role: 'customer',
        guestAddress: checkoutPayload.address,
      }),
    }));

    const tokenPayload = jwt.verify(guestRes.body.meta.guestSessionToken, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
    });

    expect(tokenPayload.sub).toBe(createdGuest.id);
    expect(tokenPayload.role).toBe('guest');
    expect(tokenPayload.isGuest).toBe(true);
    expect(tokenPayload.sub).not.toBe(permanentUser.id);
    expect(createdGuest.id).not.toBe(permanentUser.id);
    expect(createdGuest.email).not.toBe(permanentUser.email);
    expect(permanentUser.email).toBe(checkoutPayload.email);
  });


  test('orders: guest-created orders always use authenticated guest id', async () => {
    const guestUser = { id: '00000000-0000-0000-0000-00000000cc33', isGuest: true };
    jest.spyOn(userRepository, 'createGuest').mockResolvedValue(guestUser);

    const createOrderSpy = jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockResolvedValueOnce({
      replayed: false,
      order: { id: 'order-guest-1', items: [] },
    });

    const response = await request(app)
      .post('/api/orders')
      .send({
        ...checkoutPayload,
        idempotencyKey: 'idem-order-guest-owner-12345',
      });

    expect(response.status).toBe(201);
    expect(createOrderSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: guestUser.id }));
    expect(response.body.meta.isGuestCheckout).toBe(true);
  });
  
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockResolvedValueOnce({
      replayed: false,
      order: { id: 'order-ok-1', items: [] },
    });

    const ok = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ ...checkoutPayload, idempotencyKey: 'idem-order-success-12345' });

    expect(ok.status).toBe(201);
    expect(ok.body.data.id).toBe('order-ok-1');
    expect(ok.body.meta).toEqual({ replayed: false, isGuestCheckout: false });
  });

  test('orders: idempotency replay returns 200 and replayed=true', async () => {
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockResolvedValueOnce({
      replayed: true,
      order: { id: 'order-ok-1', items: [] },
    });

    const replay = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ ...checkoutPayload, idempotencyKey: 'idem-order-replay-12345' });

    expect(replay.status).toBe(200);
    expect(replay.body.meta.replayed).toBe(true);
  });

  test('orders: invalid payload returns 400', async () => {
    const invalid = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ idempotencyKey: 'idem-order-invalid-12345', items: [] });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('orders: auth failure returns 401 for invalid token', async () => {
    const unauthorized = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer invalid.token.value')
      .send({ ...checkoutPayload, idempotencyKey: 'idem-order-unauth-12345' });

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error.code).toBe('UNAUTHORIZED');
  });

  test('orders: spoofing blocked and stock insuffisant returns 400', async () => {
    const spoof = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer', '00000000-0000-0000-0000-000000000123')}`)
      .send({ ...checkoutPayload, userId: '00000000-0000-0000-0000-000000000999', idempotencyKey: 'idem-order-spoof-12345' });
    expect(spoof.status).toBe(403);
    
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockRejectedValueOnce(
      Object.assign(new Error('Insufficient stock for product'), { statusCode: 400, code: 'INSUFFICIENT_STOCK' }),
    );

    const lowStock = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ ...checkoutPayload, idempotencyKey: 'idem-order-low-stock-12345' });
    expect(lowStock.status).toBe(400);
    expect(lowStock.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('payments: stripe intent + webhook replay + paypal webhook replay + invalid signature 400', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: checkoutPayload.items[0].id, price: 100 }]);
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockResolvedValue({
      replayed: false,
      order: { id: '00000000-0000-0000-0000-000000000777', stripePaymentIntentId: 'pi_777' },
    });

    const intent = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token('customer')}`)
      .send({ ...checkoutPayload, idempotencyKey: 'idem-intent-77777' });

    expect(intent.status).toBe(201);
    expect(intent.body.data.clientSecret).toBeDefined();

    jest.spyOn(orderRepository, 'markPaidFromWebhook')
      .mockResolvedValueOnce({ replayed: false, orderMarkedPaid: true })
      .mockResolvedValueOnce({ replayed: true, orderMarkedPaid: false });

    const stripeBody = {
      id: 'evt_777',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_777',
          metadata: {
            orderId: '00000000-0000-0000-0000-000000000777',
            userId: '00000000-0000-0000-0000-000000000123',
            idempotencyKey: 'idem-intent-77777',
          },
        },
      },
    };
    const sig = createStripeSignatureHeader(stripeBody, process.env.STRIPE_WEBHOOK_SECRET);

    const stripeFirst = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripeBody);
    const stripeReplay = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripeBody);

    expect(stripeFirst.status).toBe(200);
    expect(stripeReplay.status).toBe(200);
    expect(stripeReplay.body.data.replayed).toBe(true);

    const verifyPaypalSignature = jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent')
      .mockResolvedValueOnce({ replayed: false, orderMarkedPaid: true })
      .mockResolvedValueOnce({ replayed: true, orderMarkedPaid: false });

    const paypalPayload = {
      eventId: 'paypal_evt_1',
      orderId: '00000000-0000-0000-0000-000000000777',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000777',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-intent-77777',
      },
    };

    const paypalFirst = await request(app).post('/api/webhooks/paypal').send(paypalPayload);
    const paypalReplay = await request(app).post('/api/webhooks/paypal').send(paypalPayload);

    expect(paypalFirst.status).toBe(200);
    expect(paypalReplay.status).toBe(200);
    expect(paypalReplay.body.data.replayed).toBe(true);

    verifyPaypalSignature.mockResolvedValueOnce({ verified: false, reason: 'FAILURE' });
    const paypalInvalid = await request(app).post('/api/webhooks/paypal').send(paypalPayload);
    expect(paypalInvalid.status).toBe(400);

    const badSig = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'invalid')
      .send(stripeBody);

    expect(badSig.status).toBe(400);
  });

  test('concurrence: 2 commandes simultanées sur stock limité => 1 succès, 1 rollback', async () => {
    let stock = 1;
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockImplementation(async () => {
      if (stock > 0) {
        stock -= 1;
        return { replayed: false, order: { id: `order-${stock}`, items: [] } };
      }

      throw Object.assign(new Error('Insufficient stock for product'), { statusCode: 400, code: 'INSUFFICIENT_STOCK' });
    });

    const reqBodyA = { ...checkoutPayload, idempotencyKey: 'idem-concurrency-a-12345' };
    const reqBodyB = { ...checkoutPayload, idempotencyKey: 'idem-concurrency-b-12345' };

    const [a, b] = await Promise.all([
      request(app).post('/api/orders').set('Authorization', `Bearer ${token('customer')}`).send(reqBodyA),
      request(app).post('/api/orders').set('Authorization', `Bearer ${token('customer')}`).send(reqBodyB),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 400]);
  });
});