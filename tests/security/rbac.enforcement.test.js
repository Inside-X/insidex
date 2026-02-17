import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';

describe('RBAC enforcement', () => {
  test('admin is allowed', async () => {
    const token = buildTestToken({ role: 'admin', id: 'admin-1' });
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('customer is blocked', async () => {
    const token = buildTestToken({ role: 'customer', id: 'user-1' });
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('admin endpoints are guarded', async () => {
    const res = await request(app).get('/api/admin/health');
    expect(res.status).toBe(401);
  });

  test('missing permission is blocked', async () => {
    const token = buildTestToken({ role: 'ops', id: 'ops-1' });
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});