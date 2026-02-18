import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function stripePayload(overrides = {}) {
  const base = {
    id: 'evt_stripe_branch_1',
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

describe('stripe webhook route branches', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('rejects unexpected payment intent status', async () => {
    const payload = stripePayload({ id: 'evt_bad_status', data: { object: { status: 'processing' } } });
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);
    expect(res.status).toBe(400);
  });

  test('propagates unexpected errors to error middleware', async () => {
    orderRepository.findById.mockRejectedValueOnce(new Error('db down'));
    const payload = stripePayload({ id: 'evt_db_error' });
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);
    expect(res.status).toBe(500);
  });
});