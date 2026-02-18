import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';
import { resetRefreshTokenStore } from '../../src/security/refresh-token-store.js';

describe('Auth integration hardening flow', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-1234567890ab';
    process.env.JWT_ACCESS_ISSUER = 'insidex-auth';
    process.env.JWT_ACCESS_AUDIENCE = 'insidex-api';
    process.env.JWT_ACCESS_EXPIRY = '15m';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-1234567890a';
    process.env.JWT_REFRESH_ISSUER = 'insidex-auth-refresh';
    process.env.JWT_REFRESH_AUDIENCE = 'insidex-api-refresh';
    process.env.JWT_REFRESH_EXPIRY = '30m';
    process.env.AUTH_RATE_MAX = '5';
    process.env.REFRESH_MIN_INTERVAL_MS = '0';
    resetRateLimiters();
    resetRefreshTokenStore();
  });

  test('login -> refresh rotation -> admin blocked -> bruteforce -> logout -> old refresh reused', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'flow@example.com', password: 'Password123' });
    expect(login.status).toBe(200);

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.data.refreshToken });
    expect(refresh.status).toBe(200);

    const customerToken = buildTestToken({ role: 'customer', id: 'cust-1' });
    const adminAttempt = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${customerToken}`);
    expect(adminAttempt.status).toBe(403);

    await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'Password123' });
    await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'Password123' });
    await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'Password123' });
    await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'Password123' });
    const blocked = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'Password123' });
    expect(blocked.status).toBe(429);

    resetRateLimiters();
    const logout = await request(app).post('/api/auth/logout').send({ refreshToken: refresh.body.data.refreshToken });
    expect(logout.status).toBe(204);

    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.data.refreshToken });
    expect(reused.status).toBe(401);
  });
});