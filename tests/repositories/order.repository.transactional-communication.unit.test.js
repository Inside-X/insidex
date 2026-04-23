import { jest } from '@jest/globals';

async function loadOrderRepository() {
  jest.resetModules();

  const prismaMock = {
    orderEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback({
      orderEvent: {
        create: prismaMock.orderEvent.create,
      },
    })),
  };

  const normalizeDbError = jest.fn((error) => {
    throw error;
  });

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { orderRepository } = await import('../../src/repositories/order.repository.js');
  return { orderRepository, prismaMock, normalizeDbError };
}

describe('orderRepository transactional communication seam', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('records pending-confirmation communication intent with deterministic payload', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const event = { id: 'evt-comm-1' };
    prismaMock.orderEvent.create.mockResolvedValueOnce(event);

    await expect(orderRepository.recordPendingConfirmationCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-1',
      correlationId: 'cid-1',
      orderStatus: 'pending',
    })).resolves.toEqual({ duplicate: false, event });

    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: 'ord-1',
        type: 'customer_comm_pending_confirmation_candidate',
        fromStatus: 'pending',
        toStatus: 'pending',
        source: 'system',
        sourceEventId: 'comm.pending_confirmation.order:ord-1',
        correlationId: 'cid-1',
      },
    });
  });

  test.each([
    [{ code: 'P2002', meta: { target: ['source_event_id'] } }],
    [{ code: 'P2002' }],
  ])('dedupes pending-confirmation intent writes on unique conflicts: %j', async (errorShape) => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const err = Object.assign(new Error('duplicate event'), errorShape);
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordPendingConfirmationCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-1',
      orderStatus: 'pending',
    })).resolves.toEqual({ duplicate: true, event: null });
  });

  test('normalizes non-duplicate pending-confirmation persistence failure', async () => {
    const { orderRepository, prismaMock, normalizeDbError } = await loadOrderRepository();
    const err = Object.assign(new Error('write exploded'), { code: 'P5000' });
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordPendingConfirmationCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-1',
      orderStatus: 'pending',
    })).rejects.toThrow(err);

    expect(normalizeDbError).toHaveBeenCalledWith(err, {
      repository: 'order',
      operation: 'recordPendingConfirmationCommunicationIntent',
    });
  });

  test.each([
    [{}, 'orderId is required for communication intent'],
    [{ orderId: 'ord-1' }, 'sourceEventId is required for communication intent'],
    [{ orderId: 'ord-1', sourceEventId: 'comm.pending_confirmation.order:ord-1', orderStatus: 'paid' }, 'pending-confirmation communication requires pending order truth'],
  ])('rejects invalid pending-confirmation context: %j', async (input, expectedMessage) => {
    const { orderRepository } = await loadOrderRepository();
    await expect(orderRepository.recordPendingConfirmationCommunicationIntent(input)).rejects.toThrow(expectedMessage);
  });

  test('checks if under-review communication intent already exists', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    prismaMock.orderEvent.findFirst.mockResolvedValueOnce({ id: 'evt-existing' });

    await expect(orderRepository.hasUnderReviewCommunicationIntent({ orderId: 'ord-1' })).resolves.toBe(true);

    expect(prismaMock.orderEvent.findFirst).toHaveBeenCalledWith({
      where: { orderId: 'ord-1', type: 'customer_comm_under_review_candidate' },
      select: { id: true },
    });
  });

  test('returns false when under-review communication intent does not exist', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    prismaMock.orderEvent.findFirst.mockResolvedValueOnce(null);
    await expect(orderRepository.hasUnderReviewCommunicationIntent({ orderId: 'ord-1' })).resolves.toBe(false);
  });

  test('records under-review communication intent with deterministic payload', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const event = { id: 'evt-under-review-1' };
    prismaMock.orderEvent.create.mockResolvedValueOnce(event);

    await expect(orderRepository.recordUnderReviewCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.under_review.order:ord-1',
      correlationId: 'cid-2',
      orderStatus: 'processing_exception',
    })).resolves.toEqual({ duplicate: false, event });

    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: 'ord-1',
        type: 'customer_comm_under_review_candidate',
        fromStatus: 'processing_exception',
        toStatus: 'processing_exception',
        source: 'system',
        sourceEventId: 'comm.under_review.order:ord-1',
        correlationId: 'cid-2',
      },
    });
  });

  test.each([
    [{ code: 'P2002', meta: { target: ['source_event_id'] } }],
    [{ code: 'P2002' }],
  ])('dedupes under-review communication intent writes on unique conflicts: %j', async (errorShape) => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const err = Object.assign(new Error('duplicate under-review event'), errorShape);
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordUnderReviewCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.under_review.order:ord-1',
      orderStatus: 'processing_exception',
    })).resolves.toEqual({ duplicate: true, event: null });
  });

  test('normalizes non-duplicate under-review intent write failures', async () => {
    const { orderRepository, prismaMock, normalizeDbError } = await loadOrderRepository();
    const err = Object.assign(new Error('unexpected under-review insert failure'), { code: 'P5000' });
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordUnderReviewCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.under_review.order:ord-1',
      orderStatus: 'processing_exception',
    })).rejects.toThrow(err);

    expect(normalizeDbError).toHaveBeenCalledWith(err, {
      repository: 'order',
      operation: 'recordUnderReviewCommunicationIntent',
    });
  });

  test('records pending-confirmation supersession marker with deterministic payload', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    prismaMock.orderEvent.create.mockResolvedValueOnce({ id: 'evt-sup-1' });

    await expect(orderRepository.recordPendingConfirmationSupersession({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-1',
      correlationId: 'cid-sup-1',
      orderStatus: 'processing_exception',
    })).resolves.toEqual({ ok: true, duplicate: false });

    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: 'ord-1',
        type: 'customer_comm_pending_confirmation_superseded',
        fromStatus: 'pending',
        toStatus: 'processing_exception',
        source: 'system',
        sourceEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-1',
        correlationId: 'cid-sup-1',
      },
    });
  });

  test.each([
    [{ code: 'P2002', meta: { target: ['source_event_id'] } }],
    [{ code: 'P2002' }],
  ])('dedupes pending-confirmation supersession marker on unique conflicts: %j', async (errorShape) => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const err = Object.assign(new Error('duplicate supersession event'), errorShape);
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordPendingConfirmationSupersession({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-1',
      orderStatus: 'processing_exception',
    })).resolves.toEqual({ ok: true, duplicate: true });
  });

  test.each([
    [{}, 'orderId is required for communication intent', 'recordUnderReviewCommunicationIntent'],
    [{ orderId: 'ord-1' }, 'sourceEventId is required for communication intent', 'recordUnderReviewCommunicationIntent'],
    [{ orderId: 'ord-1', sourceEventId: 'comm.under_review.order:ord-1', orderStatus: 'pending' }, 'under-review communication requires under-review order truth', 'recordUnderReviewCommunicationIntent'],
    [{}, 'orderId is required for pending supersession', 'recordPendingConfirmationSupersession'],
    [{ orderId: 'ord-1' }, 'sourceEventId is required for pending supersession', 'recordPendingConfirmationSupersession'],
    [{ orderId: 'ord-1', sourceEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-1', orderStatus: 'paid' }, 'pending supersession requires under-review order truth', 'recordPendingConfirmationSupersession'],
  ])('rejects invalid under-review context: %j', async (input, expectedMessage, methodName) => {
    const { orderRepository } = await loadOrderRepository();
    await expect(orderRepository[methodName](input)).rejects.toThrow(expectedMessage);
  });
});
