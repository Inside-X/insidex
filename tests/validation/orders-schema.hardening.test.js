import { ordersSchemas } from '../../src/validation/schemas/orders.schema.js';

const validOrderPayload = {
  idempotencyKey: 'idem-orders-schema-12345',
  stripePaymentIntentId: 'pi_123456789',
  email: 'guest@insidex.test',
  fulfillment: {
    mode: 'delivery_local',
    delivery: {
      destination: {
        line1: '12 rue du Port',
        city: 'Mamoudzou',
        postalCode: '97600',
        country: 'FR',
      },
    },
  },
  items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
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

  test('create schema allows pickup_local without delivery destination data', () => {
    const result = ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-orders-schema-pickup',
      email: 'pickup@insidex.test',
      fulfillment: { mode: 'pickup_local' },
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    });

    expect(result.success).toBe(true);
  });

  test('create schema rejects delivery_local without destination truth', () => {
    const result = ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-orders-schema-delivery-missing-destination',
      email: 'delivery@insidex.test',
      fulfillment: { mode: 'delivery_local' },
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects pickup payload mixed into delivery_local mode', () => {
    const result = ordersSchemas.create.safeParse({
      ...validOrderPayload,
      fulfillment: {
        mode: 'delivery_local',
        pickup: { note: 'wrong mode payload' },
      },
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects delivery payload mixed into pickup_local mode', () => {
    const result = ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-orders-schema-pickup-mixed-delivery',
      email: 'pickup@insidex.test',
      fulfillment: {
        mode: 'pickup_local',
        delivery: {
          destination: {
            line1: '12 rue du Port',
            city: 'Mamoudzou',
            postalCode: '97600',
            country: 'FR',
          },
        },
      },
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects missing fulfillment selection (no silent canonical default)', () => {
    const result = ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-orders-schema-missing-fulfillment',
      email: 'pickup@insidex.test',
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });

  test('create schema rejects ambiguous delivery_local destination/address mismatch', () => {
    const result = ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-orders-schema-delivery-address-mismatch',
      email: 'delivery@insidex.test',
      address: {
        line1: '12 rue du Port',
        city: 'Mamoudzou',
        postalCode: '97600',
        country: 'FR',
      },
      fulfillment: {
        mode: 'delivery_local',
        delivery: {
          destination: {
            line1: '99 avenue mismatch',
            city: 'Mamoudzou',
            postalCode: '97600',
            country: 'FR',
          },
        },
      },
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });

  test('create schema accepts delivery_local when address compatibility payload matches destination exactly', () => {
    const destination = {
      line1: '12 rue du Port',
      city: 'Mamoudzou',
      postalCode: '97600',
      country: 'FR',
    };

    const result = ordersSchemas.create.safeParse({
      idempotencyKey: 'idem-orders-schema-delivery-address-equivalent',
      email: 'delivery@insidex.test',
      address: destination,
      fulfillment: {
        mode: 'delivery_local',
        delivery: { destination },
      },
      items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    });

    expect(result.success).toBe(true);
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

  test('readiness schema accepts allowed readiness targets and optional note', () => {
    const payload = {
      target: 'ready_for_pickup',
      note: 'Prepared for front desk handoff',
    };

    expect(ordersSchemas.markReadiness.parse(payload)).toEqual(payload);
  });

  test('readiness schema rejects unknown targets and unknown fields', () => {
    expect(ordersSchemas.markReadiness.safeParse({
      target: 'shipped',
    }).success).toBe(false);

    expect(ordersSchemas.markReadiness.safeParse({
      target: 'ready_for_local_delivery',
      extra: true,
    }).success).toBe(false);
  });

  test('completion schema accepts allowed completion targets and optional note', () => {
    const payload = {
      target: 'collected',
      note: 'Handoff verified',
    };

    expect(ordersSchemas.markCompletion.parse(payload)).toEqual(payload);
  });

  test('completion schema rejects unknown targets and unknown fields', () => {
    expect(ordersSchemas.markCompletion.safeParse({
      target: 'shipped',
    }).success).toBe(false);

    expect(ordersSchemas.markCompletion.safeParse({
      target: 'delivered_local',
      extra: true,
    }).success).toBe(false);
  });
});
