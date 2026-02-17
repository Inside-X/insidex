import request from 'supertest';
import express from 'express';
import { corsMiddleware } from '../../src/middlewares/cors.js';

describe('cors middleware', () => {
  function app() {
    const a = express();
    a.use(corsMiddleware);
    a.get('/ok', (_req, res) => res.status(200).json({ ok: true }));
    return a;
  }

  test('returns 204 for options', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com';
    const res = await request(app()).options('/ok').set('Origin', 'https://app.example.com');
    expect(res.status).toBe(204);
  });

  test('forbids unknown origin', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com';
    const res = await request(app()).get('/ok').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });

  test('allows listed origin', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com';
    const res = await request(app()).get('/ok').set('Origin', 'https://app.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });
});