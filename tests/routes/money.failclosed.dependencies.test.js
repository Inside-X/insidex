import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import stripe from '../../src/lib/stripe.js';
import paypal from '../../src/lib/paypal.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { logger } from '../../src/utils/logger.js';
import { setRateLimitRedisClient } from '../../src/middlewares/rateLimit.js';

function token(sub = '00000000-0000-0000-0000-000000000123') {
  return jwt.sign({ sub, role: 'customer' }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: process.env.JWT_ACCESS_ISSUER,
    audience: process.env.JWT_ACCESS_AUDIENCE,
    expiresIn: '5m',
  });
}

const stripePayload = {
  id: 'evt_dep_1',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_dep_1',
      status: 'succeeded',
      amount_received: 1200,
      currency: 'EUR',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000111',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem_dep_123456',
      },
    },
  },
};

const paypalPayload = {
  eventId: 'evt_dep_pp_1',
  orderId: '00000000-0000-0000-0000-000000000111',
  metadata: {
    orderId: '00000000-0000-0000-0000-000000000111',
    userId: '00000000-0000-0000-0000-000000000123',
    idempotencyKey: 'idem_dep_123456',
  },
  payload: {
    capture: {
      id: 'cap_dep_1',
      amount: '12.00',
      currency: 'EUR',
      status: 'COMPLETED',
    },
  },
};

describe('money routes fail-closed dependency behavior', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    delete app.locals.webhookIdempotencyStore;
    setRateLimitRedisClient({
      eval: jest.fn(async () => [1, 60_000]),
      ping: jest.fn(async () => 'PONG'),
    });
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    process.env.PAYPAL_CLIENT_ID = 'id';
    process.env.PAYPAL_SECRET = 'secret';
    process.env.PAYPAL_WEBHOOK_ID = 'wh';
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'false';

    jest.spyOn(orderRepository, 'findById').mockResolvedValue({
      id: stripePayload.data.object.metadata.orderId,
      totalAmount: '12.00',
      currency: 'EUR',
      status: 'pending',
    });
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
    delete app.locals.webhookIdempotencyRedisClient;
    process.env = { ...envSnapshot };
  });

  test('stripe fails closed with 503 before signature work when idempotency backend is unavailable in strict mode', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
    const constructSpy = jest.spyOn(stripe.webhooks, 'constructEvent');
    const logSpy = jest.spyOn(logger, 'error');

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(503);
    expect(constructSpy).not.toHaveBeenCalled();
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({ dependency: 'webhook_idempotency_backend' }));
  });

  test('paypal fails closed with 503 before verification when idempotency backend is unavailable in strict mode', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
    const verifySpy = jest.spyOn(paypal.webhooks, 'verifyWebhookSignature');

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalPayload);

    expect(res.status).toBe(503);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
  });

  test('payments/create-intent returns 503 on DB unavailability with no order mutation attempt', async () => {
    const dbError = new Error('db down');
    dbError.code = 'DB_OPERATION_FAILED';
    jest.spyOn(prisma.product, 'findMany').mockRejectedValueOnce(dbError);
    const createPendingSpy = jest.spyOn(orderRepository, 'createPendingPaymentOrder');

    const res = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        idempotencyKey: 'idem_dep_543210',
        email: 'dep@test.local',
        address: { line1: '1 rue', city: 'Paris', postalCode: '75001', country: 'FR' },
        currency: 'EUR',
        items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      });

    expect(res.status).toBe(503);
    expect(createPendingSpy).not.toHaveBeenCalled();
  });

  test('orders route returns 503 on DB transaction begin failure', async () => {
    const dbError = new Error('tx begin failed');
    dbError.code = 'DB_OPERATION_FAILED';
    jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock').mockRejectedValueOnce(dbError);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        idempotencyKey: 'idem_order_dep_12345',
        email: 'dep@test.local',
        address: { line1: '1 rue', city: 'Paris', postalCode: '75001', country: 'FR' },
        items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      });

    expect(res.status).toBe(503);
  });

  test('stripe SDK timeout maps to 503 and no repository mutation', async () => {
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    const timeout = new Error('stripe timeout');
    timeout.code = 'ETIMEDOUT';
    jest.spyOn(stripe.webhooks, 'constructEvent').mockImplementationOnce(() => { throw timeout; });

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(503);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('paypal verification timeout maps to 503 and no repository mutation', async () => {
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    const timeout = new Error('network timeout');
    timeout.code = 'ETIMEDOUT';
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockRejectedValueOnce(timeout);

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalPayload);

    expect(res.status).toBe(503);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
  });

  test('webhook handler crash remains 500 and no paid mutation', async () => {
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(orderRepository, 'findById').mockRejectedValueOnce(new Error('handler crash'));

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(500);
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });
});