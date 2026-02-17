import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';
import { resetRefreshTokenStore } from '../../src/security/refresh-token-store.js';

describe('Cookie security flags', () => {
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
    resetRateLimiters();
    resetRefreshTokenStore();
  });

  test('sets HttpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'cookie@example.com', password: 'Password123' });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
  });

  test('sets Secure in production', async () => {
    const previous = process.env.NODE_ENV;
    const previousCors = process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';

    try {
      const res = await request(app).post('/api/auth/login').send({ email: 'cookie@example.com', password: 'Password123' });
      expect(res.status).toBe(200);
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('Secure');
    } finally {
      process.env.NODE_ENV = previous;
      process.env.CORS_ORIGIN = previousCors;
    }
  });

  test('sets SameSite correctly', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'cookie@example.com', password: 'Password123' });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('SameSite=Lax');
  });

  test('missing refresh cookie/token is rejected', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(401);
  });
});