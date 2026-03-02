import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import { orderRepository } from '../../src/repositories/order.repository.js';
import { logger } from '../../src/utils/logger.js';
import paypal from '../../src/lib/paypal.js';

const stripePayload = {
  id: 'evt_transition_guard_1',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_transition_guard_1',
      status: 'succeeded',
      amount_received: 1200,
      currency: 'EUR',
      metadata: {
        orderId: '00000000-0000-0000-0000-000000000111',
        userId: '00000000-0000-0000-0000-000000000123',
        idempotencyKey: 'idem_transition_guard_1',
      },
    },
  },
};

function paypalPayload() {
  return {
    eventId: 'paypal_transition_guard_1',
    orderId: '00000000-0000-0000-0000-000000000111',
    metadata: {
      orderId: '00000000-0000-0000-0000-000000000111',
      userId: '00000000-0000-0000-0000-000000000123',
      idempotencyKey: 'idem_transition_guard_1',
    },
    payload: {
      capture: {
        id: 'cap_transition_guard_1',
        amount: '12.00',
        currency: 'EUR',
        status: 'COMPLETED',
      },
    },
  };
}

describe('webhooks transition guard', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';
    process.env.PAYPAL_CLIENT_ID = 'id';
    process.env.PAYPAL_SECRET = 'secret';
    process.env.PAYPAL_WEBHOOK_ID = 'wh_id';
    app.locals.webhookIdempotencyStore = { claim: jest.fn().mockResolvedValue({ accepted: true }) };
    jest.spyOn(paypal.webhooks, 'verifyWebhookSignature').mockResolvedValue({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.webhookIdempotencyStore;
  });

  test('stripe invalid transition returns 409 and skips mutation', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({
      id: stripePayload.data.object.metadata.orderId,
      totalAmount: 12,
      currency: 'EUR',
      status: 'paid',
    });
    const mutateSpy = jest.spyOn(orderRepository, 'markPaidFromWebhook').mockResolvedValue({ replayed: false, orderMarkedPaid: true });

    const sig = createStripeSignatureHeader(stripePayload, process.env.PAYMENT_WEBHOOK_SECRET);
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('x-request-id', 'cid-transition-stripe-1')
      .set('stripe-signature', sig)
      .send(stripePayload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_INVALID_TRANSITION');
    expect(mutateSpy).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'order_transition_rejected',
      expect.objectContaining({
        orderId: stripePayload.data.object.metadata.orderId,
        from: 'paid',
        to: 'paid',
        provider: 'stripe',
        correlationId: 'cid-transition-stripe-1',
      })
    );
  });

  test('paypal invalid transition returns 409 and skips mutation', async () => {
    jest.spyOn(orderRepository, 'findById').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000111',
      totalAmount: 12,
      currency: 'EUR',
      status: 'cancelled',
    });
    jest.spyOn(orderRepository, 'processPaymentWebhookEvent').mockResolvedValue({ replayed: false, orderMarkedPaid: true });

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('x-request-id', 'cid-transition-paypal-1')
      .send(paypalPayload());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_INVALID_TRANSITION');
    expect(orderRepository.processPaymentWebhookEvent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'order_transition_rejected',
      expect.objectContaining({
        orderId: '00000000-0000-0000-0000-000000000111',
        from: 'cancelled',
        to: 'paid',
        provider: 'paypal',
        correlationId: 'cid-transition-paypal-1',
      })
    );
  });
});