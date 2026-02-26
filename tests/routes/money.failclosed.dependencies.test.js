import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import webhooksRouter from '../../src/routes/webhooks.routes.js';
import prisma from '../../src/lib/prisma.js';
import stripe from '../../src/lib/stripe.js';
import paypal from '../../src/lib/paypal.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { logger } from '../../src/utils/logger.js';
import { apiRateLimiter, setRateLimitRedisClient } from '../../src/middlewares/rateLimit.js';
import requestContext from '../../src/middlewares/requestContext.js';
import requestLogger from '../../src/middlewares/requestLogger.js';
import errorHandler from '../../src/middlewares/error-handler.js';
import { webhookStrictDependencyGuard } from '../../src/middlewares/webhookStrictDependencyGuard.js';

const GUARDED_BODY_FIELDS = ['body', 'rawBody', 'raw'];

function withRequestBodyAccessTrap() {
  const streamOnSpy = jest.fn();
  const streamReadSpy = jest.fn();
  const trappedApp = express();
  trappedApp.use((req, _res, next) => {
    for (const field of GUARDED_BODY_FIELDS) {
      Object.defineProperty(req, field, {
        configurable: true,
        enumerable: false,
        get() {
          throw new Error(`req.${field} must not be touched`);
        },
      });
    }

    const originalOn = req.on.bind(req);
    req.on = (...args) => {
      streamOnSpy(args[0]);
      if (args[0] === 'data' || args[0] === 'readable') {
        throw new Error('request stream must not be read');
      }
      return originalOn(...args);
    };

    const originalRead = req.read?.bind(req);
    req.read = (...args) => {
      streamReadSpy();
      if (originalRead) return originalRead(...args);
      return null;
    };

    next();
  });
  trappedApp.use(requestContext);
  trappedApp.use(requestLogger);
  trappedApp.use('/api/webhooks/stripe', webhookStrictDependencyGuard);
  trappedApp.use('/api/webhooks/paypal', webhookStrictDependencyGuard);
  trappedApp.use('/api', apiRateLimiter);
  trappedApp.use('/api/webhooks', webhooksRouter);
  trappedApp.use(errorHandler);
  return { trappedApp, streamOnSpy, streamReadSpy };
}

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

  test('route modules import without dependency guard resolution errors', async () => {
    await expect(import('../../src/routes/orders.routes.js')).resolves.toBeTruthy();
    await expect(import('../../src/routes/payments.routes.js')).resolves.toBeTruthy();
    await expect(import('../../src/routes/webhooks.routes.js')).resolves.toBeTruthy();
    await expect(import('../../src/middlewares/webhookStrictDependencyGuard.js')).resolves.toBeTruthy();
  });

  beforeEach(() => {
    delete app.locals.webhookIdempotencyStore;
    delete app.locals.webhookIdempotencyRedisClient;

    setRateLimitRedisClient({
      eval: jest.fn(async () => [1, 60_000]),
      ping: jest.fn(async () => 'PONG'),
      set: jest.fn(async () => 'OK'),
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
    jest.spyOn(prisma.order, 'create');
    jest.spyOn(prisma.order, 'update');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
    delete app.locals.webhookIdempotencyRedisClient;
    process.env = { ...envSnapshot };
  });

  test('A) strict mode + redis unavailable returns 503 before verify/signature and no rawBody access', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
    setRateLimitRedisClient({
      eval: jest.fn(async () => [1, 60_000]),
      ping: jest.fn(async () => 'PONG'),
    });
    const constructSpy = jest.spyOn(stripe.webhooks, 'constructEvent');
    const { trappedApp, streamOnSpy } = withRequestBodyAccessTrap();

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(trappedApp).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(503);
    expect(constructSpy).not.toHaveBeenCalled();
    expect(streamOnSpy).not.toHaveBeenCalledWith('data');
    expect(streamOnSpy).not.toHaveBeenCalledWith('readable');
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });


  test('A2) strict mode + redis unavailable blocks paypal verify before body/stream access', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
    setRateLimitRedisClient({
      eval: jest.fn(async () => [1, 60_000]),
      ping: jest.fn(async () => 'PONG'),
    });

    const paypalVerifySpy = jest.spyOn(paypal.webhooks, 'verifyWebhookSignature');
    const { trappedApp, streamOnSpy } = withRequestBodyAccessTrap();

    const res = await request(trappedApp)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalPayload);

    expect(res.status).toBe(503);
    expect(paypalVerifySpy).not.toHaveBeenCalled();
    expect(streamOnSpy).not.toHaveBeenCalledWith('data');
    expect(streamOnSpy).not.toHaveBeenCalledWith('readable');
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  test('B) DB unavailable blocks /api/payments/create-intent and /api/orders before mutation', async () => {
    const dbError = new Error('db down');
    dbError.code = 'DB_OPERATION_FAILED';
    jest.spyOn(prisma, '$transaction').mockRejectedValue(dbError);

    const createPendingSpy = jest.spyOn(orderRepository, 'createPendingPaymentOrder');
    const createOrderSpy = jest.spyOn(orderRepository, 'createIdempotentWithItemsAndUpdateStock');

    const paymentRes = await request(app)
      .post('/api/payments/create-intent')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        idempotencyKey: 'idem_dep_543210',
        email: 'dep@test.local',
        address: { line1: '1 rue', city: 'Paris', postalCode: '75001', country: 'FR' },
        currency: 'EUR',
        items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      });

    const ordersRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        idempotencyKey: 'idem_order_dep_12345',
        email: 'dep@test.local',
        address: { line1: '1 rue', city: 'Paris', postalCode: '75001', country: 'FR' },
        items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
      });

    expect(paymentRes.status).toBe(503);
    expect(ordersRes.status).toBe(503);
    expect(createPendingSpy).not.toHaveBeenCalled();
    expect(createOrderSpy).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  test('C) provider timeout returns 503 with no repository mutation', async () => {
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };

    const stripeTimeout = new Error('stripe timeout');
    stripeTimeout.code = 'ETIMEDOUT';
    jest.spyOn(stripe.webhooks, 'constructEvent').mockImplementationOnce(() => { throw stripeTimeout; })

    const stripeSig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const stripeRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', stripeSig).send(stripePayload);

    const paypalTimeout = new Error('paypal timeout');
    paypalTimeout.code = 'ETIMEDOUT';
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockRejectedValueOnce(paypalTimeout);

    const paypalRes = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalPayload);

    expect(stripeRes.status).toBe(503);
    expect(paypalRes.status).toBe(503);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
  });

  test('D) webhook crash mapping is deterministic and does not mutate', async () => {
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };

    const dependencyCrash = new Error('db reset');
    dependencyCrash.code = 'ECONNRESET';
    jest.spyOn(orderRepository, 'findById').mockRejectedValueOnce(dependencyCrash);

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const dependencyRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    jest.spyOn(orderRepository, 'findById').mockRejectedValueOnce(new Error('logic crash'));
    const nonDependencyRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(dependencyRes.status).toBe(503);
    expect(nonDependencyRes.status).toBe(500);
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('logs reason codes on dependency failures', async () => {
    process.env.WEBHOOK_IDEMPOTENCY_STRICT = 'true';
    setRateLimitRedisClient({
      eval: jest.fn(async () => [1, 60_000]),
      ping: jest.fn(async () => 'PONG'),
    });
    const logSpy = jest.spyOn(logger, 'error');

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalPayload);

    expect(logSpy).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({
      endpoint: 'POST /api/webhooks/stripe',
      reasonCode: 'redis_unavailable',
    }));
    expect(logSpy).toHaveBeenCalledWith('critical_dependency_unavailable', expect.objectContaining({
      endpoint: 'POST /api/webhooks/paypal',
      reasonCode: 'redis_unavailable',
    }));
  });
});