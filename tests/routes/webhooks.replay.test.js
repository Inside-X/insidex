import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { createWebhookIdempotencyStore } from '../../src/lib/webhook-idempotency-store.js';

function payload(id = 'evt_replay_1') {
  return {
    id,
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
}

describe('webhooks replay protection', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('first event is processed', async () => {
    const event = payload('evt_replay_first');
    const sig = createStripeSignatureHeader(event, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(event);

    expect(res.status).toBe(200);
    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledTimes(1);
  });

  test('second event with same id is ignored', async () => {
    const event = payload('evt_replay_dupe');
    const sig = createStripeSignatureHeader(event, process.env.PAYMENT_WEBHOOK_SECRET);

    await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(event);
    const second = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(event);

    expect(second.status).toBe(200);
    expect(second.body.data.ignored).toBe(true);
    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledTimes(1);
  });

  test('null event id is rejected', async () => {
    const event = payload('');
    const sig = createStripeSignatureHeader(event, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(event);

    expect(res.status).toBe(400);
  });

  test('double concurrent webhook only processes once', async () => {
    const event = payload('evt_replay_concurrent');
    const sig = createStripeSignatureHeader(event, process.env.PAYMENT_WEBHOOK_SECRET);

    const [a, b] = await Promise.all([
      request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(event),
      request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(event),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledTimes(1);
  });
});