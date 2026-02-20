import { jest } from '@jest/globals';
import { createWebhookIdempotencyStore } from '../../src/lib/webhook-idempotency-store.js';

describe('webhook idempotency store', () => {
  test('rejects invalid event id payload', async () => {
    const store = createWebhookIdempotencyStore();
    await expect(store.claim({ provider: 'stripe', eventId: '' })).resolves.toEqual({
      accepted: false,
      reason: 'invalid_event_id',
    });
  });

  test('memory fallback claims first, rejects replay, then accepts after ttl expiry', async () => {
    let nowMs = 1_000;
    const store = createWebhookIdempotencyStore({ ttlSeconds: 1, now: () => nowMs });

    await expect(store.claim({ provider: 'stripe', eventId: 'evt_1' })).resolves.toEqual({
      accepted: true,
      reason: 'claimed_memory',
    });

    await expect(store.claim({ provider: 'stripe', eventId: 'evt_1' })).resolves.toEqual({
      accepted: false,
      reason: 'replay',
    });

    nowMs += 1_100;

    await expect(store.claim({ provider: 'stripe', eventId: 'evt_1' })).resolves.toEqual({
      accepted: true,
      reason: 'claimed_memory',
    });
  });

  test('redis mode claims first and rejects duplicate based on NX response', async () => {
    const set = jest.fn()
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null);

    const store = createWebhookIdempotencyStore({ redisClient: { set }, ttlSeconds: 90 });

    await expect(store.claim({ provider: 'paypal', eventId: 'evt_2' })).resolves.toEqual({
      accepted: true,
      reason: 'claimed',
    });

    await expect(store.claim({ provider: 'paypal', eventId: 'evt_2' })).resolves.toEqual({
      accepted: false,
      reason: 'replay',
    });

    expect(set).toHaveBeenCalledWith('webhook:paypal:evt_2', '1', { NX: true, EX: 90 });
  });

  test('redis command rejection surfaces to caller for safe handling upstream', async () => {
    const set = jest.fn().mockRejectedValue(new Error('redis down'));
    const store = createWebhookIdempotencyStore({ redisClient: { set } });

    await expect(store.claim({ provider: 'stripe', eventId: 'evt_3' })).rejects.toThrow('redis down');
  });
});