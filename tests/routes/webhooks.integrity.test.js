import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import paypal from '../../src/lib/paypal.js';

const stripePayload = {
  id: 'evt_ok',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_1',
      status: 'succeeded',
      amount_received: 1200,
      currency: 'eur',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000111',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem_ok_123456',
      },
    },
  },
};

describe('webhooks integrity', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('event success', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: stripePayload.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(stripePayload);
    expect(res.status).toBe(200);
  });

  test('event type inconnu ignored', async () => {
    const payload = { ...stripePayload, type: 'payment_intent.processing' };
    const sig = createStripeSignatureHeader(payload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', sig).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.ignored).toBe(true);
  });

  test('paypal replay response passthrough', async () => {
    process.env.PAYPAL_CLIENT_ID = 'id';
    process.env.PAYPAL_SECRET = 'secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH';

    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: stripePayload.data.object.metadata.orderId, totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: true, orderMarkedPaid: false });

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig')
      .send({
        eventId: 'evt_pp',
        orderId: stripePayload.data.object.metadata.orderId,
        metadata: stripePayload.data.object.metadata,
        payload: { capture: { amount: '12.00', currency: 'EUR', status: 'COMPLETED' } },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.replayed).toBe(true);
  });
});