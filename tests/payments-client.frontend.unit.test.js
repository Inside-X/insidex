import { jest } from '@jest/globals';
import { createPaymentIntent } from '../js/modules/paymentsClient.js';

function makeResponse({ ok, status, body, headers = {} }) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        return headers[key] || null;
      },
    },
    json: async () => body,
  };
}

describe('payments client adapter', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sends only items{id,quantity} and body idempotencyKey', async () => {
    fetch.mockResolvedValue(makeResponse({
      ok: true,
      status: 200,
      body: { data: { paymentIntentId: 'pi_1' } },
    }));

    await createPaymentIntent({
      idempotencyKey: 'idem_1234567890',
      items: [
        { id: 'prod-1', quantity: 2, price: 9999, name: 'forbidden-client-fields' },
      ],
    });

    const [, request] = fetch.mock.calls[0];
    const parsedBody = JSON.parse(request.body);

    expect(parsedBody).toEqual({
      items: [{ id: 'prod-1', quantity: 2 }],
      idempotencyKey: 'idem_1234567890',
    });
    expect(parsedBody.items[0].price).toBeUndefined();
    expect(parsedBody.items[0].name).toBeUndefined();
  });

  test('maps 400 to validation_error', async () => {
    fetch.mockResolvedValue(makeResponse({
      ok: false,
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', requestId: 'req-400' } },
      headers: { 'x-correlation-id': 'corr-400' },
    }));

    await expect(createPaymentIntent({ idempotencyKey: 'idem_1234567890', items: [] })).rejects.toEqual({
      code: 'validation_error',
      status: 400,
      correlationId: 'corr-400',
    });
  });

  test('maps 409 to invalid_transition', async () => {
    fetch.mockResolvedValue(makeResponse({
      ok: false,
      status: 409,
      body: { error: { code: 'ORDER_INVALID_TRANSITION', requestId: 'req-409' } },
    }));

    await expect(createPaymentIntent({ idempotencyKey: 'idem_1234567890', items: [] })).rejects.toEqual({
      code: 'invalid_transition',
      status: 409,
      correlationId: 'req-409',
    });
  });


  test('maps 503 payments_disabled to maintenance code', async () => {
    fetch.mockResolvedValue(makeResponse({
      ok: false,
      status: 503,
      body: { error: { code: 'payments_disabled' } },
      headers: { 'x-request-id': 'req-maint-503' },
    }));

    await expect(createPaymentIntent({ idempotencyKey: 'idem_1234567890', items: [] })).rejects.toEqual({
      code: 'payments_disabled',
      status: 503,
      correlationId: 'req-maint-503',
    });
  });
  
  test('maps 503 to dependency_unavailable with reasonCode when present', async () => {
    fetch.mockResolvedValue(makeResponse({
      ok: false,
      status: 503,
      body: { error: { code: 'SERVICE_UNAVAILABLE', reasonCode: 'db_unavailable' } },
      headers: { 'x-request-id': 'req-503' },
    }));

    await expect(createPaymentIntent({ idempotencyKey: 'idem_1234567890', items: [] })).rejects.toEqual({
      code: 'dependency_unavailable',
      status: 503,
      reasonCode: 'db_unavailable',
      correlationId: 'req-503',
    });
  });

  test('maps unknown statuses to unknown_error', async () => {
    fetch.mockResolvedValue(makeResponse({
      ok: false,
      status: 418,
      body: {},
    }));

    await expect(createPaymentIntent({ idempotencyKey: 'idem_1234567890', items: [] })).rejects.toEqual({
      code: 'unknown_error',
      status: 418,
    });
  });
});