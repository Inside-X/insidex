import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { logger } from '../../src/utils/logger.js';
import { setRateLimitRedisClient } from '../../src/middlewares/rateLimit.js';
import { createFakeRedisClient } from '../helpers/fake-redis-client.js';

function authEnv() {
  process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-1234567890ab';
  process.env.JWT_ACCESS_ISSUER = 'insidex-auth';
  process.env.JWT_ACCESS_AUDIENCE = 'insidex-api';
  process.env.JWT_ACCESS_EXPIRY = '15m';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-1234567890a';
  process.env.JWT_REFRESH_ISSUER = 'insidex-auth-refresh';
  process.env.JWT_REFRESH_AUDIENCE = 'insidex-api-refresh';
  process.env.JWT_REFRESH_EXPIRY = '30m';
}

describe('rate-limit fail-closed hardening', () => {
  beforeEach(() => {
    authEnv();
    setRateLimitRedisClient(createFakeRedisClient());
  });

  test('returns 503 on sensitive auth routes when redis is down', async () => {
    setRateLimitRedisClient(null);

    const login = await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'Password123' });
    const register = await request(app).post('/api/auth/register').send({ email: 'u@x.com', password: 'Password123', role: 'customer' });
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid' });

    expect(login.status).toBe(503);
    expect(register.status).toBe(503);
    expect(refresh.status).toBe(503);
  });

  test('returns 503 on payment route when redis is down', async () => {
    setRateLimitRedisClient(null);

    const res = await request(app).post('/api/payments/create-intent').send({ amount: 1000, currency: 'EUR' });
    expect(res.status).toBe(503);
  });

  test('returns 503 on webhook routes when redis is down', async () => {
    setRateLimitRedisClient(null);

    const stripe = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 't=1,v1=bad')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_1"}');

    const paypal = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send('{"id":"WH-1"}');

    expect(stripe.status).toBe(503);
    expect(paypal.status).toBe(503);
  });

  test('logs rate_limit_backend_down as structured error', async () => {
    setRateLimitRedisClient(null);
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    await request(app).post('/api/auth/login').send({ email: 'x@y.com', password: 'Password123' });

    expect(spy).toHaveBeenCalledWith('rate_limit_backend_down', expect.objectContaining({
      event: 'rate_limit_backend_down',
    }));

    spy.mockRestore();
  });

  test('/healthz exposes redis status', async () => {
    setRateLimitRedisClient(createFakeRedisClient());
    const ok = await request(app).get('/healthz');
    expect(ok.status).toBe(200);
    expect(ok.body.data.dependencies.redis).toBe(true);

    setRateLimitRedisClient(null);
    const down = await request(app).get('/healthz');
    expect(down.status).toBe(503);
    expect(down.body.data.dependencies.redis).toBe(false);
  });
});