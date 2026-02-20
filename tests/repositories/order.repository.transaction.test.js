import { jest } from '@jest/globals';
import prisma from '../../src/lib/prisma.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function buildPrismaState(overrides = {}) {
  return {
    products: [
      { id: '00000000-0000-0000-0000-000000000001', price: 10, stock: 5, active: true },
      { id: '00000000-0000-0000-0000-000000000002', price: 12, stock: 2, active: true },
    ],
    orders: [],
    orderItems: [],
    webhookEvents: [],
    seq: 0,
    ...overrides,
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function createPrismaMock(state, options = {}) {
  const txFactory = (working) => ({
    product: {
      findMany: jest.fn(async ({ where }) => working.products
        .filter((product) => where.id.in.includes(product.id) && (where.active === undefined || product.active === where.active))
        .map(({ id, price }) => ({ id, price }))),
      updateMany: jest.fn(async ({ where, data }) => {
        if (options.failOnProductUpdate) {
          throw new Error('Prisma update failure');
        }
        const product = working.products.find((candidate) => candidate.id === where.id);
        if (!product || product.stock < where.stock.gte) {
          return { count: 0 };
        }
        product.stock -= data.stock.decrement;
        return { count: 1 };
      }),
    },
    order: {
      create: jest.fn(async ({ data }) => {
        if (options.failOnOrderCreate) {
          throw new Error('Order create failed');
        }
        if (working.orders.some((order) => order.userId === data.userId && order.idempotencyKey === data.idempotencyKey)) {
          const err = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }

        const id = `order-${++working.seq}`;
        const order = { id, ...data, status: data.status || 'pending' };
        working.orders.push(order);
        return order;
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const order = working.orders.find((candidate) => (where.id ? candidate.id === where.id : candidate.idempotencyKey === where.idempotencyKey));
        if (!order) return null;
        if (!include?.items) return order;
        return { ...order, items: working.orderItems.filter((item) => item.orderId === order.id) };
      }),
      findFirst: jest.fn(async ({ where, include }) => {
        const order = working.orders.find((candidate) => {
          const matchesUser = where.userId ? candidate.userId === where.userId : true;
          const matchesKey = where.idempotencyKey ? candidate.idempotencyKey === where.idempotencyKey : true;
          return matchesUser && matchesKey;
        });
        if (!order) return null;
        if (!include?.items) return order;
        return { ...order, items: working.orderItems.filter((item) => item.orderId === order.id) };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
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
      }),
    },
    orderItem: {
      createMany: jest.fn(async ({ data }) => {
        if (options.failOnOrderItemCreateMany) {
          throw new Error('Create many failed');
        }
        working.orderItems.push(...data);
        return { count: data.length };
      }),
    },
    paymentWebhookEvent: {
      create: jest.fn(async ({ data }) => {
        if (options.failOnWebhookCreate) {
          throw new Error('Webhook event insert failed');
        }
        if (working.webhookEvents.some((event) => event.provider === data.provider && event.eventId === data.eventId)) {
          const err = new Error('Unique constraint');
          err.code = 'P2002';
          err.meta = { target: ['provider', 'event_id'] };
          throw err;
        }
        if (data.resourceId && working.webhookEvents.some((event) => event.provider === data.provider && event.resourceId === data.resourceId)) {
          const err = new Error('Unique constraint');
          err.code = 'P2002';
          err.meta = { target: ['provider', 'resource_id'] };
          throw err;
        }
        working.webhookEvents.push(data);
        return data;
      }),
    },
  });

  let queue = Promise.resolve();

  return {
    $transaction: jest.fn(async (callback) => {
      const run = async () => {
        const working = cloneState(state);
        const result = await callback(txFactory(working));
        Object.assign(state, working);
        return result;
      };

      const next = queue.then(run);
      queue = next.catch(() => {});
      return next;
    }),
  };
}

describe('orderRepository transactional guards', () => {
  let state;

  beforeEach(() => {
    state = buildPrismaState();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Cas 1 — succès complet: crée la commande, décrémente le stock et commit', async () => {
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    const result = await orderRepository.createPendingPaymentOrder({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-success-123456',
      stripePaymentIntentId: 'pi_success',
      items: [{ productId: state.products[0].id, quantity: 2 }],
      expectedTotalAmount: 20,
    });

    expect(result.replayed).toBe(false);
    expect(result.order.status).toBe('pending');
    expect(state.products[0].stock).toBe(3);
    expect(state.orders).toHaveLength(1);
    expect(mock.$transaction).toHaveBeenCalledTimes(1);
  });

  test('Cas 2 — stock insuffisant: rollback complet', async () => {
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.createPendingPaymentOrder({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-stock-123456',
      stripePaymentIntentId: 'pi_stock',
      items: [{ productId: state.products[1].id, quantity: 99 }],
    })).rejects.toThrow('Insufficient stock');

    expect(state.orders).toHaveLength(0);
    expect(state.orderItems).toHaveLength(0);
    expect(state.products[1].stock).toBe(2);
  });

  test('Cas 3 — erreur DB pendant update: transaction annulée', async () => {
    const mock = createPrismaMock(state, { failOnProductUpdate: true });
    Object.assign(prisma, mock);

    await expect(orderRepository.createPendingPaymentOrder({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-dberr-123456',
      stripePaymentIntentId: 'pi_dberr',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });

    expect(state.orders).toHaveLength(0);
    expect(state.products[0].stock).toBe(5);
  });

  test('Cas 4 — double paiement: refus explicite et aucune modification', async () => {
    state.orders.push({
      id: 'order-paid',
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-paid-123456',
      stripePaymentIntentId: 'pi_paid',
      status: 'paid',
      totalAmount: 10,
    });
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-already-paid',
      paymentIntentId: 'pi_paid',
      orderId: 'order-paid',
      userId: '00000000-0000-0000-0000-000000000010',
      expectedIdempotencyKey: 'idem-paid-123456',
      payload: {},
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });

    expect(state.orders[0].status).toBe('paid');
    expect(state.webhookEvents).toHaveLength(1);
  });

  test('Cas 5 — montant incohérent: rejet immédiat', async () => {
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.createPendingPaymentOrder({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-amount-123456',
      stripePaymentIntentId: 'pi_amount',
      items: [{ productId: state.products[0].id, quantity: 1 }],
      expectedTotalAmount: 999,
    })).rejects.toThrow('Amount mismatch');

    expect(state.orders).toHaveLength(0);
    expect(state.products[0].stock).toBe(5);
  });

  test('Cas 6 — commande inexistante: erreur propre sans crash', async () => {
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-missing',
      paymentIntentId: 'pi_missing',
      orderId: 'does-not-exist',
      userId: '00000000-0000-0000-0000-000000000010',
      expectedIdempotencyKey: 'idem-missing-123456',
      payload: {},
    })).rejects.toThrow('Order not found');
  });

  test('Cas 7 — concurrence simulée: pas de double décrément', async () => {
    state.products[0].stock = 1;
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    const [first, second] = await Promise.allSettled([
      orderRepository.createPendingPaymentOrder({
        userId: '00000000-0000-0000-0000-000000000010',
        idempotencyKey: 'idem-race-1',
        stripePaymentIntentId: 'pi_race_1',
        items: [{ productId: state.products[0].id, quantity: 1 }],
      }),
      orderRepository.createPendingPaymentOrder({
        userId: '00000000-0000-0000-0000-000000000010',
        idempotencyKey: 'idem-race-2',
        stripePaymentIntentId: 'pi_race_2',
        items: [{ productId: state.products[0].id, quantity: 1 }],
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(state.products[0].stock).toBe(0);
    expect(state.orders).toHaveLength(1);
  });


  test('concurrent double submit with same key yields one write and one replay', async () => {
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    const payload = {
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-concurrent-same-123456',
      stripePaymentIntentId: 'pi_same_key',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    };

    const [first, second] = await Promise.all([
      orderRepository.createPendingPaymentOrder(payload),
      orderRepository.createPendingPaymentOrder(payload),
    ]);

    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(state.orders).toHaveLength(1);
  });

  test('Cas 8 — erreur intermédiaire multi-étapes: rollback strict', async () => {
    const mock = createPrismaMock(state, { failOnOrderItemCreateMany: true });
    Object.assign(prisma, mock);

    await expect(orderRepository.createPendingPaymentOrder({
      userId: '00000000-0000-0000-0000-000000000010',
      idempotencyKey: 'idem-miderr-123456',
      stripePaymentIntentId: 'pi_miderr',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });

    expect(state.orders).toHaveLength(0);
    expect(state.orderItems).toHaveLength(0);
    expect(state.products[0].stock).toBe(5);
  });
});


describe('orderRepository additional branch coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('CRUD wrappers call prisma and normalize db errors', async () => {
    Object.assign(prisma, {
      order: {
        create: jest.fn(async ({ data }) => ({ id: 'o1', ...data })),
        findUnique: jest.fn(async () => ({ id: 'o1', items: [] })),
        update: jest.fn(async ({ data }) => ({ id: 'o1', ...data })),
        delete: jest.fn(async () => ({ id: 'o1' })),
        findMany: jest.fn(async () => [{ id: 'o1', items: [] }]),
      },
    });

    await expect(orderRepository.create({ userId: 'u' })).resolves.toMatchObject({ id: 'o1' });
    await expect(orderRepository.findById('o1')).resolves.toMatchObject({ id: 'o1' });
    await expect(orderRepository.update('o1', { status: 'paid' })).resolves.toMatchObject({ status: 'paid' });
    await expect(orderRepository.delete('o1')).resolves.toMatchObject({ id: 'o1' });
    await expect(orderRepository.list({})).resolves.toHaveLength(1);

    prisma.order.create.mockRejectedValueOnce(new Error('db create'));
    await expect(orderRepository.create({})).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });
  });

  test('createIdempotentWithItemsAndUpdateStock handles product not found and replay', async () => {
    const state = buildPrismaState();
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({
      userId: 'u',
      idempotencyKey: 'idem-missing-product-123456',
      items: [{ productId: state.products[0].id, quantity: 1 }, { productId: 'missing', quantity: 1 }],
    })).rejects.toThrow('Product not found');

    const okPayload = {
      userId: 'u',
      idempotencyKey: 'idem-replay-123456',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    };
    await expect(orderRepository.createIdempotentWithItemsAndUpdateStock(okPayload)).resolves.toMatchObject({ replayed: false });
    await expect(orderRepository.createIdempotentWithItemsAndUpdateStock(okPayload)).resolves.toMatchObject({ replayed: true });
  });

  test('createPendingPaymentOrder replay P2002 and invalid expected amount', async () => {
    const state = buildPrismaState();
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    const payload = {
      userId: 'u',
      idempotencyKey: 'idem-pending-replay-123456',
      stripePaymentIntentId: 'pi-pending-1',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    };

    await expect(orderRepository.createPendingPaymentOrder(payload)).resolves.toMatchObject({ replayed: false });
    await expect(orderRepository.createPendingPaymentOrder(payload)).resolves.toMatchObject({ replayed: true });

    await expect(orderRepository.createPendingPaymentOrder({
      ...payload,
      idempotencyKey: 'idem-invalid-amount-123456',
      expectedTotalAmount: -1,
    })).rejects.toThrow('Invalid expected total amount');
  });

  test('markPaidFromWebhook handles replay and metadata mismatch', async () => {
    const state = buildPrismaState();
    state.orders.push({
      id: 'order-1',
      userId: 'user-1',
      idempotencyKey: 'idem-1',
      stripePaymentIntentId: 'pi-1',
      status: 'pending',
      totalAmount: 10,
    });
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-mark-1',
      paymentIntentId: 'pi-1',
      orderId: 'order-1',
      userId: 'wrong-user',
      expectedIdempotencyKey: 'idem-1',
      payload: {},
    })).rejects.toThrow('Webhook metadata mismatch');

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-replay',
      paymentIntentId: 'pi-1',
      orderId: 'order-1',
      userId: 'user-1',
      expectedIdempotencyKey: 'idem-1',
      payload: {},
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-replay',
      paymentIntentId: 'pi-1',
      orderId: 'order-1',
      userId: 'user-1',
      expectedIdempotencyKey: 'idem-1',
      payload: {},
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });

  test('processPaymentWebhookEvent covers replay, mismatch and paymentIntent path', async () => {
    const state = buildPrismaState();
    state.orders.push({
      id: 'order-1',
      userId: 'user-1',
      idempotencyKey: 'idem-1',
      stripePaymentIntentId: 'pi-1',
      status: 'pending',
      totalAmount: 10,
    });
    const mock = createPrismaMock(state);
    Object.assign(prisma, mock);

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-process-mismatch',
      orderId: 'order-1',
      payload: { metadata: { idempotencyKey: 'wrong' } },
    })).rejects.toThrow('Webhook idempotency key mismatch');

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-process-ok',
      stripePaymentIntentId: 'pi-1',
      payload: {},
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-process-ok',
      stripePaymentIntentId: 'pi-1',
      payload: {},
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });

  test('non-P2002 errors inside transactions are propagated via normalizeDbError', async () => {
    const state = buildPrismaState();

    Object.assign(prisma, createPrismaMock(state, { failOnOrderCreate: true }));
    await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({
      userId: 'u',
      idempotencyKey: 'idem-create-fail-123456',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });

    Object.assign(prisma, createPrismaMock(state, { failOnWebhookCreate: true }));
    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-fail-1',
      paymentIntentId: 'pi_x',
      orderId: 'missing',
      userId: 'u',
      expectedIdempotencyKey: 'idem',
      payload: {},
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-fail-2',
      stripePaymentIntentId: 'pi_x',
      payload: {},
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });
  });

  test('createPendingPaymentOrder product missing and generic create error are handled', async () => {
    const state = buildPrismaState();
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.createPendingPaymentOrder({
      userId: 'u',
      idempotencyKey: 'idem-missing-pp-123456',
      stripePaymentIntentId: 'pi-a',
      items: [{ productId: state.products[0].id, quantity: 1 }, { productId: 'missing', quantity: 1 }],
    })).rejects.toThrow('Product not found');

    Object.assign(prisma, createPrismaMock(state, { failOnOrderCreate: true }));
    await expect(orderRepository.createPendingPaymentOrder({
      userId: 'u',
      idempotencyKey: 'idem-create-pp-fail-123456',
      stripePaymentIntentId: 'pi-b',
      items: [{ productId: state.products[0].id, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });
  });


  test('webhook transaction abort after event insert rolls back and fails closed', async () => {
    const state = buildPrismaState({
      orders: [{
        id: 'order-webhook-abort',
        userId: 'user-abort',
        idempotencyKey: 'idem-webhook-abort',
        stripePaymentIntentId: 'pi-webhook-abort',
        status: 'pending',
        totalAmount: 10,
      }],
    });

    const clone = (value) => JSON.parse(JSON.stringify(value));
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback) => {
        const working = clone(state);
        const tx = {
          paymentWebhookEvent: {
            create: jest.fn(async ({ data }) => {
              working.webhookEvents.push(data);
              return data;
            }),
          },
          order: {
            findUnique: jest.fn(async () => {
              throw new Error('lookup exploded');
            }),
            updateMany: jest.fn(async () => ({ count: 0 })),
          },
        };

        const result = await callback(tx);
        Object.assign(state, working);
        return result;
      }),
    });

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-webhook-abort',
      paymentIntentId: 'pi-webhook-abort',
      orderId: 'order-webhook-abort',
      userId: 'user-abort',
      expectedIdempotencyKey: 'idem-webhook-abort',
      payload: {},
    })).rejects.toMatchObject({ code: 'DB_OPERATION_FAILED', statusCode: 500 });

    expect(state.orders[0].status).toBe('pending');
    expect(state.webhookEvents).toHaveLength(0);
  });

  test('processPaymentWebhookEvent rejects already paid order when metadata provided', async () => {
    const state = buildPrismaState({
      orders: [{
        id: 'order-paid-process',
        userId: 'u',
        idempotencyKey: 'idem-paid-process',
        stripePaymentIntentId: 'pi-paid-process',
        status: 'paid',
        totalAmount: 10,
      }],
    });
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-paid-process',
      orderId: 'order-paid-process',
      payload: { metadata: { idempotencyKey: 'idem-paid-process' } },
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });



  test('cross-axis webhook dedupe blocks duplicate payment by resource id', async () => {
    const state = buildPrismaState({
      orders: [{
        id: 'order-cross-axis',
        userId: 'user-1',
        idempotencyKey: 'idem-cross-axis',
        stripePaymentIntentId: 'pi-cross-axis',
        status: 'pending',
        totalAmount: 10,
      }],
    });
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-cross-axis-1',
      paymentIntentId: 'pi-cross-axis',
      orderId: 'order-cross-axis',
      userId: 'user-1',
      expectedIdempotencyKey: 'idem-cross-axis',
      payload: { data: { object: { id: 'pi-cross-axis' } } },
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-cross-axis-2',
      paymentIntentId: 'pi-cross-axis',
      orderId: 'order-cross-axis',
      userId: 'user-1',
      expectedIdempotencyKey: 'idem-cross-axis',
      payload: { data: { object: { id: 'pi-cross-axis' } } },
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });

  test('list default params and processPaymentWebhookEvent orderId path are covered', async () => {
    Object.assign(prisma, {
      order: {
        findMany: jest.fn(async () => []),
      },
    });
    await expect(orderRepository.list()).resolves.toEqual([]);

    const state = buildPrismaState({
      orders: [{
        id: 'order-process-id-only',
        userId: 'u',
        idempotencyKey: 'idem-process-id-only',
        stripePaymentIntentId: 'pi-process-id-only',
        status: 'pending',
        totalAmount: 10,
      }],
    });
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-process-id-only',
      orderId: 'order-process-id-only',
      payload: {},
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });
  });


  test('default parameter paths for webhook handlers are executed', async () => {
    const state = buildPrismaState({
      orders: [{
        id: 'order-defaults',
        userId: 'user-defaults',
        idempotencyKey: 'idem-defaults-123456',
        stripePaymentIntentId: null,
        status: 'pending',
        totalAmount: 10,
      }],
    });
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.markPaidFromWebhook({
      eventId: 'evt-default-mark',
      paymentIntentId: null,
      orderId: 'order-defaults',
      userId: 'user-defaults',
      expectedIdempotencyKey: 'idem-defaults-123456',
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });

    state.orders.push({
      id: 'order-defaults-2',
      userId: 'user-defaults',
      idempotencyKey: 'idem-defaults-654321',
      stripePaymentIntentId: 'pi-default-2',
      status: 'pending',
      totalAmount: 10,
    });

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'stripe',
      eventId: 'evt-default-process',
      stripePaymentIntentId: 'pi-default-2',
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });
  });



  test('markPaidFromWebhook does not mutate order total amount', async () => {
    const state = buildPrismaState({
      orders: [{
        id: 'order-total-immutable',
        userId: 'u',
        idempotencyKey: 'idem-total-immutable',
        stripePaymentIntentId: 'pi-total-immutable',
        status: 'pending',
        totalAmount: 123.45,
      }],
    });
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.markPaidFromWebhook({
      provider: 'stripe',
      eventId: 'evt-total-immutable',
      paymentIntentId: 'pi-total-immutable',
      orderId: 'order-total-immutable',
      userId: 'u',
      expectedIdempotencyKey: 'idem-total-immutable',
      payload: {},
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });

    expect(state.orders[0].totalAmount).toBe(123.45);
  });

  test('paypal resource id dedupe prevents second distinct event for same capture', async () => {
    const state = buildPrismaState({
      orders: [{
        id: 'order-paypal-resource',
        userId: 'user-pp',
        idempotencyKey: 'idem-paypal-resource',
        stripePaymentIntentId: null,
        status: 'pending',
        totalAmount: 12,
      }],
    });
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'paypal',
      eventId: 'evt-paypal-resource-1',
      orderId: 'order-paypal-resource',
      payload: { payload: { capture: { id: 'cap-1' } } },
    })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'paypal',
      eventId: 'evt-paypal-resource-2',
      orderId: 'order-paypal-resource',
      payload: { payload: { capture: { id: 'cap-1' } } },
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });

  test('unique violation with string target is treated as replay', async () => {
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback) => callback({
        paymentWebhookEvent: {
          create: jest.fn(async () => {
            const err = new Error('Unique constraint');
            err.code = 'P2002';
            err.meta = { target: 'resource_id' };
            throw err;
          }),
        },
        order: {
          findUnique: jest.fn(),
          updateMany: jest.fn(),
        },
      })),
    });

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'custom-provider',
      eventId: 'evt-custom-1',
      payload: {},
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });


  test('expectedTotalAmountMinor validation branches are enforced', async () => {
    const state = buildPrismaState();
    Object.assign(prisma, createPrismaMock(state));

    await expect(orderRepository.createPendingPaymentOrder({
      userId: 'u',
      idempotencyKey: 'idem-exp-minor-invalid-123456',
      stripePaymentIntentId: 'pi-exp-minor-invalid',
      expectedTotalAmountMinor: -1,
      items: [{ productId: state.products[0].id, quantity: 1 }],
    })).rejects.toThrow('Invalid expected total amount');

    await expect(orderRepository.createPendingPaymentOrder({
      userId: 'u',
      idempotencyKey: 'idem-exp-minor-mismatch-123456',
      stripePaymentIntentId: 'pi-exp-minor-mismatch',
      expectedTotalAmountMinor: 1,
      items: [{ productId: state.products[0].id, quantity: 1 }],
    })).rejects.toThrow('Amount mismatch');
  });

  test('non-targeted unique error falls through to DB conflict mapping', async () => {
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback) => callback({
        paymentWebhookEvent: {
          create: jest.fn(async () => {
            const err = new Error('Unique constraint');
            err.code = 'P2002';
            err.meta = { target: ['other_field'] };
            throw err;
          }),
        },
        order: {
          findUnique: jest.fn(),
          updateMany: jest.fn(),
        },
      })),
    });

    await expect(orderRepository.processPaymentWebhookEvent({
      provider: 'custom-provider',
      eventId: 'evt-custom-conflict',
      payload: {},
    })).resolves.toEqual({ replayed: true, orderMarkedPaid: false });
  });
  
});