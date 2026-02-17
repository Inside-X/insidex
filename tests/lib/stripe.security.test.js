import { createStripeSignatureHeader } from '../helpers/stripe-signature.js';
import stripe from '../../src/lib/stripe.js';

describe('stripe webhook security', () => {
  const secret = 'whsec_test_secret';
  const basePayload = {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_1',
        status: 'succeeded',
        amount_received: 1200,
        currency: 'eur',
        metadata: {
          orderId: '00000000-0000-0000-0000-000000000001',
          userId: '00000000-0000-0000-0000-000000000002',
          idempotencyKey: 'idem_1234567890',
        },
      },
    },
  };

  test('accepts valid signature', () => {
    const raw = Buffer.from(JSON.stringify(basePayload), 'utf8');
    const sig = createStripeSignatureHeader(basePayload, secret);

    const event = stripe.webhooks.constructEvent(raw, sig, secret);
    expect(event.id).toBe('evt_1');
  });

  test('rejects invalid signature', () => {
    const raw = Buffer.from(JSON.stringify(basePayload), 'utf8');
    const sig = createStripeSignatureHeader(basePayload, 'another-secret');
    expect(() => stripe.webhooks.constructEvent(raw, sig, secret)).toThrow(/signature/i);
  });

  test('rejects missing signature header', () => {
    const raw = Buffer.from(JSON.stringify(basePayload), 'utf8');
    expect(() => stripe.webhooks.constructEvent(raw, '', secret)).toThrow(/missing stripe-signature header/i);
  });

  test('rejects expired timestamp', () => {
    const raw = Buffer.from(JSON.stringify(basePayload), 'utf8');
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const sig = createStripeSignatureHeader(basePayload, secret, oldTimestamp);
    expect(() => stripe.webhooks.constructEvent(raw, sig, secret)).toThrow(/outside tolerance/i);
  });

  test('rejects malformed payload', () => {
    const raw = Buffer.from('{"broken":', 'utf8');
    const sig = createStripeSignatureHeader('{"broken":', secret);
    expect(() => stripe.webhooks.constructEvent(raw, sig, secret)).toThrow(/malformed webhook payload/i);
  });

  test('passes unsupported event type through signature construction for route-level filtering', () => {
    const payload = { ...basePayload, type: 'charge.pending' };
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const sig = createStripeSignatureHeader(payload, secret);
    const event = stripe.webhooks.constructEvent(raw, sig, secret);
    expect(event.type).toBe('charge.pending');
  });
});