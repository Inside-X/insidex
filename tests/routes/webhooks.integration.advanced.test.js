import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { createWebhookIdempotencyStore } from '../../src/lib/webhook-idempotency-store.js';

function stripeEvent(overrides = {}) {
  return {
    id: overrides.id || 'evt_integration_1',
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
    ...overrides,
  };
}

describe('advanced webhook integration scenarios', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = createWebhookIdempotencyStore();
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('order lifecycle + retries + concurrent duplicate + cancel + expired timestamp', async () => {
    jest.spyOn(orderRepository, 'findById').mockImplementation(async () => ({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'pending' }));

    const first = stripeEvent({ id: 'evt_full_1' });
    const firstSig = createStripeSignatureHeader(first, process.env.PAYMENT_WEBHOOK_SECRET);
    const firstRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', firstSig).send(first);
    expect(firstRes.status).toBe(200);

    const retryRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', firstSig).send(first);
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.data.reason).toBe('replay_detected');

    const concurrentEvent = stripeEvent({ id: 'evt_full_2' });
    const concurrentSig = createStripeSignatureHeader(concurrentEvent, process.env.PAYMENT_WEBHOOK_SECRET);
    const [a, b] = await Promise.all([
      request(app).post('/api/webhooks/stripe').set('stripe-signature', concurrentSig).send(concurrentEvent),
      request(app).post('/api/webhooks/stripe').set('stripe-signature', concurrentSig).send(concurrentEvent),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);

    orderRepository.findById.mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'cancelled' });
    const afterCancel = stripeEvent({ id: 'evt_full_3' });
    const cancelSig = createStripeSignatureHeader(afterCancel, process.env.PAYMENT_WEBHOOK_SECRET);
    const cancelRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', cancelSig).send(afterCancel);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.reason).toBe('order_state_incompatible');

    const oldTs = Math.floor(Date.now() / 1000) - 301;
    const expiredEvent = stripeEvent({ id: 'evt_full_4' });
    const expiredSig = createStripeSignatureHeader(expiredEvent, process.env.PAYMENT_WEBHOOK_SECRET, oldTs);
    const expiredRes = await request(app).post('/api/webhooks/stripe').set('stripe-signature', expiredSig).send(expiredEvent);
    expect(expiredRes.status).toBe(400);
  });
});