import { ordersSchemas } from '../../src/validation/schemas/orders.schema.js';

const validOrderPayload = {
  idempotencyKey: 'idem-orders-schema-12345',
  stripePaymentIntentId: 'pi_123456789',
  email: 'guest@insidex.test',
  address: {
    line1: '12 rue du Port',
    city: 'Mamoudzou',
    postalCode: '97600',
    country: 'FR',
  },
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1, price: 9.9 }],
};

describe('orders schema hardening', () => {
  test('create schema accepts valid payload', () => {
    expect(ordersSchemas.create.parse(validOrderPayload)).toEqual(validOrderPayload);
  });

  test('create schema rejects payload with invalid field types', () => {
    const result = ordersSchemas.create.safeParse({
      ...validOrderPayload,
      idempotencyKey: 12345,
      items: [{ ...validOrderPayload.items[0], quantity: '1' }],
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects unknown fields in strict mode', () => {
    const result = ordersSchemas.create.safeParse({
      ...validOrderPayload,
      unknownField: true,
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects client-provided userId', () => {
    const result = ordersSchemas.create.safeParse({
      ...validOrderPayload,
      userId: '00000000-0000-0000-0000-000000000123',
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects missing idempotencyKey', () => {
    const { idempotencyKey, ...payloadWithoutKey } = validOrderPayload;
    const result = ordersSchemas.create.safeParse(payloadWithoutKey);

    expect(idempotencyKey).toBeDefined();
    expect(result.success).toBe(false);
  });

  test('payment webhook schema accepts orderId-based payload', () => {
    const payload = {
      provider: 'stripe',
      eventId: 'evt_123',
      orderId: '00000000-0000-0000-0000-000000000777',
    };

    expect(ordersSchemas.paymentWebhook.parse(payload)).toEqual(payload);
  });

  test('payment webhook schema accepts stripePaymentIntentId-based payload', () => {
    const payload = {
      provider: 'stripe',
      eventId: 'evt_456',
      stripePaymentIntentId: 'pi_456',
      payload: { raw: true },
    };

    expect(ordersSchemas.paymentWebhook.parse(payload)).toEqual(payload);
  });

  test('payment webhook schema rejects when both orderId and stripePaymentIntentId are missing', () => {
    const result = ordersSchemas.paymentWebhook.safeParse({
      provider: 'paypal',
      eventId: 'evt_missing_refs',
    });

    expect(result.success).toBe(false);
  });

  test('payment webhook schema rejects unknown field in strict mode', () => {
    const result = ordersSchemas.paymentWebhook.safeParse({
      provider: 'paypal',
      eventId: 'evt_unknown',
      orderId: '00000000-0000-0000-0000-000000000777',
      extra: 'nope',
    });

    expect(result.success).toBe(false);
  });

  test('byId params schema accepts valid UUID and rejects unknown field', () => {
    expect(ordersSchemas.byIdParams.parse({ id: '00000000-0000-0000-0000-000000000777' }).id)
      .toBe('00000000-0000-0000-0000-000000000777');

    expect(ordersSchemas.byIdParams.safeParse({
      id: '00000000-0000-0000-0000-000000000777',
      extra: true,
    }).success).toBe(false);
  });
});