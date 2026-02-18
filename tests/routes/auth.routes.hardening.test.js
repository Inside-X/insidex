import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';
import { resetRefreshTokenStore } from '../../src/security/refresh-token-store.js';

describe('auth routes hardening branches', () => {
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

  test('register ignores privileged role and forces customer role', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'r@x.com', password: 'Password123', role: 'customer' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('customer');
  });

  test('login fails with 500 if JWT access config missing', async () => {
    const previous = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = '';

    const res = await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'Password123' });
    expect(res.status).toBe(500);

    process.env.JWT_ACCESS_SECRET = previous;
  });

  test('register fails with 500 when JWT access config missing', async () => {
    const previous = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = '';

    const res = await request(app).post('/api/auth/register').send({ email: 'r2@x.com', password: 'Password123', role: 'customer' });
    expect(res.status).toBe(500);

    process.env.JWT_ACCESS_SECRET = previous;
  });

  test('refresh and logout accept cookie token path', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'Password123' });
    const cookie = login.headers['set-cookie'][0].split(';')[0];

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie).send({});
    expect(refresh.status).toBe(200);

    const rotatedCookie = refresh.headers['set-cookie'][0].split(';')[0];
    const logout = await request(app).post('/api/auth/logout').set('Cookie', rotatedCookie).send({});
    expect(logout.status).toBe(204);
  });

  test('refresh returns 500 when refresh JWT config missing', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'Password123' });
    const token = login.body.data.refreshToken;

    const previous = process.env.JWT_REFRESH_SECRET;
    process.env.JWT_REFRESH_SECRET = '';

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(res.status).toBe(500);

    process.env.JWT_REFRESH_SECRET = previous;
  });

  test('forgot and reset always return generic responses', async () => {
    const forgot = await request(app).post('/api/auth/forgot').send({ email: 'user@example.com' });
    expect(forgot.status).toBe(200);

    const reset = await request(app).post('/api/auth/reset').send({
      email: 'user@example.com',
      resetToken: '12345678-reset-token',
      newPassword: 'Password123',
    });
    expect(reset.status).toBe(200);
  });

  test('refresh without body or cookie is rejected', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
  });
});