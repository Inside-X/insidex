const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

function toKey(provider, eventId) {
  return `webhook:${provider}:${eventId}`;
}

function createMemoryStore(now = Date.now) {
  const store = new Map();

  function cleanupExpired() {
    const current = now();
    for (const [key, expiresAt] of store.entries()) {
      if (expiresAt <= current) {
        store.delete(key);
      }
    }
  }

  return {
    async setNXWithTTL(key, ttlSeconds) {
      cleanupExpired();
      if (store.has(key)) {
        return false;
      }

      store.set(key, now() + (ttlSeconds * 1000));
      return true;
    },
  };
}

export function createWebhookIdempotencyStore({ redisClient = null, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now } = {}) {
  const memoryFallback = createMemoryStore(now);

  async function claim({ provider, eventId }) {
    if (!provider || !eventId || typeof eventId !== 'string') {
      return { accepted: false, reason: 'invalid_event_id' };
    }

    const key = toKey(provider, eventId);

    if (redisClient?.set) {
      const result = await redisClient.set(key, '1', { NX: true, EX: ttlSeconds });
      return result === 'OK'
        ? { accepted: true, reason: 'claimed' }
        : { accepted: false, reason: 'replay' };
    }

    const accepted = await memoryFallback.setNXWithTTL(key, ttlSeconds);
    return accepted
      ? { accepted: true, reason: 'claimed_memory' }
      : { accepted: false, reason: 'replay' };
  }

  return {
    claim,
    ttlSeconds,
  };
}

export default createWebhookIdempotencyStore;