import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters } from '../../src/middlewares/rateLimit.js';

describe('Bruteforce protection', () => {
  beforeEach(() => {
    process.env.AUTH_RATE_WINDOW_MS = '60000';
    process.env.AUTH_RATE_MAX = '4';
    resetRateLimiters();
  });

  test('1 to 4 attempts are allowed', async () => {
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'Password123' });
      expect([200, 401]).toContain(res.status);
    }
  });

  test('5th attempt is blocked', async () => {
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'Password123' });
    }

    const blocked = await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'Password123' });
    expect(blocked.status).toBe(429);
  });

  test('ip stays blocked in same window', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'Password123' });
    }

    const blockedAgain = await request(app).post('/api/auth/login').send({ email: 'another@example.com', password: 'Password123' });
    expect(blockedAgain.status).toBe(429);
  });

  test('email enumeration does not leak user existence', async () => {
    const known = await request(app).post('/api/auth/login').send({ email: 'known@example.com', password: 'Password123' });
    resetRateLimiters();
    const unknown = await request(app).post('/api/auth/login').send({ email: 'unknown@example.com', password: 'Password123' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.data.email).toBe('known@example.com');
    expect(unknown.body.data.email).toBe('unknown@example.com');
  });
});