import { jest } from '@jest/globals';

async function loadOrderRepository({ toMinorUnitsImpl, fromMinorUnitsImpl, normalizeImpl } = {}) {
  jest.resetModules();

  const tx = {
    product: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    orderItem: {
      createMany: jest.fn(),
    },
    paymentWebhookEvent: {
      create: jest.fn(),
    },
  };

  const prismaMock = {
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };

  const normalizeDbError = jest.fn(normalizeImpl || ((error) => {
    throw error;
  }));

  const minorUnits = await import('../../src/utils/minor-units.js');
  const toMinorUnits = toMinorUnitsImpl ? jest.fn(toMinorUnitsImpl) : jest.spyOn(minorUnits, 'toMinorUnits');
  const fromMinorUnits = fromMinorUnitsImpl ? jest.fn(fromMinorUnitsImpl) : jest.spyOn(minorUnits, 'fromMinorUnits');

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { orderRepository } = await import('../../src/repositories/order.repository.js');
  return { orderRepository, prismaMock, tx, normalizeDbError, toMinorUnits, fromMinorUnits };
}

describe('orderRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('basic CRUD/list', () => {
    test.each([
      ['create', 'create', [{ userId: 'u1' }], { data: { userId: 'u1' } }, 'create'],
      ['findById', 'findUnique', ['o1'], { where: { id: 'o1' }, include: { items: true } }, 'findById'],
      ['update', 'update', ['o1', { status: 'paid' }], { where: { id: 'o1' }, data: { status: 'paid' } }, 'update'],
      ['delete', 'delete', ['o1'], { where: { id: 'o1' } }, 'delete'],
    ])('%s success and failure', async (method, op, args, expectedCall, operation) => {
      const { orderRepository, prismaMock, normalizeDbError } = await loadOrderRepository();
      prismaMock.order[op].mockResolvedValueOnce({ id: 'ok' });
      await expect(orderRepository[method](...args)).resolves.toEqual({ id: 'ok' });
      expect(prismaMock.order[op]).toHaveBeenCalledWith(expectedCall);

      const err = new Error('db fail');
      prismaMock.order[op].mockRejectedValueOnce(err);
      await expect(orderRepository[method](...args)).rejects.toThrow(err);
      expect(normalizeDbError).toHaveBeenLastCalledWith(err, { repository: 'order', operation });
    });

    test('list default and explicit params + failure', async () => {
      const { orderRepository, prismaMock, normalizeDbError } = await loadOrderRepository();
      prismaMock.order.findMany.mockResolvedValueOnce([{ id: 'o1' }]).mockResolvedValueOnce([]);

      await expect(orderRepository.list()).resolves.toEqual([{ id: 'o1' }]);
      expect(prismaMock.order.findMany).toHaveBeenNthCalledWith(1, {
        skip: 0,
        take: 50,
        where: {},
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });

      const params = { skip: 2, take: 1000, where: { status: 'pending' }, orderBy: { createdAt: 'asc' } };
      await expect(orderRepository.list(params)).resolves.toEqual([]);
      expect(prismaMock.order.findMany).toHaveBeenNthCalledWith(2, { ...params, include: { items: true } });

      const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      prismaMock.order.findMany.mockRejectedValueOnce(err);
      await expect(orderRepository.list(params)).rejects.toThrow(err);
      expect(normalizeDbError).toHaveBeenLastCalledWith(err, { repository: 'order', operation: 'list' });
    });
  });

  describe('createIdempotentWithItemsAndUpdateStock', () => {
    test('success path merges duplicate items, decrements stock, and creates order items', async () => {
      const { orderRepository, tx, fromMinorUnits } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([
        { id: 'a', price: '2.50' },
        { id: 'b', price: '1.00' },
      ]);
      tx.order.create.mockResolvedValueOnce({ id: 'order-1' });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.orderItem.createMany.mockResolvedValueOnce({ count: 2 });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'order-1', items: [{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 1 }] });

      const result = await orderRepository.createIdempotentWithItemsAndUpdateStock({
        userId: 'u1',
        idempotencyKey: 'idem1',
        stripePaymentIntentId: null,
        status: 'pending',
        items: [
          { productId: 'b', quantity: 1 },
          { productId: 'a', quantity: 1 },
          { productId: 'a', quantity: 2 },
        ],
      });

      expect(result).toEqual({ order: { id: 'order-1', items: [{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 1 }] }, replayed: false });
      expect(fromMinorUnits).toHaveBeenCalledWith(850);
      expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 'a', stock: { gte: 3 } } }));
      expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: 'b', stock: { gte: 1 } } }));
    });

    test('returns replayed=true when idempotency conflict occurs (P2002)', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'a', price: '1.00' }]);
      tx.order.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
      tx.order.findUnique.mockResolvedValueOnce({ id: 'existing-order' });

      await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({
        userId: 'u1', items: [{ productId: 'a', quantity: 1 }], idempotencyKey: 'idem1',
      })).resolves.toEqual({ order: { id: 'existing-order' }, replayed: true });
    });

    test('throws not found when one product is missing', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'a', price: '1.00' }]);

      await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({
        userId: 'u1', idempotencyKey: 'idem1', items: [{ productId: 'a', quantity: 1 }, { productId: 'missing', quantity: 1 }],
      })).rejects.toMatchObject({ message: 'Product not found: missing', statusCode: 404 });
    });

    test('throws insufficient stock when updateMany count is not 1', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'a', price: '1.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o1' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({
        userId: 'u1', items: [{ productId: 'a', quantity: 2 }], idempotencyKey: 'idem2',
      })).rejects.toMatchObject({ message: 'Insufficient stock for product: a', statusCode: 400 });
    });

    test('normalizes unexpected create conflict and transaction errors', async () => {
      const { orderRepository, tx, normalizeDbError } = await loadOrderRepository();
      const deadlock = Object.assign(new Error('deadlock'), { code: '40P01' });
      tx.product.findMany.mockResolvedValueOnce([{ id: 'a', price: '1.00' }]);
      tx.order.create.mockRejectedValueOnce(deadlock);

      await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({ userId: 'u1', items: [{ productId: 'a', quantity: 1 }], idempotencyKey: 'idem3' })).rejects.toThrow(deadlock);
      expect(normalizeDbError).toHaveBeenCalledWith(deadlock, { repository: 'order', operation: 'createIdempotentWithItemsAndUpdateStock' });
    });

    test('normalizes failure in createMany after stock update', async () => {
      const { orderRepository, tx, normalizeDbError } = await loadOrderRepository();
      const dbError = new Error('network connection dropped');
      tx.product.findMany.mockResolvedValueOnce([{ id: 'a', price: '1.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o2' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.orderItem.createMany.mockRejectedValueOnce(dbError);

      await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({ userId: 'u1', items: [{ productId: 'a', quantity: 1 }], idempotencyKey: 'idem4' })).rejects.toThrow(dbError);
      expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'order', operation: 'createIdempotentWithItemsAndUpdateStock' });
    });

    test('normalizes conversion failure from toMinorUnits', async () => {
      const { orderRepository, tx, normalizeDbError } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'a', price: 'invalid-price' }]);

      await expect(orderRepository.createIdempotentWithItemsAndUpdateStock({ userId: 'u1', items: [{ productId: 'a', quantity: 1 }], idempotencyKey: 'idem5' })).rejects.toThrow('invalid price');
      expect(normalizeDbError).toHaveBeenCalledWith(expect.any(Error), { repository: 'order', operation: 'createIdempotentWithItemsAndUpdateStock' });
    });
  });

  describe('createPendingPaymentOrder', () => {
    test('success path without expected amount checks', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o1' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.orderItem.createMany.mockResolvedValueOnce({ count: 1 });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o1', items: [{ productId: 'p1', quantity: 2 }] });

      const result = await orderRepository.createPendingPaymentOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 2 }],
        idempotencyKey: 'idem-p1',
        stripePaymentIntentId: 'pi_1',
      });

      expect(result.replayed).toBe(false);
      expect(result.order.id).toBe('o1');
    });

    test.each([
      [{ expectedTotalAmountMinor: -1 }, 'Invalid expected total amount'],
      [{ expectedTotalAmountMinor: 12.5 }, 'Invalid expected total amount'],
      [{ expectedTotalAmountMinor: 123 }, 'Amount mismatch: expected 123, computed 200'],
      [{ expectedTotalAmount: '9.99' }, 'Amount mismatch: expected 999, computed 200'],
    ])('expected amount guard rejects invalid payload: %o', async (expectation, message) => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);

      await expect(orderRepository.createPendingPaymentOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 1 }],
        idempotencyKey: `idem-${message}`,
        stripePaymentIntentId: 'pi_1',
        ...expectation,
      })).rejects.toMatchObject({ message, statusCode: 400 });
    });


    test('expectedTotalAmount conversion failure maps to invalid expected total amount', async () => {
      const { orderRepository, tx } = await loadOrderRepository({
        toMinorUnitsImpl: (amount) => {
          if (String(amount) === 'abc') {
            throw new Error('invalid amount format');
          }
          return 0;
        },
      });
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);

      await expect(orderRepository.createPendingPaymentOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 1 }],
        idempotencyKey: 'idem-bad-amount',
        stripePaymentIntentId: 'pi_1',
        expectedTotalAmount: 'abc',
      })).rejects.toMatchObject({ statusCode: 400, message: 'Invalid expected total amount' });
    });

    test('expectedTotalAmountMinor exact match returns early and allows order creation', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o4' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.orderItem.createMany.mockResolvedValueOnce({ count: 1 });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o4', items: [] });

      await expect(orderRepository.createPendingPaymentOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 1 }],
        idempotencyKey: 'idem-match-minor',
        stripePaymentIntentId: 'pi_4',
        expectedTotalAmountMinor: 200,
      })).resolves.toMatchObject({ replayed: false, order: { id: 'o4' } });
    });


    test('expectedTotalAmount exact match passes non-minor comparison branch', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o-match' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.orderItem.createMany.mockResolvedValueOnce({ count: 1 });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o-match', items: [] });

      await expect(orderRepository.createPendingPaymentOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 1 }],
        idempotencyKey: 'idem-match-decimal',
        stripePaymentIntentId: 'pi-decimal',
        expectedTotalAmount: '2.00',
      })).resolves.toMatchObject({ replayed: false, order: { id: 'o-match' } });
    });

    test('accepts null expectedTotalAmount as no-op and creates order', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o2' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.orderItem.createMany.mockResolvedValueOnce({ count: 1 });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o2', items: [] });

      await expect(orderRepository.createPendingPaymentOrder({
        userId: 'u1', items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'idem-null', stripePaymentIntentId: 'pi_2', expectedTotalAmount: null,
      })).resolves.toMatchObject({ replayed: false, order: { id: 'o2' } });
    });

    test('idempotent replay path when order create raises P2002', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
      tx.order.findUnique.mockResolvedValueOnce({ id: 'existing', items: [] });

      await expect(orderRepository.createPendingPaymentOrder({
        userId: 'u1', items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'idem-p2002', stripePaymentIntentId: 'pi_3',
      })).resolves.toEqual({ order: { id: 'existing', items: [] }, replayed: true });
    });

    test('product missing, stock failure, and unexpected create failure normalize correctly', async () => {
      const { orderRepository, tx, normalizeDbError } = await loadOrderRepository();

      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      await expect(orderRepository.createPendingPaymentOrder({ userId: 'u1', items: [{ productId: 'p1', quantity: 1 }, { productId: 'missing', quantity: 1 }], idempotencyKey: 'idem-miss', stripePaymentIntentId: 'pi' }))
        .rejects.toMatchObject({ statusCode: 404, message: 'Product not found: missing' });

      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockResolvedValueOnce({ id: 'o3' });
      tx.product.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(orderRepository.createPendingPaymentOrder({ userId: 'u1', items: [{ productId: 'p1', quantity: 2 }], idempotencyKey: 'idem-stock', stripePaymentIntentId: 'pi' }))
        .rejects.toMatchObject({ statusCode: 400, message: 'Insufficient stock for product: p1' });

      const serializationConflict = Object.assign(new Error('serialization'), { code: 'P2034' });
      tx.product.findMany.mockResolvedValueOnce([{ id: 'p1', price: '2.00' }]);
      tx.order.create.mockRejectedValueOnce(serializationConflict);
      await expect(orderRepository.createPendingPaymentOrder({ userId: 'u1', items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'idem-ser', stripePaymentIntentId: 'pi' }))
        .rejects.toThrow(serializationConflict);

      expect(normalizeDbError).toHaveBeenLastCalledWith(serializationConflict, { repository: 'order', operation: 'createPendingPaymentOrder' });
    });

    test('concurrent duplicate idempotency requests: one created, one replayed', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.product.findMany.mockResolvedValue([{ id: 'p1', price: '1.00' }]);
      tx.order.create
        .mockResolvedValueOnce({ id: 'new-order' })
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.orderItem.createMany.mockResolvedValue({ count: 1 });
      tx.order.findUnique
        .mockResolvedValueOnce({ id: 'new-order', items: [] })
        .mockResolvedValueOnce({ id: 'new-order', items: [] });

      const input = { userId: 'u1', items: [{ productId: 'p1', quantity: 1 }], idempotencyKey: 'idem-concurrent', stripePaymentIntentId: 'pi-con' };
      const [r1, r2] = await Promise.allSettled([
        orderRepository.createPendingPaymentOrder(input),
        orderRepository.createPendingPaymentOrder(input),
      ]);

      expect(r1.status).toBe('fulfilled');
      expect(r2.status).toBe('fulfilled');
      const values = [r1.value, r2.value].map((v) => v.replayed).sort();
      expect(values).toEqual([false, true]);
    });
  });

  describe('markPaidFromWebhook', () => {
    test('returns replayed=true on duplicate webhook event', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockRejectedValueOnce(Object.assign(new Error('dup-event'), { code: 'P2002' }));

      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt1', paymentIntentId: 'pi', orderId: 'o1', userId: 'u1', expectedIdempotencyKey: 'idem' }))
        .resolves.toEqual({ replayed: true, orderMarkedPaid: false });
    });

    test('normalizes event insertion failure (non-P2002)', async () => {
      const { orderRepository, tx, normalizeDbError } = await loadOrderRepository();
      const err = new Error('event store unavailable');
      tx.paymentWebhookEvent.create.mockRejectedValueOnce(err);

      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt2', paymentIntentId: 'pi', orderId: 'o1', userId: 'u1', expectedIdempotencyKey: 'idem' }))
        .rejects.toThrow(err);
      expect(normalizeDbError).toHaveBeenCalledWith(err, { repository: 'order', operation: 'markPaidFromWebhook' });
    });

    test('throws when order does not exist', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockResolvedValueOnce({ id: 'evt' });
      tx.order.findUnique.mockResolvedValueOnce(null);

      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt3', paymentIntentId: 'pi', orderId: 'o404', userId: 'u1', expectedIdempotencyKey: 'idem' }))
        .rejects.toMatchObject({ statusCode: 404, message: 'Order not found: o404' });
    });

    test('throws on identity/idempotency mismatch and already-paid order', async () => {
      const { orderRepository, tx } = await loadOrderRepository();

      tx.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt' });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u2', idempotencyKey: 'idem-x', status: 'pending' });
      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt4', paymentIntentId: 'pi', orderId: 'o1', userId: 'u1', expectedIdempotencyKey: 'idem' }))
        .rejects.toMatchObject({ statusCode: 400, message: 'Webhook metadata mismatch for order identity/idempotency' });

      tx.order.findUnique.mockResolvedValueOnce({ id: 'o1', userId: 'u1', idempotencyKey: 'idem', status: 'paid' });
      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt5', paymentIntentId: 'pi', orderId: 'o1', userId: 'u1', expectedIdempotencyKey: 'idem' }))
        .rejects.toMatchObject({ statusCode: 409, message: 'Order already paid: o1' });
    });

    test('marks paid with provided paymentIntent and fallback to existing one', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt' });
      tx.order.findUnique
        .mockResolvedValueOnce({ id: 'o1', userId: 'u1', idempotencyKey: 'idem', status: 'pending', stripePaymentIntentId: 'pi_old' })
        .mockResolvedValueOnce({ id: 'o1', userId: 'u1', idempotencyKey: 'idem', status: 'pending', stripePaymentIntentId: 'pi_old' });
      tx.order.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt6', paymentIntentId: 'pi_new', orderId: 'o1', userId: 'u1', expectedIdempotencyKey: 'idem', payload: { any: 1 } }))
        .resolves.toEqual({ replayed: false, orderMarkedPaid: true });
      expect(tx.order.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { status: 'paid', stripePaymentIntentId: 'pi_new' } }));

      await expect(orderRepository.markPaidFromWebhook({ eventId: 'evt7', paymentIntentId: null, orderId: 'o1', userId: 'u1', expectedIdempotencyKey: 'idem' }))
        .resolves.toEqual({ replayed: false, orderMarkedPaid: false });
      expect(tx.order.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { status: 'paid', stripePaymentIntentId: 'pi_old' } }));
    });
  });

  describe('processPaymentWebhookEvent', () => {
    test('duplicate webhook event returns replayed=true', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockRejectedValueOnce(Object.assign(new Error('dup-event'), { code: 'P2002' }));

      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt1', orderId: 'o1', payload: {} }))
        .resolves.toEqual({ replayed: true, orderMarkedPaid: false });
    });

    test('normalizes event creation failures and idempotency mismatch cases', async () => {
      const { orderRepository, tx, normalizeDbError } = await loadOrderRepository();

      const networkError = new Error('network unreachable');
      tx.paymentWebhookEvent.create.mockRejectedValueOnce(networkError);
      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt2', orderId: 'o1', payload: {} }))
        .rejects.toThrow(networkError);
      expect(normalizeDbError).toHaveBeenLastCalledWith(networkError, { repository: 'order', operation: 'processPaymentWebhookEvent' });

      tx.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt' });
      tx.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'o1', idempotencyKey: 'other', status: 'pending' });

      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt3', orderId: 'o1', payload: { metadata: { idempotencyKey: 'idem' } } }))
        .rejects.toMatchObject({ statusCode: 400, message: 'Webhook idempotency key mismatch' });
      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt4', orderId: 'o1', payload: { metadata: { idempotencyKey: 'idem' } } }))
        .rejects.toMatchObject({ statusCode: 400, message: 'Webhook idempotency key mismatch' });
    });

    test('throws conflict if idempotency metadata points to already-paid order', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockResolvedValueOnce({ id: 'evt' });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o1', idempotencyKey: 'idem', status: 'paid' });

      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt5', orderId: 'o1', payload: { metadata: { idempotencyKey: 'idem' } } }))
        .rejects.toMatchObject({ statusCode: 409, message: 'Order already paid: o1' });
    });

    test('updates by orderId when provided and by paymentIntent otherwise', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt' });
      tx.order.findUnique.mockResolvedValueOnce({ id: 'o1', idempotencyKey: 'idem', status: 'pending' });
      tx.order.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(orderRepository.processPaymentWebhookEvent({
        provider: 'stripe', eventId: 'evt6', orderId: 'o1', stripePaymentIntentId: 'pi1', payload: { metadata: { idempotencyKey: 'idem' } },
      })).resolves.toEqual({ replayed: false, orderMarkedPaid: true });
      expect(tx.order.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'o1', status: { not: 'paid' } },
        data: { status: 'paid', stripePaymentIntentId: 'pi1' },
      });

      await expect(orderRepository.processPaymentWebhookEvent({
        provider: 'stripe', eventId: 'evt7', orderId: null, stripePaymentIntentId: 'pi2', payload: {},
      })).resolves.toEqual({ replayed: false, orderMarkedPaid: false });
      expect(tx.order.updateMany).toHaveBeenNthCalledWith(2, {
        where: { stripePaymentIntentId: 'pi2', status: { not: 'paid' } },
        data: { status: 'paid', stripePaymentIntentId: 'pi2' },
      });
    });


    test('uses default args for orderId and stripePaymentIntentId when omitted', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockResolvedValueOnce({ id: 'evt' });
      tx.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt-defaults' }))
        .resolves.toEqual({ replayed: false, orderMarkedPaid: false });

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: null, status: { not: 'paid' } },
        data: { status: 'paid' },
      });
    });

    test('optional chaining falsey path: payload without metadata still updates', async () => {
      const { orderRepository, tx } = await loadOrderRepository();
      tx.paymentWebhookEvent.create.mockResolvedValueOnce({ id: 'evt' });
      tx.order.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(orderRepository.processPaymentWebhookEvent({ provider: 'stripe', eventId: 'evt8', orderId: 'o1', stripePaymentIntentId: null, payload: null }))
        .resolves.toEqual({ replayed: false, orderMarkedPaid: true });

      expect(tx.order.findUnique).not.toHaveBeenCalled();
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: { not: 'paid' } },
        data: { status: 'paid' },
      });
    });
  });
});