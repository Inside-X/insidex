import { jest } from '@jest/globals';
import prisma from '../../src/lib/prisma.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function seedState() {
  return {
    products: [
      { id: '10000000-0000-0000-0000-000000000001', price: 50, stock: 2, active: true },
    ],
    orders: [],
    orderItems: [],
    webhookEvents: [],
    seq: 0,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function attachIsolatedPrisma(state) {
  const tx = (working) => ({
    product: {
      findMany: async ({ where }) => working.products
        .filter((p) => where.id.in.includes(p.id) && (where.active === undefined || p.active === where.active))
        .map(({ id, price }) => ({ id, price })),
      updateMany: async ({ where, data }) => {
        const product = working.products.find((p) => p.id === where.id);
        if (!product || product.stock < where.stock.gte) return { count: 0 };
        product.stock -= data.stock.decrement;
        return { count: 1 };
      },
    },
    order: {
      create: async ({ data }) => {
        if (working.orders.some((o) => o.idempotencyKey === data.idempotencyKey)) {
          const e = new Error('Unique');
          e.code = 'P2002';
          throw e;
        }
        const order = { id: `ord-${++working.seq}`, ...data, status: data.status || 'pending' };
        working.orders.push(order);
        return order;
      },
      findUnique: async ({ where, include }) => {
        const order = working.orders.find((o) => (where.id ? o.id === where.id : o.idempotencyKey === where.idempotencyKey));
        if (!order) return null;
        if (!include?.items) return order;
        return { ...order, items: working.orderItems.filter((i) => i.orderId === order.id) };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const order of working.orders) {
          const idOk = where.id ? order.id === where.id : true;
          const piOk = where.stripePaymentIntentId ? order.stripePaymentIntentId === where.stripePaymentIntentId : true;
          const statusOk = where.status?.not ? order.status !== where.status.not : true;
          if (idOk && piOk && statusOk) {
            Object.assign(order, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    orderItem: {
      createMany: async ({ data }) => {
        working.orderItems.push(...data);
        return { count: data.length };
      },
    },
    paymentWebhookEvent: {
      create: async ({ data }) => {
        if (working.webhookEvents.some((e) => e.eventId === data.eventId)) {
          const err = new Error('Unique');
          err.code = 'P2002';
          throw err;
        }
        working.webhookEvents.push(data);
        return data;
      },
    },
  });

  let queue = Promise.resolve();
  Object.assign(prisma, {
    $transaction: jest.fn(async (cb) => {
      const run = async () => {
        const working = clone(state);
        const result = await cb(tx(working));
        Object.assign(state, working);
        return result;
      };
      const next = queue.then(run);
      queue = next.catch(() => {});
      return next;
    }),
  });
}

describe('order transaction integration (isolated in-memory DB)', () => {
  let state;

  beforeEach(() => {
    state = seedState();
    attachIsolatedPrisma(state);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('crée une commande réelle et met à jour le stock', async () => {
    const created = await orderRepository.createPendingPaymentOrder({
      userId: '20000000-0000-0000-0000-000000000001',
      idempotencyKey: 'integ-create-123456',
      stripePaymentIntentId: 'pi_integ_1',
      items: [{ productId: state.products[0].id, quantity: 1 }],
      expectedTotalAmount: 50,
    });

    expect(created.replayed).toBe(false);
    expect(state.products[0].stock).toBe(1);
    expect(state.orders).toHaveLength(1);
    expect(state.orderItems).toHaveLength(1);
  });

  test('refuse une tentative de double paiement', async () => {
    const created = await orderRepository.createPendingPaymentOrder({
      userId: '20000000-0000-0000-0000-000000000001',
      idempotencyKey: 'integ-paid-123456',
      stripePaymentIntentId: 'pi_integ_paid',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    });

    const first = await orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt_integ_1',
      paymentIntentId: 'pi_integ_paid',
      orderId: created.order.id,
      userId: '20000000-0000-0000-0000-000000000001',
      expectedIdempotencyKey: 'integ-paid-123456',
      payload: {},
    });

    expect(first).toEqual({ replayed: false, orderMarkedPaid: true });

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt_integ_2',
      paymentIntentId: 'pi_integ_paid',
      orderId: created.order.id,
      userId: '20000000-0000-0000-0000-000000000001',
      expectedIdempotencyKey: 'integ-paid-123456',
      payload: {},
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('charge concurrente simple: protège le stock', async () => {
    state.products[0].stock = 1;

    const results = await Promise.allSettled([
      orderRepository.createPendingPaymentOrder({
        userId: '20000000-0000-0000-0000-000000000001',
        idempotencyKey: 'integ-race-1',
        stripePaymentIntentId: 'pi_integ_race_1',
        items: [{ productId: state.products[0].id, quantity: 1 }],
      }),
      orderRepository.createPendingPaymentOrder({
        userId: '20000000-0000-0000-0000-000000000001',
        idempotencyKey: 'integ-race-2',
        stripePaymentIntentId: 'pi_integ_race_2',
        items: [{ productId: state.products[0].id, quantity: 1 }],
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(state.products[0].stock).toBe(0);
    expect(state.orders).toHaveLength(1);
  });
});