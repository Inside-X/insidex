import { jest } from '@jest/globals';
import crypto from 'crypto';
import {
  LUA_ROTATE,
  LUA_VALIDATE_AND_CONSUME,
  assertRefreshTokenRedisConnected,
  getRefreshSession,
  getRefreshTokenRedisClient,
  resetRefreshTokenStore,
  revokeAllUserRefreshSessions,
  revokeRefreshSession,
  rotateRefreshSession,
  setRefreshTokenRedisClient,
  storeRefreshSession,
  validateAndConsumeRefreshSession,
} from '../../src/security/refresh-token-store.js';

function makeRedisMock(overrides = {}) {
  return {
    ping: jest.fn(async () => 'PONG'),
    set: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
    del: jest.fn(async () => 0),
    eval: jest.fn(async () => [1, 'ok']),
    flushAll: jest.fn(),
    ...overrides,
  };
}

function expectedHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

describe('refresh-token-store (redis mocked, branch complete)', () => {
  beforeEach(() => {
    setRefreshTokenRedisClient(null);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    setRefreshTokenRedisClient(null);
    jest.restoreAllMocks();
  });

  test('set/get client accessors: null fallback and assigned client', () => {
    expect(getRefreshTokenRedisClient()).toBeNull();
    const client = makeRedisMock();
    setRefreshTokenRedisClient(client);
    expect(getRefreshTokenRedisClient()).toBe(client);
    setRefreshTokenRedisClient(undefined);
    expect(getRefreshTokenRedisClient()).toBeNull();
  });

  test('throws when redis client is not configured', async () => {
    await expect(assertRefreshTokenRedisConnected()).rejects.toThrow('Refresh token Redis client is not configured');
    await expect(storeRefreshSession({ sessionId: 's', userId: 'u', token: 't', expiresAt: Date.now() + 1000 }))
      .rejects.toThrow('Refresh token Redis client is not configured');
    await expect(validateAndConsumeRefreshSession({ sessionId: 's', userId: 'u', token: 't' }))
      .rejects.toThrow('Refresh token Redis client is not configured');
    await expect(rotateRefreshSession({ oldSessionId: 'a', newSessionId: 'b', userId: 'u', newToken: 't', newExpiresAt: Date.now() + 1000 }))
      .rejects.toThrow('Refresh token Redis client is not configured');
    await expect(revokeRefreshSession('s')).rejects.toThrow('Refresh token Redis client is not configured');
    await expect(getRefreshSession('s')).rejects.toThrow('Refresh token Redis client is not configured');
    expect(() => resetRefreshTokenStore()).toThrow('Refresh token Redis client is not configured');
  });

  test('assertRefreshTokenRedisConnected success and connection error propagation', async () => {
    const ok = makeRedisMock();
    setRefreshTokenRedisClient(ok);
    await expect(assertRefreshTokenRedisConnected()).resolves.toBeUndefined();
    expect(ok.ping).toHaveBeenCalledTimes(1);

    const fail = makeRedisMock({ ping: jest.fn(async () => { throw new Error('redis down'); }) });
    setRefreshTokenRedisClient(fail);
    await expect(assertRefreshTokenRedisConnected()).rejects.toThrow('redis down');
  });

  test('storeRefreshSession set success with expiration/NX and hashed token payload', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const redis = makeRedisMock({ set: jest.fn(async () => 'OK') });
    setRefreshTokenRedisClient(redis);

    const expiresAt = 1_060_000;
    const result = await storeRefreshSession({ sessionId: 'sid-1', userId: 'user-1', token: 'a.b.c', expiresAt });
    expect(result).toEqual({ ok: true });

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, payload, options] = redis.set.mock.calls[0];
    expect(key).toBe('refresh:sid-1');
    expect(options).toEqual({ NX: true, PX: 60_000 });

    const parsed = JSON.parse(payload);
    expect(parsed).toMatchObject({
      sessionId: 'sid-1',
      userId: 'user-1',
      tokenHash: expectedHash('a.b.c'),
      expiresAt,
      used: false,
      revoked: false,
      replacedBy: null,
      createdAt: 1_000_000,
      lastRefreshAt: 0,
    });
  });

  test('storeRefreshSession duplicate, expired, and command failure branches', async () => {
    const redis = makeRedisMock();
    setRefreshTokenRedisClient(redis);

    jest.spyOn(Date, 'now').mockReturnValue(2_000);
    redis.set.mockResolvedValueOnce('NOT_OK');
    await expect(storeRefreshSession({ sessionId: 'dup', userId: 'u', token: 't', expiresAt: 3_000 }))
      .resolves.toEqual({ ok: false, reason: 'duplicate' });

    await expect(storeRefreshSession({ sessionId: 'exp', userId: 'u', token: 't', expiresAt: 2_000 }))
      .resolves.toEqual({ ok: false, reason: 'expired' });

    redis.set.mockRejectedValueOnce(new Error('set failed'));
    await expect(storeRefreshSession({ sessionId: 'err', userId: 'u', token: 't', expiresAt: 3_000 }))
      .rejects.toThrow('set failed');
  });

  test('storeRefreshSession token-format and edge inputs (null/undefined/empty string)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);
    const redis = makeRedisMock({ set: jest.fn(async () => 'OK') });
    setRefreshTokenRedisClient(redis);

    await expect(storeRefreshSession({ sessionId: '', userId: '', token: '', expiresAt: 11_000 })).resolves.toEqual({ ok: true });
    await expect(storeRefreshSession({ sessionId: null, userId: undefined, token: null, expiresAt: 11_000 })).resolves.toEqual({ ok: true });

    const p1 = JSON.parse(redis.set.mock.calls[0][1]);
    const p2 = JSON.parse(redis.set.mock.calls[1][1]);
    expect(p1.tokenHash).toBe(expectedHash(''));
    expect(p2.tokenHash).toBe(expectedHash(null));
    expect(redis.set.mock.calls[1][0]).toBe('refresh:null');
  });

  test('validateAndConsumeRefreshSession ok and non-ok reason mapping with min interval normalization', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(50_000);
    const redis = makeRedisMock();
    setRefreshTokenRedisClient(redis);

    redis.eval.mockResolvedValueOnce([1, 'ok']);
    await expect(validateAndConsumeRefreshSession({
      sessionId: 'sid-ok',
      userId: 'user-ok',
      token: 'tok-ok',
      minRefreshIntervalMs: '250',
    })).resolves.toEqual({ ok: true });

    expect(redis.eval).toHaveBeenLastCalledWith(LUA_VALIDATE_AND_CONSUME, {
      keys: ['refresh:sid-ok', 'refresh:user:last:user-ok'],
      arguments: ['user-ok', expectedHash('tok-ok'), '50000', '250'],
    });

    redis.eval.mockResolvedValueOnce([0, null]);
    await expect(validateAndConsumeRefreshSession({
      sessionId: 'sid-fail',
      userId: 'user-fail',
      token: undefined,
      minRefreshIntervalMs: -10,
    })).resolves.toEqual({ ok: false, reason: 'unknown' });

    expect(redis.eval).toHaveBeenLastCalledWith(LUA_VALIDATE_AND_CONSUME, {
      keys: ['refresh:sid-fail', 'refresh:user:last:user-fail'],
      arguments: ['user-fail', expectedHash(undefined), '50000', '0'],
    });

    redis.eval.mockResolvedValueOnce([0, 'flood']);
    await expect(validateAndConsumeRefreshSession({
      sessionId: 'sid-nan',
      userId: 'user-nan',
      token: '',
      minRefreshIntervalMs: 'not-a-number',
    })).resolves.toEqual({ ok: false, reason: 'flood' });

    expect(redis.eval).toHaveBeenLastCalledWith(LUA_VALIDATE_AND_CONSUME, {
      keys: ['refresh:sid-nan', 'refresh:user:last:user-nan'],
      arguments: ['user-nan', expectedHash(''), '50000', '0'],
    });
  });

  test('validateAndConsumeRefreshSession redis eval failure is propagated', async () => {
    const redis = makeRedisMock({ eval: jest.fn(async () => { throw new Error('eval failed'); }) });
    setRefreshTokenRedisClient(redis);

    await expect(validateAndConsumeRefreshSession({ sessionId: 's', userId: 'u', token: 't' }))
      .rejects.toThrow('eval failed');
  });

  test('rotateRefreshSession success, expired, reason mapping, and command failure', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const redis = makeRedisMock();
    setRefreshTokenRedisClient(redis);

    redis.eval.mockResolvedValueOnce([1, 'ok']);
    await expect(rotateRefreshSession({
      oldSessionId: 'old',
      newSessionId: 'new',
      userId: 'u1',
      newToken: 'new-token',
      newExpiresAt: 8000,
    })).resolves.toEqual({ ok: true });

    const [script, params] = redis.eval.mock.calls[0];
    expect(script).toBe(LUA_ROTATE);
    expect(params.keys).toEqual(['refresh:old', 'refresh:new']);
    expect(params.arguments[1]).toBe('7000');
    const payload = JSON.parse(params.arguments[0]);
    expect(payload).toMatchObject({
      sessionId: 'new',
      userId: 'u1',
      tokenHash: expectedHash('new-token'),
      expiresAt: 8000,
      used: false,
      revoked: false,
    });

    await expect(rotateRefreshSession({
      oldSessionId: 'old2',
      newSessionId: 'new2',
      userId: 'u2',
      newToken: 't2',
      newExpiresAt: 1000,
    })).resolves.toEqual({ ok: false, reason: 'expired' });

    redis.eval.mockResolvedValueOnce([0, undefined]);
    await expect(rotateRefreshSession({
      oldSessionId: 'old3',
      newSessionId: 'new3',
      userId: 'u3',
      newToken: 't3',
      newExpiresAt: 9000,
    })).resolves.toEqual({ ok: false, reason: 'unknown' });

    redis.eval.mockRejectedValueOnce(new Error('rotate eval failed'));
    await expect(rotateRefreshSession({
      oldSessionId: 'old4',
      newSessionId: 'new4',
      userId: 'u4',
      newToken: 't4',
      newExpiresAt: 9000,
    })).rejects.toThrow('rotate eval failed');
  });

  test('revokeRefreshSession delete mapping and failure propagation', async () => {
    const redis = makeRedisMock();
    setRefreshTokenRedisClient(redis);

    redis.del.mockResolvedValueOnce(1);
    await expect(revokeRefreshSession('sid1')).resolves.toBe(true);
    expect(redis.del).toHaveBeenLastCalledWith('refresh:sid1');

    redis.del.mockResolvedValueOnce(0);
    await expect(revokeRefreshSession('sid2')).resolves.toBe(false);

    redis.del.mockResolvedValueOnce('2');
    await expect(revokeRefreshSession('sid3')).resolves.toBe(true);

    redis.del.mockRejectedValueOnce(new Error('del failed'));
    await expect(revokeRefreshSession('sid4')).rejects.toThrow('del failed');
  });

  test('getRefreshSession null, parsed payload, invalid JSON, and get failure', async () => {
    const redis = makeRedisMock();
    setRefreshTokenRedisClient(redis);

    redis.get.mockResolvedValueOnce(null);
    await expect(getRefreshSession('sid-null')).resolves.toBeNull();

    redis.get.mockResolvedValueOnce(JSON.stringify({ sessionId: 'sid-json', used: false }));
    await expect(getRefreshSession('sid-json')).resolves.toEqual({ sessionId: 'sid-json', used: false });
    expect(redis.get).toHaveBeenNthCalledWith(2, 'refresh:sid-json');

    redis.get.mockResolvedValueOnce('{bad-json');
    await expect(getRefreshSession('sid-bad')).rejects.toThrow();

    redis.get.mockRejectedValueOnce(new Error('get failed'));
    await expect(getRefreshSession('sid-err')).rejects.toThrow('get failed');
  });

  test('resetRefreshTokenStore uses flushAll when available and throws otherwise', () => {
    const withFlush = makeRedisMock();
    setRefreshTokenRedisClient(withFlush);
    resetRefreshTokenStore();
    expect(withFlush.flushAll).toHaveBeenCalledTimes(1);

    const withoutFlush = makeRedisMock();
    delete withoutFlush.flushAll;
    setRefreshTokenRedisClient(withoutFlush);
    expect(() => resetRefreshTokenStore()).toThrow('resetRefreshTokenStore requires a Redis test client exposing flushAll');
  });

  test('revokeAllUserRefreshSessions throws unsupported error', async () => {
    await expect(revokeAllUserRefreshSessions()).rejects.toThrow(
      'revokeAllUserRefreshSessions is not supported without indexed storage in strict Redis mode',
    );
  });
});