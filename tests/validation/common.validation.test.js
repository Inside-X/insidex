import { expect, test } from '@jest/globals';

import {
  boundedSecondaryPayloadSchema,
  SECONDARY_PAYLOAD_MAX_BYTES,
  SECONDARY_PAYLOAD_MAX_KEYS,
} from '../../src/validation/schemas/common.schema.js';
import { analyticsSchemas } from '../../src/validation/schemas/analytics.schema.js';
import { ordersSchemas } from '../../src/validation/schemas/orders.schema.js';
import { paymentsSchemas } from '../../src/validation/schemas/payments.schema.js';

function buildLargeStringPayload() {
  return { content: 'x'.repeat(SECONDARY_PAYLOAD_MAX_BYTES + 256) };
}

test('bounded payload accepts small object', () => {
  const result = boundedSecondaryPayloadSchema.safeParse({ a: 1, b: 'ok' });
  expect(result.success).toBe(true);
});

test('bounded payload rejects too many keys', () => {
  const payload = Object.fromEntries(
    Array.from({ length: SECONDARY_PAYLOAD_MAX_KEYS + 1 }, (_, index) => [`k${index}`, index]),
  );

  const result = boundedSecondaryPayloadSchema.safeParse(payload);

  expect(result.success).toBe(false);
});

test('bounded payload rejects oversized object', () => {
  const result = boundedSecondaryPayloadSchema.safeParse(buildLargeStringPayload());
  expect(result.success).toBe(false);
});

test('analytics schema rejects oversized secondary payload', () => {
  const result = analyticsSchemas.track.safeParse({
    eventType: 'event',
    payload: buildLargeStringPayload(),
  });

  expect(result.success).toBe(false);
});

test('orders paymentWebhook schema rejects oversized payload', () => {
  const result = ordersSchemas.paymentWebhook.safeParse({
    provider: 'stripe',
    eventId: 'evt_1',
    stripePaymentIntentId: 'pi_1',
    payload: buildLargeStringPayload(),
  });

  expect(result.success).toBe(false);
});

test('paypal webhook schema rejects oversized payload', () => {
  const result = paymentsSchemas.paypalWebhook.safeParse({
    eventId: 'evt_paypal_1',
    orderId: '123e4567-e89b-12d3-a456-426614174000',
    metadata: {
      orderId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      idempotencyKey: 'idempotency-key-12345',
    },
    payload: buildLargeStringPayload(),
  });

  expect(result.success).toBe(false);
});