function decode(value) {
  return value == null ? null : JSON.parse(value);
}

function encode(value) {
  return JSON.stringify(value);
}

export function createFakeRedisClient({ sharedState } = {}) {
  const state = sharedState || new Map();

  function now() {
    return Date.now();
  }

  function readKey(key) {
    const entry = state.get(key);
    if (!entry) return null;
    if (entry.expiresAt && now() >= entry.expiresAt) {
      state.delete(key);
      return null;
    }
    return entry;
  }

  function writeKey(key, value, expiresAt = null) {
    state.set(key, { value, expiresAt });
  }

  function parseTtl(options) {
    if (!options) return null;
    if (Number.isFinite(options.PX)) return Number(options.PX);
    if (Number.isFinite(options.EX)) return Number(options.EX) * 1000;
    return null;
  }

  return {
    __state: state,

    async ping() {
      return 'PONG';
    },

    async get(key) {
      return readKey(key)?.value ?? null;
    },

    async set(key, value, options = {}) {
      const existing = readKey(key);
      if (options.NX && existing) {
        return null;
      }

      const ttlMs = parseTtl(options);
      const expiresAt = ttlMs != null ? now() + ttlMs : (options.KEEPTTL && existing ? existing.expiresAt : null);
      writeKey(key, value, expiresAt);
      return 'OK';
    },

    async del(key) {
      return state.delete(key) ? 1 : 0;
    },

    flushAll() {
      state.clear();
    },

    async eval(script, { keys, arguments: args }) {

      if (script.includes('INCR') && script.includes('PEXPIRE') && script.includes('PTTL')) {
        const [rateKey] = keys;
        const [windowMsRaw] = args;
        const windowMs = Number(windowMsRaw);

        const current = readKey(rateKey);
        const nowTs = now();
        if (!current) {
          writeKey(rateKey, '1', nowTs + windowMs);
          return [1, windowMs];
        }

        const next = Number(current.value || '0') + 1;
        writeKey(rateKey, String(next), current.expiresAt ?? nowTs + windowMs);
        const ttl = Math.max(0, (current.expiresAt ?? (nowTs + windowMs)) - nowTs);
        return [next, ttl];
      }

      if (script.includes('refresh_validate_and_consume_v1')) {
        const [sessionKey, userLastKey] = keys;
        const [userId, tokenHash, nowMsRaw, minIntervalRaw] = args;
        const nowMs = Number(nowMsRaw);
        const minRefreshIntervalMs = Number(minIntervalRaw);

        const sessionEntry = readKey(sessionKey);
        if (!sessionEntry) return [0, 'unknown'];

        const session = decode(sessionEntry.value);
        if (session.userId !== userId) return [0, 'unknown'];
        if (session.revoked === true) return [0, 'revoked'];

        if (session.used === true || session.replacedBy) {
          session.revoked = true;
          writeKey(sessionKey, encode(session), sessionEntry.expiresAt);
          return [0, 'reused'];
        }

        if (session.tokenHash !== tokenHash) {
          session.revoked = true;
          writeKey(sessionKey, encode(session), sessionEntry.expiresAt);
          return [0, 'unknown'];
        }

        const lastEntry = readKey(userLastKey);
        const lastRefreshAt = Number(lastEntry?.value || '0');
        if (nowMs - lastRefreshAt < minRefreshIntervalMs) return [0, 'flood'];

        session.used = true;
        session.lastRefreshAt = nowMs;
        writeKey(sessionKey, encode(session), sessionEntry.expiresAt);
        writeKey(userLastKey, String(nowMs), now() + minRefreshIntervalMs);
        return [1, 'ok'];
      }

      if (script.includes('refresh_rotate_v1')) {
        const [oldSessionKey, newSessionKey] = keys;
        const [newSessionRaw, ttlMsRaw] = args;
        const ttlMs = Number(ttlMsRaw);

        const oldEntry = readKey(oldSessionKey);
        if (!oldEntry) return [0, 'unknown'];

        const oldSession = decode(oldEntry.value);
        if (oldSession.revoked === true) return [0, 'revoked'];

        state.delete(oldSessionKey);

        if (readKey(newSessionKey)) return [0, 'conflict'];

        writeKey(newSessionKey, newSessionRaw, now() + ttlMs);
        return [1, 'ok'];
      }

      throw new Error('Unknown script');
    },
  };
}