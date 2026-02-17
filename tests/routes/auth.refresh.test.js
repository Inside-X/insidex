import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';
import { resetRefreshTokenStore } from '../../src/security/refresh-token-store.js';

describe('Auth refresh flow', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-1234567890ab';
    process.env.JWT_ACCESS_ISSUER = 'insidex-auth';
    process.env.JWT_ACCESS_AUDIENCE = 'insidex-api';
    process.env.JWT_ACCESS_EXPIRY = '15m';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-1234567890a';
    process.env.JWT_REFRESH_ISSUER = 'insidex-auth-refresh';
    process.env.JWT_REFRESH_AUDIENCE = 'insidex-api-refresh';
    process.env.JWT_REFRESH_EXPIRY = '30m';
    process.env.AUTH_RATE_MAX = '100';
    process.env.REFRESH_MIN_INTERVAL_MS = '1000';
    resetRateLimiters();
    resetRefreshTokenStore();
  });

  test('rotates refresh token on refresh', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'user@x.com', password: 'Password123' });
    const first = login.body.data.refreshToken;

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: first });
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.refreshToken).toBeDefined();
    expect(refresh.body.data.refreshToken).not.toBe(first);
  });

  test('rejects expired refresh token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'user@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token.replace(/\.[^.]+$/, '.tampered') });

    expect(res.status).toBe(401);
  });

  test('rejects reused refresh token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'user@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const firstRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(firstRefresh.status).toBe(200);

    const secondRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(secondRefresh.status).toBe(401);
  });

  test('rejects unknown refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid.token.value' });
    expect(res.status).toBe(401);
  });

  test('limits refresh flood', async () => {
    process.env.REFRESH_MIN_INTERVAL_MS = '60000';
    const login = await request(app).post('/api/auth/login').send({ email: 'user@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(res.status).toBe(200);

    const tooSoon = await request(app).post('/api/auth/refresh').send({ refreshToken: res.body.data.refreshToken });
    expect(tooSoon.status).toBe(429);
  });

  test('logout invalid refresh token returns unauthorized', async () => {
    const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'invalid.token.value' });
    expect(res.status).toBe(401);
  });
});