import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import paypal from '../../src/lib/paypal.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

describe('paypal webhook edge coverage', () => {
  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = 'id';
    process.env.PAYPAL_SECRET = 'secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH';
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('malformed json triggers paypal parse error handler', async () => {
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send('{"eventId":');

    expect(res.status).toBe(400);
  });

  test('payload too large is rejected by raw parser', async () => {
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send('x'.repeat(1024 * 1024 + 5));

    expect(res.status).toBe(413);
  });


  test('store is lazily created when absent', async () => {
    const payload = {
      eventId: 'evt_auto_store',
      orderId: '00000000-0000-0000-0000-000000000111',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000111',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem_ok_123456',
      },
      payload: { capture: { id: 'cap_auto_store', amount: '12.00', currency: 'EUR', status: 'COMPLETED' } },
    };

    const res = await request(app).post('/api/webhooks/paypal').send(payload);

    expect(res.status).toBe(200);
    expect(app.locals.webhookIdempotencyStore).toBeTruthy();
  });

  test('paypal route calls verifier with request headers', async () => {
    delete app.locals.webhookIdempotencyStore;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'SUCCESS' }) });

    const payload = {
      eventId: 'evt_real_verify',
      orderId: '00000000-0000-0000-0000-000000000111',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000111',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem_ok_123456',
      },
      payload: { capture: { id: 'cap_auto_store', amount: '12.00', currency: 'EUR', status: 'COMPLETED' } },
    };

    paypal.webhooks.verifyWebhookSignature.mockRestore();

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'tx-1')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert.example')
      .set('paypal-auth-algo', 'SHA256')
      .set('paypal-transmission-sig', 'sig-1')
      .send(payload);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});