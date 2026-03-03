import { jest } from '@jest/globals';
import {
  createCheckoutPaymentIntent,
  getOrCreateCheckoutAttemptIdempotencyKey,
  isCreateIntentInFlight,
  resetCheckoutAttemptIdempotencyKey,
} from '../js/modules/checkoutPaymentAttempt.js';

describe('checkout payment attempt helper', () => {
  beforeEach(() => {
    resetCheckoutAttemptIdempotencyKey();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetCheckoutAttemptIdempotencyKey();
  });

  test('request payload contains only items {id, quantity}', async () => {
    const requestPaymentIntent = jest.fn().mockResolvedValue({ data: { paymentIntentId: 'pi_1' } });

    await createCheckoutPaymentIntent({
      checkoutItems: [
        { id: 'prod-1', qty: 2, price: 9999, name: 'forbidden' },
      ],
      requestPaymentIntent,
      keyFactory: () => 'idem_1',
    });

    expect(requestPaymentIntent).toHaveBeenCalledWith({
      items: [{ id: 'prod-1', quantity: 2 }],
      idempotencyKey: 'idem_1',
    });
  });

  test('pending flag/callback prevents double submit while request is in flight', async () => {
    let release;
    const blocker = new Promise((resolve) => {
      release = resolve;
    });

    const requestPaymentIntent = jest.fn().mockImplementation(() => blocker);
    const pendingStates = [];

    const first = createCheckoutPaymentIntent({
      checkoutItems: [{ id: 'prod-1', qty: 1 }],
      requestPaymentIntent,
      onPendingChange: (pending) => pendingStates.push(pending),
      keyFactory: () => 'idem_pending',
    });

    expect(isCreateIntentInFlight()).toBe(true);

    const second = await createCheckoutPaymentIntent({
      checkoutItems: [{ id: 'prod-1', qty: 1 }],
      requestPaymentIntent,
      onPendingChange: (pending) => pendingStates.push(pending),
    });

    expect(second).toEqual({ skipped: true });
    expect(requestPaymentIntent).toHaveBeenCalledTimes(1);

    release({ data: { paymentIntentId: 'pi_1' } });
    await first;

    expect(pendingStates).toEqual([true, false]);
    expect(isCreateIntentInFlight()).toBe(false);
  });

  test('on retry after 503, idempotency key is reused', async () => {
    const requestPaymentIntent = jest.fn()
      .mockRejectedValueOnce({ code: 'dependency_unavailable', status: 503 })
      .mockResolvedValueOnce({ data: { paymentIntentId: 'pi_retry' } });

    await expect(createCheckoutPaymentIntent({
      checkoutItems: [{ id: 'prod-2', qty: 1 }],
      requestPaymentIntent,
      keyFactory: () => 'idem_retry_same',
    })).rejects.toEqual({ code: 'dependency_unavailable', status: 503 });

    await createCheckoutPaymentIntent({
      checkoutItems: [{ id: 'prod-2', qty: 1 }],
      requestPaymentIntent,
    });

    expect(requestPaymentIntent).toHaveBeenNthCalledWith(1, {
      items: [{ id: 'prod-2', quantity: 1 }],
      idempotencyKey: 'idem_retry_same',
    });
    expect(requestPaymentIntent).toHaveBeenNthCalledWith(2, {
      items: [{ id: 'prod-2', quantity: 1 }],
      idempotencyKey: 'idem_retry_same',
    });
  });

  test('reset allows fresh checkout attempt key', () => {
    const first = getOrCreateCheckoutAttemptIdempotencyKey({ keyFactory: () => 'idem_first' });
    resetCheckoutAttemptIdempotencyKey();
    const second = getOrCreateCheckoutAttemptIdempotencyKey({ keyFactory: () => 'idem_second' });

    expect(first).toBe('idem_first');
    expect(second).toBe('idem_second');
  });
});