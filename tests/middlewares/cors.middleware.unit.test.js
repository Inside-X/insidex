import { jest } from '@jest/globals';
import { corsMiddleware } from '../../src/middlewares/cors.js';

function makeReq({ origin, method = 'GET' } = {}) {
  return {
    headers: { origin },
    method,
  };
}

function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader: jest.fn((k, v) => {
      headers[k] = v;
    }),
    status: jest.fn(() => ({ json: jest.fn(), end: jest.fn() })),
  };
}

describe('cors middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('fails closed in production when CORS_ORIGIN missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '';

    const req = makeReq({ origin: 'https://app.example.com' });
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('fails closed in production when wildcard is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '*';

    const req = makeReq({ origin: 'https://app.example.com' });
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for disallowed origin', () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'https://allowed.example.com';

    const req = makeReq({ origin: 'https://forbidden.example.com' });
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('sets CORS headers for allowed origin and continues', () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'https://allowed.example.com';

    const req = makeReq({ origin: 'https://allowed.example.com' });
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://allowed.example.com');
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('allows requests without origin when allow-list exists', () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'https://allowed.example.com';

    const req = makeReq({ origin: undefined });
    const res = makeRes();
    const next = jest.fn();

    corsMiddleware(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('handles OPTIONS preflight with 204', () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'https://allowed.example.com';

    const end = jest.fn();
    const req = makeReq({ origin: 'https://allowed.example.com', method: 'OPTIONS' });
    const res = {
      ...makeRes(),
      status: jest.fn(() => ({ end })),
    };
    const next = jest.fn();

    corsMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});