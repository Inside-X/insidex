import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import paypal from '../../src/lib/paypal.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { createWebhookIdempotencyStore } from '../../src/lib/webhook-idempotency-store.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { logger } from '../../src/utils/logger.js';

function stripeEvent(overrides = {}) {
  const base = {
    id: 'evt_anomaly_stripe_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_anomaly_1',
        status: 'succeeded',
        amount_received: 1200,
        currency: 'EUR',
        metadata: {
          orderId: '00000000-0000-0000-0000-000000000111',
          userId: '00000000-0000-0000-0000-000000000123',
          idempotencyKey: 'idem_anomaly_123456',
        },
      },
    },
  };

  return {
    ...base,
    ...overrides,
    data: {
      ...base.data,
      ...(overrides.data || {}),
      object: {
        ...base.data.object,
        ...(overrides.data?.object || {}),
        metadata: {
          ...base.data.object.metadata,
          ...(overrides.data?.object?.metadata || {}),
        },
      },
    },
  };
}

function paypalEvent(overrides = {}) {
  const base = {
    eventId: 'evt_anomaly_paypal_1',
    orderId: '00000000-0000-0000-0000-000000000111',
    metadata: {
      orderId: '00000000-0000-0000-0000-000000000111',
      userId: '00000000-0000-0000-0000-000000000123',
      idempotencyKey: 'idem_anomaly_123456',
    },
    payload: {
      capture: {
        id: 'cap_anomaly_1',
        amount: '12.00',
        currency: 'EUR',
        status: 'COMPLETED',
      },
    },
  };

  return {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata || {}),
    },
    payload: {
      ...base.payload,
      ...(overrides.payload || {}),
      capture: {
        ...base.payload.capture,
        ...(overrides.payload?.capture || {}),
      },
    },
  };
}

describe('payment provider anomaly audit', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    process.env.PAYPAL_CLIENT_ID = 'id';
    process.env.PAYPAL_SECRET = 'secret';
    process.env.PAYPAL_WEBHOOK_ID = 'wh';

    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };

    jest.spyOn(orderRepository, 'findById').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000111',
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
  });

  test('stripe: missing signature header is fail-closed with no repository mutation', async () => {
    const res = await request(app).post('/api/webhooks/stripe').send(stripeEvent());

    expect(res.status).toBe(400);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('stripe: timestamp outside tolerance is fail-closed with no repository mutation', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const payload = stripeEvent({ id: 'evt_old_ts' });
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET, oldTimestamp);

    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);

    expect(res.status).toBe(400);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('stripe: float/scientific anomalies are rejected before repository mutation', async () => {
    const floatPayload = stripeEvent({ id: 'evt_float', data: { object: { amount_received: 12.5 } } });
    const floatSig = createStripeSignatureHeader(floatPayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const scientificPayload = stripeEvent({ id: 'evt_scientific', data: { object: { amount_received: '1e3' } } });
    const scientificSig = createStripeSignatureHeader(scientificPayload, process.env.PAYMENT_WEBHOOK_SECRET);

    const floatRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', floatSig).send(floatPayload);
    const scientificRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', scientificSig).send(scientificPayload);

    expect(floatRes.status).toBe(400);
    expect(scientificRes.status).toBe(400);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('stripe: malformed and oversized payloads are rejected with no mutation', async () => {
    const raw = '{"id":';
    const sig = createStripeSignatureHeader(raw, process.env.PAYMENT_WEBHOOK_SECRET);
    const malformed = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).set('Content-Type', 'application/json').send(raw);

    const oversized = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 't=1,v1=abc')
      .set('Content-Type', 'application/json')
      .send('x'.repeat(1024 * 1024 + 10));

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('stripe: out-of-order and mismatch anomalies do not mutate and log reason code', async () => {
    const errSpy = jest.spyOn(logger, 'error');
    const unsupported = stripeEvent({ id: 'evt_out_of_order', type: 'payment_intent.processing' });
    const unsupportedSig = createStripeSignatureHeader(unsupported, process.env.PAYMENT_WEBHOOK_SECRET);

    const mismatch = stripeEvent({ id: 'evt_currency_mismatch_audit', data: { object: { currency: 'USD' } } });
    const mismatchSig = createStripeSignatureHeader(mismatch, process.env.PAYMENT_WEBHOOK_SECRET);

    const outOfOrder = await request(app).post('/api/webhooks/stripe').set('stripe-signature', unsupportedSig).send(unsupported);
    const mismatchRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', mismatchSig).send(mismatch);

    expect(outOfOrder.status).toBe(200);
    expect(outOfOrder.body.data.reason).toBe('unsupported_event_type');
    expect(mismatchRes.status).toBe(200);
    expect(mismatchRes.body.data.reason).toBe('currency_mismatch');
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('webhook_currency_mismatch', expect.objectContaining({ reason: 'currency_mismatch' }));
  });

  test('stripe: duplicate/concurrent replay processes at most once and logs reason code', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();
    const payload = stripeEvent({ id: 'evt_concurrent_replay' });
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);

    const [a, b] = await Promise.all([
      request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload),
      request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('webhook_replay_detected', expect.objectContaining({ reason: 'replay' }));
  });

  test('stripe: succeeded event with missing resource id is rejected with no mutation', async () => {
    const payload = stripeEvent({ id: 'evt_missing_pi', data: { object: { id: '' } } });
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);

    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);

    expect(res.status).toBe(400);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('paypal: missing verification headers fails closed with no repository mutation', async () => {
    paypal.webhooks.verifyWebhookSignature.mockResolvedValueOnce({ verified: false, verificationStatus: 'MISSING_HEADERS', reason: 'missing_verification_headers' });

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('content-type', 'application/json')
      .send(paypalEvent({ eventId: 'evt_pp_missing_headers' }));

    expect(res.status).toBe(400);
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
  });

  test('paypal: float/scientific anomalies are rejected before verification/mutation', async () => {
    const verifySpy = jest.spyOn(paypal.webhooks, 'verifyWebhookSignature');

    const floatRes = await request(app)
      .post('/api/webhooks/paypal')
      .set('content-type', 'application/json')
      .send(paypalEvent({ eventId: 'evt_pp_float', payload: { capture: { amount: 10.5 } } }));

    const sciRes = await request(app)
      .post('/api/webhooks/paypal')
      .set('content-type', 'application/json')
      .send(paypalEvent({ eventId: 'evt_pp_scientific', payload: { capture: { amount: '1e3' } } }));

    expect(floatRes.status).toBe(400);
    expect(sciRes.status).toBe(400);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
  });

  test('paypal: malformed/oversized payload is rejected with no mutation', async () => {
    const malformed = await request(app)
      .post('/api/webhooks/paypal')
      .set('content-type', 'application/json')
      .send('{"eventId":');

    const oversized = await request(app)
      .post('/api/webhooks/paypal')
      .set('content-type', 'application/json')
      .send('x'.repeat(1024 * 1024 + 20));

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
  });

  test('paypal: out-of-order and mismatch anomalies do not mutate and include reason', async () => {
    const errSpy = jest.spyOn(logger, 'error');
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });

    const pendingRes = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx1')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalEvent({ eventId: 'evt_pp_pending', payload: { capture: { status: 'PENDING' } } }));

    const currencyRes = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx2')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalEvent({ eventId: 'evt_pp_currency', payload: { capture: { currency: 'USD' } } }));

    expect(pendingRes.status).toBe(400);
    expect(currencyRes.status).toBe(200);
    expect(currencyRes.body.data.reason).toBe('currency_mismatch');
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('webhook_currency_mismatch', expect.objectContaining({ reason: 'currency_mismatch' }));
  });

  test('paypal: succeeded event with missing resource id fails closed with no mutation', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx3')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send(paypalEvent({
        eventId: 'evt_pp_missing_resource',
        payload: {
          capture: {
            id: undefined,
            status: 'COMPLETED',
            amount: '12.00',
            currency: 'EUR',
          },
          resource: {},
        },
      }));

    expect(res.status).toBe(400);
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('paypal_webhook_missing_resource_id', expect.objectContaining({ reason: 'missing_resource_id' }));
  });

  test('paypal: duplicate/concurrent replay processes at most once and logs reason code', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();

    const payload = paypalEvent({ eventId: 'evt_pp_replay_concurrent' });

    const [a, b] = await Promise.all([
      request(app)
        .post('/api/webhooks/paypal')
        .set('paypal-transmission-id', 'tx4')
        .set('paypal-transmission-time', new Date().toISOString())
        .set('paypal-cert-url', 'https://cert.example')
        .set('paypal-auth-algo', 'SHA256')
        .set('paypal-transmission-sig', 'sig')
        .send(payload),
      request(app)
        .post('/api/webhooks/paypal')
        .set('paypal-transmission-id', 'tx4')
        .set('paypal-transmission-time', new Date().toISOString())
        .set('paypal-cert-url', 'https://cert.example')
        .set('paypal-auth-algo', 'SHA256')
        .set('paypal-transmission-sig', 'sig')
        .send(payload),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(orderRepository.processPaymentWebhookEvent).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('webhook_replay_detected', expect.objectContaining({ reason: 'replay' }));
  });
});