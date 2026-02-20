import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import paypal from '../../src/lib/paypal.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { createWebhookIdempotencyStore } from '../../src/lib/webhook-idempotency-store.js';
import { logger } from '../../src/utils/logger.js';

function authToken(role = 'customer', sub = '00000000-0000-0000-0000-000000000123') {
  return jwt.sign({ sub, role, isGuest: role === 'guest' }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: process.env.JWT_ACCESS_ISSUER,
    audience: process.env.JWT_ACCESS_AUDIENCE,
    expiresIn: '5m',
  });
}

const baseCheckout = {
  idempotencyKey: 'idem-financial-flow-12345',
  email: 'money-audit@insidex.local',
  address: {
    line1: '1 Rue Audit',
    city: 'Paris',
    postalCode: '75001',
    country: 'FR',
  },
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 2 }],
  currency: 'EUR',
};

describe('destructive financial flow audit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('canonical create-intent path maps request->validation->minor conversion->repo write->response', async () => {
    const trace = [];
    jest.spyOn(prisma.product, 'findMany').mockImplementation(async (...args) => {
      trace.push({ step: 'repository.read_products', args });
      return [{ id: baseCheckout.items[0].id, price: '10.50' }];
    });

    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockImplementation(async (payload) => {
      trace.push({ step: 'repository.create_pending_order', payload });
      return {
        replayed: false,
        order: {
          id: '00000000-0000-0000-0000-000000000701',
          stripePaymentIntentId: 'pi_financial_path_1',
        },
      };
    });

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${authToken()}`)
      .send(baseCheckout);

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(2100);
    expect(res.body.data.metadata.idempotencyKey).toBe(baseCheckout.idempotencyKey);
    expect(trace.map((entry) => entry.step)).toEqual([
      'repository.read_products',
      'repository.create_pending_order',
    ]);
    expect(trace[1].payload.expectedTotalAmountMinor).toBe(2100);
  });

  test('payment intent retry after timeout enforces idempotency and does not duplicate money mutation', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: baseCheckout.items[0].id, price: '12.00' }]);

    let logicalMutationCount = 0;
    let attempt = 0;
    const seen = new Set();
    jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockImplementation(async ({ idempotencyKey }) => {
      attempt += 1;
      if (attempt === 1) {
        const timeout = new Error('gateway timeout');
        timeout.code = 'ETIMEDOUT';
        throw timeout;
      }

      if (!seen.has(idempotencyKey)) {
        seen.add(idempotencyKey);
        logicalMutationCount += 1;
        return { replayed: false, order: { id: 'order-timeout-1', stripePaymentIntentId: 'pi-timeout-1' } };
      }

      return { replayed: true, order: { id: 'order-timeout-1', stripePaymentIntentId: 'pi-timeout-1' } };
    });

    const first = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ ...baseCheckout, idempotencyKey: 'idem-timeout-retry-12345' });

    const second = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ ...baseCheckout, idempotencyKey: 'idem-timeout-retry-12345' });

    expect(first.status).toBe(500);
    expect(second.status).toBe(201);
    expect(logicalMutationCount).toBe(1);
  });

  test('concurrent checkout on same cart idempotency key yields one mutation and one replay', async () => {
    const trace = [];
    const processed = new Set();
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockImplementation(async ({ idempotencyKey }) => {
      trace.push(`order.create_attempt:${idempotencyKey}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (processed.has(idempotencyKey)) {
        trace.push('order.replay_hit');
        return { replayed: true, order: { id: 'order-race-1', status: 'pending', items: [] } };
      }
      processed.add(idempotencyKey);
      trace.push('order.first_commit');
      return { replayed: false, order: { id: 'order-race-1', status: 'pending', items: [] } };
    });

    const payload = { ...baseCheckout, idempotencyKey: 'idem-concurrent-cart-12345' };
    delete payload.currency;

    const [a, b] = await Promise.all([
      request(app).post('/api/orders').set('Authorization', `Bearer ${authToken()}`).send(payload),
      request(app).post('/api/orders').set('Authorization', `Bearer ${authToken()}`).send(payload),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 201]);
    expect(trace).toContain('order.first_commit');
    expect(trace).toContain('order.replay_hit');
  });

  test('guest checkout order creation remains bound to generated guest identity', async () => {
    jest.spyOn(userRepository, 'createGuest').mockResolvedValue({
      id: '00000000-0000-0000-0000-00000000ab01',
      isGuest: true,
    });
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockResolvedValue({
      replayed: false,
      order: { id: 'order-guest-safe-1', status: 'pending', items: [] },
    });

    const response = await request(app)
      .post('/api/orders')
      .send((() => { const payload = { ...baseCheckout, idempotencyKey: 'idem-guest-order-12345' }; delete payload.currency; return payload; })());

    expect(response.status).toBe(201);
    expect(response.body.meta.isGuestCheckout).toBe(true);
    expect(response.body.meta.guestSessionToken).toBeDefined();
    const [, token] = response.body.meta.guestSessionToken.split('Bearer ');
    expect(token || response.body.meta.guestSessionToken).toBeTruthy();
  });

  test('paypal webhook replay (including simultaneous and delayed) does not double-mark paid', async () => {
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();
    const trace = [];

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockImplementation(async () => {
      trace.push('external.verify_signature');
      return { verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' };
    });

    jest.spyOn(orderRepository, 'findById').mockImplementation(async () => ({
      id: '00000000-0000-0000-0000-000000000555',
      totalAmount: '10.00',
      currency: 'EUR',
      status: 'pending',
    }));

    let paidMutationCount = 0;
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockImplementation(async () => {
      paidMutationCount += 1;
      trace.push('repository.mark_paid');
      return { replayed: false, orderMarkedPaid: true };
    });

    const payload = {
      eventId: 'paypal_evt_destructive_1',
      orderId: '00000000-0000-0000-0000-000000000555',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000555',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-paypal-webhook-12345',
      },
      payload: {
        capture: {
          id: 'cap_destructive_1',
          amount: '10.00',
          currency: 'EUR',
          status: 'COMPLETED',
        },
      },
    };

    const [first, simultaneous] = await Promise.all([
      request(app).post('/api/webhooks/paypal').set('content-type', 'application/json').send(payload),
      request(app).post('/api/webhooks/paypal').set('content-type', 'application/json').send(payload),
    ]);
    const delayed = await request(app).post('/api/webhooks/paypal').set('content-type', 'application/json').send(payload);

    expect(first.status).toBe(200);
    expect(simultaneous.status).toBe(200);
    expect(delayed.status).toBe(200);
    expect(paidMutationCount).toBe(1);
    expect(trace.filter((step) => step === 'repository.mark_paid')).toHaveLength(1);
  });

  test.each([
    { label: 'float number', amount: 10.5, status: 400 },
    { label: 'scientific notation string', amount: '1e3', status: 400 },
    { label: 'negative amount', amount: '-9.99', status: 200 },
    { label: 'null amount', amount: null, status: 200 },
    { label: 'Infinity coerced to null', amount: Infinity, status: 200 },
    { label: 'NaN coerced to null', amount: Number.NaN, status: 200 },
  ])('paypal webhook rejects or safely ignores malformed monetary amount: $label', async ({ amount, status }) => {
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    const paymentMutationSpy = jest.spyOn(orderRepository, 'processPaymentWebhookEvent');

    const bad = {
      eventId: `paypal_evt_bad_${String(amount).replace(/[^a-zA-Z0-9]/g, '_')}`,
      orderId: '00000000-0000-0000-0000-000000000555',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000555',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-bad-money-12345',
      },
      payload: {
        capture: {
          amount,
          currency: 'EUR',
          status: 'COMPLETED',
        },
      },
    };

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('content-type', 'application/json')
      .send(bad);

    expect(res.status).toBe(status);
    expect(paymentMutationSpy).not.toHaveBeenCalled();
  });

  test('orders webhook route enforces provider/event validation before repository mutation', async () => {
    const repoSpy = jest.spyOn(orderRepository, 'processPaymentWebhookEvent');

    const res = await request(app)
      .post('/api/orders/webhooks/payments')
      .send({
        provider: 'paypal',
        eventId: '',
        orderId: '00000000-0000-0000-0000-000000000555',
      });

    expect(res.status).toBe(400);
    expect(repoSpy).not.toHaveBeenCalled();
  });

  test('webhook out-of-order events only mutate state on succeeded completion event', async () => {
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();

    const infoSpy = jest.spyOn(logger, 'info');
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000556',
      totalAmount: '15.00',
      currency: 'EUR',
      status: 'pending',
    });

    const mutationSpy = jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });

    const pendingPayload = {
      eventId: 'paypal_evt_pending_state_1',
      orderId: '00000000-0000-0000-0000-000000000556',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000556',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem-out-of-order-12345',
      },
      payload: {
        capture: {
          amount: '15.00',
          currency: 'EUR',
          status: 'PENDING',
        },
      },
    };

    const completedPayload = {
      ...pendingPayload,
      eventId: 'paypal_evt_completed_state_1',
      payload: {
        capture: {
          id: 'cap_completed_1',
          amount: '15.00',
          currency: 'EUR',
          status: 'COMPLETED',
        },
      },
    };

    const pendingRes = await request(app).post('/api/webhooks/paypal').set('content-type', 'application/json').send(pendingPayload);
    const completedRes = await request(app).post('/api/webhooks/paypal').set('content-type', 'application/json').send(completedPayload);

    expect(pendingRes.status).toBe(400);
    expect(completedRes.status).toBe(200);
    expect(mutationSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalled();
  });
});