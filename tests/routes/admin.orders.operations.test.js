import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import prisma from '../../src/lib/prisma.js';
import { buildTestToken } from '../helpers/jwt.helper.js';

describe('admin orders operations endpoints', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('admin can fetch order timeline with events in ascending order', async () => {
    const adminToken = buildTestToken({ role: 'admin', id: 'admin-ops-1' });

    jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000111',
      status: 'paid',
      totalAmount: '12.00',
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:05:00.000Z',
      events: [
        {
          id: 'evt-1',
          type: 'status_transition',
          fromStatus: 'pending',
          toStatus: 'paid',
          source: 'stripe',
          sourceEventId: 'evt_provider_1',
          idempotencyKey: 'idem_1',
          correlationId: 'corr-1',
          createdAt: '2026-03-03T00:01:00.000Z',
        },
      ],
    });

    const response = await request(app)
      .get('/api/admin/orders/00000000-0000-0000-0000-000000000111/timeline')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.order).toEqual({
      id: '00000000-0000-0000-0000-000000000111',
      status: 'paid',
      totalAmount: '12.00',
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:05:00.000Z',
    });
    expect(response.body.data.events).toHaveLength(1);
    expect(response.body.data.events[0]).toMatchObject({
      id: 'evt-1',
      source: 'stripe',
      fromStatus: 'pending',
      toStatus: 'paid',
    });

    expect(prisma.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '00000000-0000-0000-0000-000000000111' },
      select: expect.objectContaining({
        events: expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
      }),
    }));
  });

  test('non-admin is denied on timeline endpoint', async () => {
    const customerToken = buildTestToken({ role: 'customer', id: 'cust-ops-1' });

    const response = await request(app)
      .get('/api/admin/orders/00000000-0000-0000-0000-000000000111/timeline')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  });

  test('refund endpoint is auth-protected and safely disabled with deterministic 501 for admin', async () => {
    const adminToken = buildTestToken({ role: 'admin', id: 'admin-ops-2' });

    const unauthorized = await request(app)
      .post('/api/admin/refunds')
      .send({ orderId: '00000000-0000-0000-0000-000000000111', reason: 'duplicate' })
      .expect(401);

    expect(unauthorized.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });

    const response = await request(app)
      .post('/api/admin/refunds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId: '00000000-0000-0000-0000-000000000111', reason: 'duplicate' })
      .expect(501);

    expect(response.body.error).toMatchObject({
      code: 'refund_not_supported',
      message: 'Refund capability is not supported',
      requestId: expect.any(String),
    });
  });

  test('timeline returns deterministic 404 when order is missing', async () => {
    const adminToken = buildTestToken({ role: 'admin', id: 'admin-ops-404' });
    jest.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);

    const response = await request(app)
      .get('/api/admin/orders/00000000-0000-0000-0000-000000000404/timeline')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Order not found',
      requestId: expect.any(String),
    });
  });

  test('timeline bubbles unexpected persistence errors as 500', async () => {
    const adminToken = buildTestToken({ role: 'admin', id: 'admin-ops-500' });
    jest.spyOn(prisma.order, 'findUnique').mockRejectedValue(new Error('db exploded'));

    const response = await request(app)
      .get('/api/admin/orders/00000000-0000-0000-0000-000000000500/timeline')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(500);

    expect(response.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'db exploded',
      requestId: expect.any(String),
    });
  });

});