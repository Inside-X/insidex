import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import paypal from '../../src/lib/paypal.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function token(role = 'customer', sub = '00000000-0000-0000-0000-000000000123') {
  return jwt.sign({ sub, role }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: process.env.JWT_ACCESS_ISSUER,
    audience: process.env.JWT_ACCESS_AUDIENCE,
    expiresIn: '5m',
  });
}

const checkoutBase = {
  idempotencyKey: 'idem_guard_12345',
  email: 'test@insidex.local',
  address: { line1: '1 rue', city: 'Paris', postalCode: '75001', country: 'FR' },
  currency: 'EUR',
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
};

describe('monetary ingress guardrails', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('payments/create-intent rejects client unit price float and never hits DB', async () => {
    const findManySpy = jest.spyOn(prisma.product, 'findMany');

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        ...checkoutBase,
        items: [{ ...checkoutBase.items[0], price: 10.12345 }],
      });

    expect(res.status).toBe(400);
    expect(findManySpy).not.toHaveBeenCalled();
  });

  test('orders rejects monetary client fields and never hits repository', async () => {
    const createSpy = jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock');

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        ...checkoutBase,
        total: 1e2,
      });

    expect(res.status).toBe(400);
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('payments/create-intent accepts canonical payload without money fields', async () => {
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: checkoutBase.items[0].id, price: 12.34 }]);
    const orderSpy = jest.spyOn(orderRepository, 'createPendingPaymentOrder').mockResolvedValue({
      replayed: false,
      order: { id: '00000000-0000-0000-0000-000000000111', stripePaymentIntentId: 'pi_1' },
    });

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token()}`)
      .send(checkoutBase);

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(1234);
    expect(orderSpy).toHaveBeenCalledWith(expect.objectContaining({ expectedTotalAmountMinor: 1234 }));
  });

  test('paypal webhook rejects numeric amount before signature verification', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    const verifySpy = jest.spyOn(paypal.webhooks, 'verifyWebhookSignature');

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send({
        eventId: 'evt_paypal_guard_1',
        orderId: '00000000-0000-0000-0000-000000000111',
        metadata: {
          orderId: '00000000-0000-0000-0000-000000000111',
          userId: '00000000-0000-0000-0000-000000000123',
          idempotencyKey: 'idem_ok_123456',
        },
        payload: {
          capture: {
            amount: 10.12345,
            currency: 'EUR',
          },
        },
      });

    expect(res.status).toBe(400);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  test('paypal webhook rejects scientific notation amount string', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send({
        eventId: 'evt_paypal_guard_2',
        orderId: '00000000-0000-0000-0000-000000000111',
        metadata: {
          orderId: '00000000-0000-0000-0000-000000000111',
          userId: '00000000-0000-0000-0000-000000000123',
          idempotencyKey: 'idem_ok_123456',
        },
        payload: {
          capture: {
            amount: '1e2',
            currency: 'EUR',
          },
        },
      });

    expect(res.status).toBe(400);
  });
});