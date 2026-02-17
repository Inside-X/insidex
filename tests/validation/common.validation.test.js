import { analyticsSchemas, ordersSchemas, paymentsSchemas, boundedSecondaryPayloadSchema } from '../../src/validation/schemas/index.js';
import { SECONDARY_PAYLOAD_MAX_BYTES, SECONDARY_PAYLOAD_MAX_KEYS } from '../../src/validation/schemas/common.schema.js';

describe('common zod payload bounds', () => {
  test('bounded secondary payload accepts small objects', () => {
    expect(boundedSecondaryPayloadSchema.parse({ source: 'test', nested: { a: 1 } })).toEqual({ source: 'test', nested: { a: 1 } });
  });

  test('bounded secondary payload rejects too many keys', () => {
    const payload = Object.fromEntries(Array.from({ length: SECONDARY_PAYLOAD_MAX_KEYS + 1 }, (_v, i) => [`k${i}`, i]));
    expect(boundedSecondaryPayloadSchema.safeParse(payload).success).toBe(false);
  });

  test('bounded secondary payload rejects oversized objects', () => {
    const payload = { big: 'x'.repeat(SECONDARY_PAYLOAD_MAX_BYTES) };
    expect(boundedSecondaryPayloadSchema.safeParse(payload).success).toBe(false);
  });

  test('analytics schema rejects oversized secondary payload', () => {
    const result = analyticsSchemas.track.safeParse({ eventType: 'checkout_started', payload: { big: 'x'.repeat(SECONDARY_PAYLOAD_MAX_BYTES) } });
    expect(result.success).toBe(false);
  });

  test('orders webhook schema rejects oversized payload', () => {
    const result = ordersSchemas.paymentWebhook.safeParse({
      provider: 'stripe',
      eventId: 'evt_123',
      stripePaymentIntentId: 'pi_123',
      payload: { big: 'x'.repeat(SECONDARY_PAYLOAD_MAX_BYTES) },
    });
    expect(result.success).toBe(false);
  });

  test('paypal webhook schema rejects oversized payload', () => {
    const result = paymentsSchemas.paypalWebhook.safeParse({
      eventId: 'evt_456',
      orderId: '123e4567-e89b-12d3-a456-426614174000',
      metadata: {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        idempotencyKey: 'idem_1234567890',
      },
      payload: { big: 'x'.repeat(SECONDARY_PAYLOAD_MAX_BYTES) },
    });
    expect(result.success).toBe(false);
  });
});