import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import paypal from '../../src/lib/paypal.js';

const baseStripe = {
  id: 'evt_payload_1',
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

describe('webhooks payload integrity', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: baseStripe.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('rejects malformed json', async () => {
    const raw = '{"id":';
    const sig = createStripeSignatureHeader(raw, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(400);
  });

  test('rejects too large payload', async () => {
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send('x'.repeat(1024 * 1024 + 2));
    expect(res.status).toBe(413);
  });

  test('rejects missing mandatory field', async () => {
    const invalid = { ...baseStripe, data: { object: { ...baseStripe.data.object, metadata: { ...baseStripe.data.object.metadata, orderId: undefined } } } };
    const sig = createStripeSignatureHeader(invalid, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(invalid);
    expect(res.status).toBe(400);
  });

  test('ignores amount mismatch', async () => {
    const payload = { ...baseStripe, id: 'evt_amount_mismatch', data: { object: { ...baseStripe.data.object, amount_received: 999 } } };
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('amount_mismatch');
  });

  test('ignores currency mismatch', async () => {
    const payload = { ...baseStripe, id: 'evt_currency_mismatch', data: { object: { ...baseStripe.data.object, currency: 'USD' } } };
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('currency_mismatch');
  });

  test('unknown event type is ignored', async () => {
    const payload = { ...baseStripe, id: 'evt_unknown', type: 'charge.pending' };
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('unsupported_event_type');
  });
});