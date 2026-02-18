import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';
import { resetRefreshTokenStore } from '../../src/security/refresh-token-store.js';

describe('Auth logout consistency', () => {
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

  test('logout is idempotent across double call', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'user@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const first = await request(app).post('/api/auth/logout').send({ refreshToken: token });
    const second = await request(app).post('/api/auth/logout').send({ refreshToken: token });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(first.text).toBe('');
    expect(second.text).toBe('');
  });

  test('logout without token returns 204', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  test('logout with already revoked token returns 204', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'user@x.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const first = await request(app).post('/api/auth/logout').send({ refreshToken: token });
    const second = await request(app).post('/api/auth/logout').send({ refreshToken: token });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
  });

  test('logout with malformed token injection returns 204', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: '"; DROP TABLE sessions; -- not-a-jwt' });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});