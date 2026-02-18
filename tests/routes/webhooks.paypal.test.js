import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import paypal from '../../src/lib/paypal.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function paypalPayload(overrides = {}) {
  return {
    eventId: 'evt_paypal_1',
    orderId: '00000000-0000-0000-0000-000000000111',
    metadata: {
      orderId: '00000000-0000-0000-0000-000000000111',
      userId: '00000000-0000-0000-0000-000000000123',
      idempotencyKey: 'idem_ok_123456',
    },
    payload: { capture: { amount: '12.00', currency: 'EUR', status: 'COMPLETED' } },
    ...overrides,
  };
}

describe('paypal webhook route branches', () => {
  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = 'id';
    process.env.PAYPAL_SECRET = 'secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'pending' });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('rejects metadata order mismatch', async () => {
    const payload = paypalPayload({ metadata: { orderId: '00000000-0000-0000-0000-000000000112', userId: '00000000-0000-0000-0000-000000000123', idempotencyKey: 'idem_ok_123456' } });
    const res = await request(app).post('/api/webhooks/paypal').send(payload);
    expect(res.status).toBe(400);
  });

  test('ignores order not found', async () => {
    orderRepository.findById.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_not_found' }));
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order_not_found');
  });

  test('ignores incompatible order state', async () => {
    orderRepository.findById.mockResolvedValueOnce({ id: '00000000-0000-0000-0000-000000000111', totalAmount: 12, currency: 'EUR', status: 'cancelled' });
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_state' }));
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order_state_incompatible');
  });

  test('ignores amount mismatch', async () => {
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_amount', payload: { capture: { amount: '11.00', currency: 'EUR', status: 'COMPLETED' } } }));
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('amount_mismatch');
  });

  test('ignores currency mismatch', async () => {
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_currency', payload: { capture: { amount: '12.00', currency: 'USD', status: 'COMPLETED' } } }));
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('currency_mismatch');
  });

  test('rejects unexpected capture status', async () => {
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_status', payload: { capture: { amount: '12.00', currency: 'EUR', status: 'PENDING' } } }));
    expect(res.status).toBe(400);
  });

  test('replay idempotency response', async () => {
    app.locals.webhookIdempotencyStore.claim.mockResolvedValueOnce({ accepted: false, reason: 'replay' });
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_replay' }));
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('replay_detected');
  });

  test('invalid event id response', async () => {
    app.locals.webhookIdempotencyStore.claim.mockResolvedValueOnce({ accepted: false, reason: 'invalid_event_id' });
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_badid' }));
    expect(res.status).toBe(400);
  });

  test('signature failure', async () => {
    paypal.webhooks.verifyWebhookSignature.mockResolvedValueOnce({ verified: false, verificationStatus: 'FAILURE', reason: 'FAILURE' });
    const res = await request(app).post('/api/webhooks/paypal').send(paypalPayload({ eventId: 'evt_paypal_sigfail' }));
    expect(res.status).toBe(400);
  });

  test('non-buffer body parse error is mapped', async () => {
    const res = await request(app).post('/api/webhooks/paypal').set('Content-Type', 'text/plain').send('not-json');
    expect(res.status).toBe(400);
  });
});