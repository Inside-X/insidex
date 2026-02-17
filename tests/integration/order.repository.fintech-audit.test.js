import { jest } from '@jest/globals';
import prisma from '../../src/lib/prisma.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function buildPrismaState() {
  return {
    products: [
      { id: '00000000-0000-0000-0000-000000000001', price: 10, stock: 5 },
      { id: '00000000-0000-0000-0000-000000000002', price: 12, stock: 5 },
    ],
    orders: [],
    orderItems: [],
    webhookEvents: [],
    seq: 0,
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function createPrismaMock(state) {
  const txFactory = (working) => ({
    product: {
      findMany: async ({ where }) => working.products.filter((product) => where.id.in.includes(product.id)).map(({ id, price }) => ({ id, price })),
      updateMany: async ({ where, data }) => {
        const product = working.products.find((candidate) => candidate.id === where.id);
        if (!product || product.stock < where.stock.gte) {
          return { count: 0 };
        }
        product.stock -= data.stock.decrement;
        return { count: 1 };
      },
    },
    order: {
      create: async ({ data }) => {
        if (working.orders.some((order) => order.idempotencyKey === data.idempotencyKey)) {
          const err = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        if (data.stripePaymentIntentId && working.orders.some((order) => order.stripePaymentIntentId === data.stripePaymentIntentId)) {
          const err = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        const id = `order-${++working.seq}`;
        const order = { id, ...data, status: data.status || 'pending' };
        working.orders.push(order);
        return order;
      },
      findUnique: async ({ where, include }) => {
        const order = working.orders.find((candidate) => (where.id ? candidate.id === where.id : candidate.idempotencyKey === where.idempotencyKey));
        if (!order) {
          return null;
        }
        if (!include?.items) {
          return order;
        }
        return {
          ...order,
          items: working.orderItems.filter((item) => item.orderId === order.id),
        };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const order of working.orders) {
          const matchesId = where.id ? order.id === where.id : true;
          const matchesIntent = where.stripePaymentIntentId ? order.stripePaymentIntentId === where.stripePaymentIntentId : true;
          const matchesStatus = where.status?.not ? order.status !== where.status.not : true;
          if (matchesId && matchesIntent && matchesStatus) {
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
        if (working.webhookEvents.some((event) => event.eventId === data.eventId)) {
          const err = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        working.webhookEvents.push(data);
        return data;
      },
    },
  });

  let queue = Promise.resolve();

  return {
    $transaction: async (callback) => {
      const run = async () => {
        const working = cloneState(state);
        const result = await callback(txFactory(working));
        Object.assign(state, working);
        return result;
      };

      const next = queue.then(run);
      queue = next.catch(() => {});
      return next;
    },
  };
}

describe('Order repository fintech audit', () => {
  let state;

  beforeEach(() => {
    state = buildPrismaState();
    Object.assign(prisma, createPrismaMock(state));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('idempotency replay returns existing order and does not duplicate stock decrement', async () => {
    const payload = {
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-1234567890',
      items: [{ productId: state.products[0].id, quantity: 2 }],
    };

    const first = await orderRepository.createIdempotentWithItemsAndUpdateStock(payload);
    const second = await orderRepository.createIdempotentWithItemsAndUpdateStock(payload);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(state.orders).toHaveLength(1);
    expect(state.products[0].stock).toBe(3);
    expect(state.orders[0].totalAmount).toBe('20.00');
    expect(state.orderItems[0].unitPrice).toBe('10.00');
  });

  test('stores totals with deterministic decimal string from minor units', async () => {
    state.products[0].price = '10.005';

    await orderRepository.createPendingPaymentOrder({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-money-minor-units-10005',
      stripePaymentIntentId: 'pi_minor_10005',
      items: [{ productId: state.products[0].id, quantity: 3 }],
    });

    expect(state.orders[0].totalAmount).toBe('30.03');
    expect(state.orderItems[0].unitPrice).toBe('10.01');
  });

  test('oversell under contention never decrements below zero and rejects extra orders', async () => {
    const productId = state.products[0].id;
    const base = {
      userId: '00000000-0000-0000-0000-000000000010',
      items: [{ productId, quantity: 1 }],
    };

    const results = await Promise.allSettled(
      Array.from({ length: 50 }).map((_, index) => orderRepository.createIdempotentWithItemsAndUpdateStock({
        ...base,
        idempotencyKey: `idem-race-${index}`,
      })),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    expect(fulfilled).toBe(5);
    expect(state.products[0].stock).toBe(0);
    expect(state.orders).toHaveLength(5);
  });

  test('multi-item stock failure rolls back entire transaction', async () => {
    await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-rollback-123456',
      items: [
        { productId: state.products[0].id, quantity: 1 },
        { productId: state.products[1].id, quantity: 999 },
      ],
    })).rejects.toThrow('Insufficient stock for product');

    expect(state.orders).toHaveLength(0);
    expect(state.products[0].stock).toBe(5);
    expect(state.products[1].stock).toBe(5);
  });

  test('webhook replay is a no-op and order paid status is set once', async () => {
    await orderRepository.createIdempotentWithItemsAndUpdateStock({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-webhook-123456',
      stripePaymentIntentId: 'pi_abc_123',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    });

    const first = await orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt_1',
      stripePaymentIntentId: 'pi_abc_123',
      payload: { test: true },
    });

    const second = await orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt_1',
      stripePaymentIntentId: 'pi_abc_123',
      payload: { test: true },
    });

    expect(first).toEqual({ replayed: false, orderMarkedPaid: true });
    expect(second).toEqual({ replayed: true, orderMarkedPaid: false });
    expect(state.orders[0].status).toBe('paid');
    expect(state.webhookEvents).toHaveLength(1);
  });
});