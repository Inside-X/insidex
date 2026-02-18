import request from 'supertest';
import app from '../../src/app.js';
import { createFakeRedisClient } from '../helpers/fake-redis-client.js';
import {
  getRefreshSession,
  resetRefreshTokenStore,
  setRefreshTokenRedisClient,
} from '../../src/security/refresh-token-store.js';

function applyAuthEnv() {
  process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-1234567890ab';
  process.env.JWT_ACCESS_ISSUER = 'insidex-auth';
  process.env.JWT_ACCESS_AUDIENCE = 'insidex-api';
  process.env.JWT_ACCESS_EXPIRY = '15m';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-1234567890a';
  process.env.JWT_REFRESH_ISSUER = 'insidex-auth-refresh';
  process.env.JWT_REFRESH_AUDIENCE = 'insidex-api-refresh';
  process.env.JWT_REFRESH_EXPIRY = '30m';
  process.env.AUTH_RATE_MAX = '100';
  process.env.REFRESH_MIN_INTERVAL_MS = '0';
}

describe('refresh token redis distributed guarantees', () => {
  beforeEach(() => {
    applyAuthEnv();
    setRefreshTokenRedisClient(createFakeRedisClient());
    resetRefreshTokenStore();
  });

  test('restart simulation keeps refresh session in shared redis state', async () => {
    const sharedState = new Map();
    const firstInstance = createFakeRedisClient({ sharedState });
    const secondInstance = createFakeRedisClient({ sharedState });

    setRefreshTokenRedisClient(firstInstance);
    const login = await request(app).post('/api/auth/login').send({ email: 'restart@x.com', password: 'Password123' });
    const refreshToken = login.body.data.refreshToken;

    setRefreshTokenRedisClient(secondInstance);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken });

    expect(refreshed.status).toBe(200);
  });

  test('multi-instance simulation shares revocation state', async () => {
    const sharedState = new Map();
    const instanceA = createFakeRedisClient({ sharedState });
    const instanceB = createFakeRedisClient({ sharedState });

    setRefreshTokenRedisClient(instanceA);
    const login = await request(app).post('/api/auth/login').send({ email: 'multi@x.com', password: 'Password123' });
    const refreshToken = login.body.data.refreshToken;

    setRefreshTokenRedisClient(instanceB);
    const logout = await request(app).post('/api/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(204);

    setRefreshTokenRedisClient(instanceA);
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
  });

  test('replay old token is rejected immediately after rotation', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'replay@x.com', password: 'Password123' });
    const firstToken = login.body.data.refreshToken;

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: firstToken });
    expect(refresh.status).toBe(200);

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: firstToken });
    expect(replay.status).toBe(401);
  });

  test('concurrent refresh race condition allows only one success', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'race@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').send({ refreshToken: token }),
      request(app).post('/api/auth/refresh').send({ refreshToken: token }),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 401]);
  });

  test('logout deletes redis key refresh:<tokenId>', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'del@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    const rotated = refresh.body.data.refreshToken;

    const payload = JSON.parse(Buffer.from(rotated.split('.')[1], 'base64url').toString('utf8'));
    const before = await getRefreshSession(payload.sid);
    expect(before).not.toBeNull();

    const logout = await request(app).post('/api/auth/logout').send({ refreshToken: rotated });
    expect(logout.status).toBe(204);

    const after = await getRefreshSession(payload.sid);
    expect(after).toBeNull();
  });
});