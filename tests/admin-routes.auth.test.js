import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { buildTestToken } from './helpers/jwt.helper.js';

describe('Admin routes protection (/api/admin)', () => {
  test('1) sans token -> 401', async () => {
    const response = await request(app)
      .get('/api/admin/health')
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });

  test('2) header Authorization mal formé -> 401', async () => {
    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', 'Token abc123')
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization header must be in the format: Bearer <token>',
      },
    });
  });

  test('3) token invalide -> 401', async () => {
    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      },
    });
  });

  test('4) token valide non-admin -> 403', async () => {
    const customerToken = buildTestToken({ role: 'customer', id: 'cust-1' });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    expect(response.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  });

  test('5) token admin valide -> 200', async () => {
    const adminToken = buildTestToken({ role: 'admin', id: 'admin-1' });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data).toEqual({
      status: 'ok',
      scope: 'admin',
    });
  });

  test('6) token sans rôle -> 403', async () => {
    const tokenWithoutRole = buildTestToken({ role: undefined, id: 'user-no-role' });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${tokenWithoutRole}`)
      .expect(403);

    expect(response.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  });


  test('7) token expiré -> 401', async () => {
    const expiredToken = buildTestToken({
      role: 'admin',
      id: 'admin-expired',
      expiresIn: '-10s',
    });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      },
    });
  });

  test('8) token avec mauvaise audience -> 401', async () => {
    const tokenWrongAudience = buildTestToken({
      role: 'admin',
      id: 'admin-wrong-aud',
      audience: 'external-api',
    });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${tokenWrongAudience}`)
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      },
    });
  });

  test('8b) token avec payload invalide (sans sub/id) -> 401 uniforme', async () => {
    const tokenWithoutSubject = jwt.sign(
      { role: 'admin' },
      process.env.JWT_ACCESS_SECRET,
      {
        algorithm: 'HS256',
        issuer: process.env.JWT_ACCESS_ISSUER,
        audience: process.env.JWT_ACCESS_AUDIENCE,
        expiresIn: '15m',
      },
    );

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${tokenWithoutSubject}`)
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication failed',
      },
    });
  });

  test('9) route admin ne fuit pas les claims auth -> 200', async () => {
    const adminToken = buildTestToken({ role: 'admin', id: 'admin-no-leak' });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
        scope: 'admin',
      },
    });
  });
  
  test('route publique de démo reste accessible sans token -> 200', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
        scope: 'public',
      },
    });
  });
});

describe('Admin example routes strategy (/api/admin/* via mounted example router)', () => {
  test('ops autorisé sur /api/admin/audit-log -> 200', async () => {
    const opsToken = buildTestToken({ role: 'ops', id: 'ops-1' });

    const response = await request(app)
      .get('/api/admin/audit-log')
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        message: 'Audit log data',
      },
    });
  });

  test('ops refusé sur /api/admin/reports -> 403', async () => {
    const opsToken = buildTestToken({ role: 'ops', id: 'ops-2' });

    const response = await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(403);

    expect(response.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  });
});

describe('Role normalization policy', () => {
  test('rôle " admin " est accepté pour une route admin stricte -> 200', async () => {
    const spacedAdminToken = buildTestToken({ role: ' admin ', id: 'admin-spaced' });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${spacedAdminToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
        scope: 'admin',
      },
    });
  });

  test('rôle "Admin" est accepté (case-insensitive) -> 200', async () => {
    const casedAdminToken = buildTestToken({ role: 'Admin', id: 'admin-cased' });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${casedAdminToken}`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
        scope: 'admin',
      },
    });
  });
});

describe('JWT misconfiguration handling', () => {
  const ORIGINAL_ENV = {
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_ACCESS_ISSUER: process.env.JWT_ACCESS_ISSUER,
    JWT_ACCESS_AUDIENCE: process.env.JWT_ACCESS_AUDIENCE,
  };

  afterEach(() => {
    process.env.JWT_ACCESS_SECRET = ORIGINAL_ENV.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_ISSUER = ORIGINAL_ENV.JWT_ACCESS_ISSUER;
    process.env.JWT_ACCESS_AUDIENCE = ORIGINAL_ENV.JWT_ACCESS_AUDIENCE;
  });

  test('secret absent -> 500', async () => {
    process.env.JWT_ACCESS_SECRET = '';
    const validToken = buildTestToken({ secret: ORIGINAL_ENV.JWT_ACCESS_SECRET });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service misconfigured',
      },
    });
  });

  test('issuer sans audience -> 500', async () => {
    process.env.JWT_ACCESS_ISSUER = ORIGINAL_ENV.JWT_ACCESS_ISSUER;
    process.env.JWT_ACCESS_AUDIENCE = '';
    const validToken = buildTestToken({
      issuer: ORIGINAL_ENV.JWT_ACCESS_ISSUER,
      audience: ORIGINAL_ENV.JWT_ACCESS_AUDIENCE,
    });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service misconfigured',
      },
    });
  });

  test('audience sans issuer -> 500', async () => {
    process.env.JWT_ACCESS_ISSUER = '';
    process.env.JWT_ACCESS_AUDIENCE = ORIGINAL_ENV.JWT_ACCESS_AUDIENCE;
    const validToken = buildTestToken({
      issuer: ORIGINAL_ENV.JWT_ACCESS_ISSUER,
      audience: ORIGINAL_ENV.JWT_ACCESS_AUDIENCE,
    });

    const response = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication service misconfigured',
      },
    });
  });
});