import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';

let prisma = null;

async function cleanupDatabase() {
  if (!prisma) return;

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
}

function refreshToken(sub = '00000000-0000-0000-0000-000000000123', options = {}) {
  return jwt.sign({ sub, sid: options.sid || '11111111-1111-4111-8111-111111111111', type: 'refresh' }, options.secret || process.env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    issuer: options.issuer || process.env.JWT_REFRESH_ISSUER,
    audience: options.audience || process.env.JWT_REFRESH_AUDIENCE,
    expiresIn: options.expiresIn || '30m',
  });
}

beforeAll(async () => {
  process.env.AUTH_RATE_WINDOW_MS = '60000';
  process.env.AUTH_RATE_MAX = '6';
  process.env.API_RATE_MAX = '200';

  if (process.env.DATABASE_URL) {
    try {
      const prismaModule = await import('../../src/lib/prisma.js');
      prisma = prismaModule.default;
      await cleanupDatabase();
    } catch {
      prisma = null;
    }
  }
});

beforeEach(async () => {
  resetRateLimiters();
  await cleanupDatabase();
});

afterAll(async () => {
  await cleanupDatabase();
  if (prisma) {
    await prisma.$disconnect();
  }
});

describe('sensitive auth runtime endpoints', () => {
  test('POST /api/auth/forgot returns 200 on valid payload', async () => {
    const res = await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { accepted: true } });
  });

  test('POST /api/auth/forgot returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/auth/forgot').send({ email: 'bad-email', extra: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  test('POST /api/auth/forgot returns 429 when strict auth rate limit exceeded', async () => {
    await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });
    await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });
    await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });
    await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });
    await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });
    await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });
    const res = await request(app).post('/api/auth/forgot').send({ email: 'valid@example.com' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  test('POST /api/auth/reset returns 200 on valid payload', async () => {
    const res = await request(app).post('/api/auth/reset').send({
      email: 'valid@example.com',
      resetToken: '12345678-reset-token',
      newPassword: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { reset: true } });
  });

  test('POST /api/auth/reset returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/auth/reset').send({
      email: 'valid@example.com',
      resetToken: 'short',
      newPassword: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/auth/reset returns 429 when strict auth rate limit exceeded', async () => {
    const payload = { email: 'valid@example.com', resetToken: '12345678-reset-token', newPassword: 'Password123!' };

    await request(app).post('/api/auth/reset').send(payload);
    await request(app).post('/api/auth/reset').send(payload);
    await request(app).post('/api/auth/reset').send(payload);
    await request(app).post('/api/auth/reset').send(payload);
    await request(app).post('/api/auth/reset').send(payload);
    await request(app).post('/api/auth/reset').send(payload);
    const res = await request(app).post('/api/auth/reset').send(payload);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('POST /api/auth/refresh returns 200 on valid refresh token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'valid@example.com', password: 'Password123!' });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.data.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshed).toBe(true);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  test('POST /api/auth/refresh returns 400 on invalid payload', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/auth/refresh returns 401 on invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid.token.value' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid refresh token');
  });

  test('POST /api/auth/refresh rejects refresh token signed with wrong secret', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshToken('sub-1', { secret: process.env.JWT_ACCESS_SECRET }) });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/auth/refresh rejects refresh token with wrong audience', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshToken('sub-1', { audience: 'not-insidex-api-refresh' }) });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/auth/refresh returns 429 when strict auth rate limit exceeded', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'valid@example.com', password: 'Password123!' });
    const payload = { refreshToken: login.body.data.refreshToken };

    await request(app).post('/api/auth/refresh').send(payload);
    await request(app).post('/api/auth/refresh').send(payload);
    await request(app).post('/api/auth/refresh').send(payload);
    await request(app).post('/api/auth/refresh').send(payload);
    await request(app).post('/api/auth/refresh').send(payload);
    await request(app).post('/api/auth/refresh').send(payload);
    const res = await request(app).post('/api/auth/refresh').send(payload);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});