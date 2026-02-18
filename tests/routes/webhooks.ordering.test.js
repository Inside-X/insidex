import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

const stripePayload = {
  id: 'evt_ordering_1',
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

describe('webhooks event ordering guards', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('event before order creation is ignored', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue(null);

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order_not_found');
  });

  test('event after cancellation is ignored', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: stripePayload.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'cancelled' });

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order_state_incompatible');
  });

  test('event during update/inconsistent state is ignored', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: stripePayload.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'processing' });

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order_state_incompatible');
  });

  test('already paid status is ignored', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: stripePayload.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'paid' });

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);

    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order_state_incompatible');
  });
});