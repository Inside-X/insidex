import {
  getRefreshSession,
  rotateRefreshSession,
  setRefreshTokenRedisClient,
  storeRefreshSession,
  validateAndConsumeRefreshSession,
} from '../../src/security/refresh-token-store.js';
import { createFakeRedisClient } from '../helpers/fake-redis-client.js';

describe('refresh token store redis strict semantics', () => {
  beforeEach(() => {
    setRefreshTokenRedisClient(createFakeRedisClient());
  });

  test('uses SET NX and rejects overwrite for same refresh:<tokenId> key', async () => {
    const expiresAt = Date.now() + 60_000;
    const first = await storeRefreshSession({ sessionId: 'sid-1', userId: 'u-1', token: 'a.b.c', expiresAt });
    const second = await storeRefreshSession({ sessionId: 'sid-1', userId: 'u-1', token: 'x.y.z', expiresAt });

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, reason: 'duplicate' });
  });

  test('rotation atomically deletes old and writes new session', async () => {
    const expiresAt = Date.now() + 60_000;
    await storeRefreshSession({ sessionId: 'sid-old', userId: 'u-1', token: 'old.token', expiresAt });
    await validateAndConsumeRefreshSession({ sessionId: 'sid-old', userId: 'u-1', token: 'old.token', minRefreshIntervalMs: 0 });

    const rotated = await rotateRefreshSession({
      oldSessionId: 'sid-old',
      newSessionId: 'sid-new',
      userId: 'u-1',
      newToken: 'new.token',
      newExpiresAt: Date.now() + 60_000,
    });

    expect(rotated).toEqual({ ok: true });
    const oldSession = await getRefreshSession('sid-old');
    const newSession = await getRefreshSession('sid-new');

    expect(oldSession).toBeNull();
    expect(newSession.revoked).toBe(false);
  });
});