import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

const stripePayload = {
  id: 'evt_sig_ok',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_1',
      status: 'succeeded',
      amount_received: 1200,
      currency: 'EUR',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000111',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem_ok_123456',
      },
    },
  },
};

describe('webhooks signature security', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: stripePayload.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('accepts valid stripe signature', async () => {
    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);
    expect(res.status).toBe(200);
  });

  test('rejects invalid stripe signature', async () => {
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'invalid').send(stripePayload);
    expect(res.status).toBe(400);
  });

  test('rejects missing stripe header', async () => {
    const res = await request(app).post('/api/webhooks/stripe').send(stripePayload);
    expect(res.status).toBe(400);
  });

  test('rejects expired stripe timestamp', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET, oldTimestamp);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);
    expect(res.status).toBe(400);
  });

  test('rejects when secret is absent', async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const sig = createStripeSignatureHeader(stripePayload, 'another-secret');
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);
    expect(res.status).toBe(400);
  });
});