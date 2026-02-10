import request from 'supertest';
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
        message: 'Invalid token',
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

    expect(response.body.data).toMatchObject({
      status: 'ok',
      scope: 'admin',
      auth: {
        sub: 'admin-1',
        role: 'admin',
      },
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
        message: 'Token expired',
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
        message: 'Invalid token',
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